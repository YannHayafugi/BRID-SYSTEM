"use client";

/** D23: card de uma "Ação" (processo) na página individual do órgão.
 * Recolhido mostra título + progresso; expandido mostra os mesmos controles
 * de edição do Follow-up (TR, Proposta, Aprovação, Ofício, Excluir) e a
 * timeline vertical de fases (ProcessoTimeline), sem sair da página. */
import { useState } from "react";
import Link from "next/link";
import { ETAPAS_FLUXO } from "@/lib/processos/etapas";
import ProcessoTimeline, { HistoricoEtapaTL } from "./ProcessoTimeline";
import Modal from "./Modal";
import AnaliseTRConteudo from "./AnaliseTRConteudo";

export interface AcaoProcesso {
  id: string;
  titulo: string;
  data: string;
  etapa: number;
  documentos: { oficio?: { nome: string } };
  arquivos: string[];
  cadastro_tr_id: string | null;
  cadastro_tr_status: "em_analise" | "concluida" | null;
  proposta_aprovada: boolean;
  historico_etapas: HistoricoEtapaTL[];
  criado_por: { id: string | null; nome: string } | null;
}

function hoje() { return new Date().toISOString().slice(0, 10); }

export default function AcaoProcessoCard({
  processo,
  orgaoId,
  perfil,
  onAtualizado,
}: {
  processo: AcaoProcesso;
  orgaoId: string;
  /** D48: admin troca para qualquer fase; editor só avança; visualizador não troca */
  perfil: "admin" | "editor" | "visualizador";
  onAtualizado: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [aprovando, setAprovando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [etapaPendente, setEtapaPendente] = useState<number | null>(null);
  const [dataAutenticacao, setDataAutenticacao] = useState(hoje());
  const [confirmando, setConfirmando] = useState(false);
  // D40: "Analisar TR" abre em modal, em vez de navegar para /tr-analise
  const [modalAnaliseTr, setModalAnaliseTr] = useState(false);

  const p = processo;
  const temTR = p.arquivos.includes("tr");
  const temProposta = p.arquivos.includes("proposta");
  const temOficio = !!p.documentos?.oficio;
  const pct = ETAPAS_FLUXO.length ? Math.round(((p.etapa + 1) / ETAPAS_FLUXO.length) * 100) : 0;

  async function enviarTR(arquivo: File) {
    setEnviando(true);
    const fd = new FormData();
    fd.append("arquivo", arquivo);
    try {
      const r = await fetch(`/api/processos/${p.id}/tr`, { method: "POST", body: fd });
      if (!r.ok) alert((await r.json()).erro || "Erro ao enviar o TR.");
      onAtualizado();
    } finally {
      setEnviando(false);
    }
  }

  async function gerarProposta() {
    setGerando(true);
    try {
      const r = await fetch(`/api/processos/${p.id}/gerar`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro || "Falha na geração.");
    } catch (err) {
      alert(`❌ ${err instanceof Error ? err.message : err}`);
    } finally {
      setGerando(false);
      onAtualizado();
    }
  }

  async function aprovarProposta() {
    setAprovando(true);
    try {
      const r = await fetch(`/api/processos/${p.id}/aprovar`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).erro || "Falha ao aprovar a proposta.");
      onAtualizado();
    } catch (err) {
      alert(`❌ ${err instanceof Error ? err.message : err}`);
    } finally {
      setAprovando(false);
    }
  }

  function pedirEtapa(etapa: number) {
    setDataAutenticacao(hoje());
    setEtapaPendente(etapa);
  }

  async function confirmarEtapa() {
    if (etapaPendente === null) return;
    if (!dataAutenticacao) { alert("Informe a data de autenticação."); return; }
    setConfirmando(true);
    try {
      const r = await fetch(`/api/processos/${p.id}/etapa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapa: etapaPendente, dataAutenticacao }),
      });
      if (!r.ok) { alert((await r.json()).erro || "Erro ao mudar a fase."); return; }
      setEtapaPendente(null);
      onAtualizado();
    } finally {
      setConfirmando(false);
    }
  }

  async function excluir() {
    if (!confirm(`Excluir o processo "${p.titulo}"?\n\nOs arquivos gerados dele também serão removidos.`)) return;
    const r = await fetch(`/api/processos/${p.id}`, { method: "DELETE" });
    if (!r.ok) alert((await r.json()).erro || "Erro ao excluir.");
    onAtualizado();
  }

  return (
    <div style={{ background: "var(--bg-suave)", borderRadius: 8, border: "1px solid var(--borda)" }}>
      <div
        onClick={() => setAberto((v) => !v)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 12px", cursor: "pointer" }}
        title={aberto ? "Recolher" : "Expandir para editar este processo"}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 13 }}>{aberto ? "▾" : "▸"} {p.titulo}</strong>
          {ETAPAS_FLUXO.length > 0 && p.etapa === ETAPAS_FLUXO.length - 1 && (
            <span className="fu-badge finalizado" title="Processo concluiu todas as fases do fluxo (100%)">✅ Finalizado</span>
          )}
          {p.criado_por && (
            <span className="detalhe">criado por {p.criado_por.nome}</span>
          )}
          <div className="fu-progresso" style={{ margin: "6px 0" }}>
            <div className="fu-barra" style={{ width: `${pct}%` }} />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
            <span className={`detalhe ${temTR ? "" : "pendente"}`}>{temTR ? "✅ TR" : "⏳ TR"}</span>
            <span className={`detalhe ${temProposta ? "" : "pendente"}`}>{temProposta ? "✅ Proposta" : "⏳ Proposta"}</span>
            <span className={`detalhe ${temOficio ? "" : "pendente"}`}>
              {temOficio ? "✅ Ofício" : p.proposta_aprovada ? "⏳ Ofício" : "🔒 Ofício"}
            </span>
          </div>
        </div>
        <span className="detalhe" style={{ fontSize: 12 }}>{pct}%</span>
      </div>

      {aberto && (
        <div style={{ padding: "0 12px 14px", borderTop: "1px solid var(--borda)" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 0 2px" }}>
            <button type="button" className="fu-icone-btn lixeira" onClick={excluir} title="Excluir este processo e seus arquivos">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" /><path d="M14 11v6" />
              </svg>
            </button>
          </div>

          <div style={{ marginBottom: 14 }}>
            <span className="detalhe" style={{ fontWeight: 600 }}>Documentos essenciais (TR → Proposta → Ofício):</span>
            <div className="downloads" style={{ marginTop: 6 }}>
              {temTR ? (
                <>
                  <a className="btn-dl btn-sec" href={`/api/processos/${p.id}/download/tr`} title="TR enviado — clique para baixar">📎 TR (enviado)</a>
                  <label className="btn-doc" title="Enviar outro arquivo no lugar do TR atual">
                    ↻ Substituir TR
                    <input type="file" hidden accept=".pdf,.docx,.txt,.md" disabled={enviando}
                      onChange={(e) => e.target.files?.[0] && enviarTR(e.target.files[0])} />
                  </label>
                  <button type="button"
                    className={p.cadastro_tr_status === "em_analise" ? "btn-doc destaque" : "btn-doc"}
                    onClick={() => setModalAnaliseTr(true)}
                    title={
                      p.cadastro_tr_status === "em_analise"
                        ? "A IA já analisou este TR — falta revisar e gerar o relatório final"
                        : "Auditar o TR com IA"
                    }>
                    {p.cadastro_tr_status === "em_analise"
                      ? "📝 Pré-análise pronta"
                      : `🔍 Analisar TR${p.cadastro_tr_status === "concluida" ? " ✓" : ""}`}
                  </button>
                </>
              ) : (
                <label className="btn-doc pendente" title="Enviar o Termo de Referência (PDF, DOCX ou TXT)">
                  ＋ Enviar TR
                  <input type="file" hidden accept=".pdf,.docx,.txt,.md" disabled={enviando}
                    onChange={(e) => e.target.files?.[0] && enviarTR(e.target.files[0])} />
                </label>
              )}

              {temProposta ? (
                <>
                  <a className="btn-dl btn-sec" href={`/api/processos/${p.id}/download/proposta`} title="Baixar a proposta gerada (.docx)">📎 Proposta</a>
                  <a className="btn-dl btn-sec" href={`/api/processos/${p.id}/download/resumo`} title="Baixar o resumo executivo (.docx)">📎 Resumo</a>
                  {!p.proposta_aprovada && (
                    <button type="button" className="btn-doc" disabled={aprovando} onClick={aprovarProposta}
                      title="Aprovar a Proposta — libera a emissão do Ofício">
                      {aprovando ? "Aprovando..." : "✅ Aprovar Proposta"}
                    </button>
                  )}
                </>
              ) : temTR ? (
                <button type="button" className="btn-doc" disabled={gerando} onClick={gerarProposta}
                  title="Analisar o TR com IA e gerar Proposta + Resumo com timbrado FIA (30–90 s)">
                  {gerando ? "⏳ Gerando... (30–90 s)" : "⚙ Gerar Proposta"}
                </button>
              ) : (
                <span className="btn-doc pendente" title="Envie o TR primeiro">Proposta (envie o TR primeiro)</span>
              )}

              {temOficio ? (
                <a className="btn-dl btn-sec" href={`/api/processos/${p.id}/download/oficio`} title="Baixar o ofício deste processo">📎 Ofício</a>
              ) : p.proposta_aprovada ? (
                <Link className="btn-doc" href={`/oficio?processo=${p.id}`} title="Emitir o Ofício — a Proposta já foi aprovada">📝 Gerar Ofício</Link>
              ) : (
                <span className="btn-doc pendente" title="Aprove a Proposta para liberar o Ofício">Ofício liberado após aprovação da Proposta</span>
              )}
            </div>
          </div>

          <span className="detalhe" style={{ fontWeight: 600, display: "block", marginBottom: 8 }}>
            Linha do tempo das fases:
            {perfil === "editor" && " (você pode avançar para a próxima fase)"}
            {perfil === "visualizador" && " (somente administradores e editores trocam a fase)"}
          </span>
          <ProcessoTimeline
            etapas={ETAPAS_FLUXO}
            etapaAtual={p.etapa}
            historico={p.historico_etapas}
            bloqueado={etapaPendente !== null || perfil === "visualizador"}
            livre={perfil === "admin"}
            apenasProxima={perfil === "editor"}
            onSelecionar={perfil === "visualizador" ? () => {} : pedirEtapa}
          />

          {etapaPendente !== null && (
            <div style={{
              display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
              background: "var(--primaria-claro)", border: "1px solid var(--primaria)",
              borderRadius: 8, padding: 8, marginTop: 4,
            }}>
              <label className="detalhe" style={{ margin: 0 }}>
                📅 Data de autenticação para &quot;{ETAPAS_FLUXO[etapaPendente]?.nome}&quot;:
              </label>
              <input type="date" value={dataAutenticacao} max={hoje()}
                onChange={(e) => setDataAutenticacao(e.target.value)} style={{ marginBottom: 0, width: 150 }} />
              <button type="button" className="btn-azul" disabled={confirmando} onClick={confirmarEtapa}>
                {confirmando ? "Confirmando..." : "Confirmar"}
              </button>
              <button type="button" className="btn-doc" onClick={() => setEtapaPendente(null)}>Cancelar</button>
            </div>
          )}
        </div>
      )}

      {modalAnaliseTr && (
        <Modal titulo="Análise de Termo de Referência" onFechar={() => setModalAnaliseTr(false)}>
          <AnaliseTRConteudo orgaoId={orgaoId} processoId={p.id} onFinalizado={onAtualizado} />
        </Modal>
      )}
    </div>
  );
}

"use client";

/**
 * Follow-up — acompanhamento dos processos pelas macrofases do fluxo.
 * Portado do app Vite (D10 híbrido). Fases 🤖 avançam pelos documentos;
 * fases ✋ são selecionáveis. Cliente = órgão cadastrado (D6/D13), com
 * atalho de cadastro inline. Análise de TR pelo card (D12).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Etapa { nome: string; tipo: "auto" | "manual" }
interface Orgao { id: string; razao_social: string; tipo_ente?: string; cidade?: string; uf?: string }
interface Processo {
  id: string; titulo: string; orgao: Orgao | null; data: string; tr_nome: string;
  etapa: number; documentos: { oficio?: { nome: string } }; arquivos: string[];
  cadastro_tr_id: string | null;
}
interface Oficio { id: string; assunto: string; destinatario: string; data: string }

function fmtData(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function FollowupPage() {
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [oficios, setOficios] = useState<Oficio[]>([]);
  const [orgaos, setOrgaos] = useState<Orgao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [gerando, setGerando] = useState<string | null>(null);

  // formulário "abrir novo processo"
  const [titulo, setTitulo] = useState("");
  const [orgaoId, setOrgaoId] = useState("");
  const [oficioId, setOficioId] = useState("");
  const [arquivoOficio, setArquivoOficio] = useState<File | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  // atalho de cadastro de órgão (D13)
  const [novoOrgao, setNovoOrgao] = useState(false);
  const [noTipo, setNoTipo] = useState("Município");
  const [noRazao, setNoRazao] = useState("");
  const [noCidade, setNoCidade] = useState("");
  const [noUf, setNoUf] = useState("SP");

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const [rp, ro, rg] = await Promise.all([
        fetch("/api/processos"),
        fetch("/api/oficios"),
        fetch("/api/orgaos"),
      ]);
      if (rp.status === 401) { window.location.href = "/login"; return; }
      const dp = await rp.json();
      setProcessos(dp.processos || []);
      setEtapas(dp.etapas || []);
      setOficios((await ro.json()).oficios || []);
      setOrgaos((await rg.json()).orgaos || []);
    } catch {
      setErro("Falha ao carregar os processos.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function selecionarOficio(id: string) {
    setOficioId(id);
    const o = oficios.find((x) => x.id === id);
    if (o) {
      setTitulo(o.assunto || "");
      setArquivoOficio(null);
    }
  }

  async function cadastrarOrgao() {
    if (!noRazao.trim() || !noCidade.trim()) { alert("Preencha razão social e cidade."); return; }
    const r = await fetch("/api/orgaos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo_ente: noTipo, razao_social: noRazao, cidade: noCidade, uf: noUf, contatos: [] }),
    });
    const d = await r.json();
    if (!r.ok) { alert(d.erro || "Falha ao cadastrar órgão."); return; }
    await carregar();
    if (d.orgao?.id) setOrgaoId(d.orgao.id);
    setNovoOrgao(false);
    setNoRazao(""); setNoCidade("");
  }

  async function abrirProcesso(e: React.FormEvent) {
    e.preventDefault();
    setAbrindo(true);
    try {
      const fd = new FormData();
      fd.append("titulo", titulo);
      fd.append("orgao_id", orgaoId);
      fd.append("oficio_id", oficioId);
      if (!oficioId && arquivoOficio) fd.append("arquivo", arquivoOficio);
      const r = await fetch("/api/processos", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro || "Falha ao abrir o processo.");
      setTitulo(""); setOrgaoId(""); setOficioId(""); setArquivoOficio(null);
      await carregar();
    } catch (err) {
      alert(`❌ ${err instanceof Error ? err.message : err}`);
    } finally {
      setAbrindo(false);
    }
  }

  async function mudarEtapa(id: string, etapa: number) {
    const r = await fetch(`/api/processos/${id}/etapa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etapa }),
    });
    if (!r.ok) alert((await r.json()).erro || "Erro ao mudar a fase.");
    carregar();
  }

  async function enviarTR(id: string, arquivo: File) {
    const fd = new FormData();
    fd.append("arquivo", arquivo);
    const r = await fetch(`/api/processos/${id}/tr`, { method: "POST", body: fd });
    if (!r.ok) alert((await r.json()).erro || "Erro ao enviar o TR.");
    carregar();
  }

  async function gerarProposta(id: string) {
    setGerando(id);
    try {
      const r = await fetch(`/api/processos/${id}/gerar`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro || "Falha na geração.");
    } catch (err) {
      alert(`❌ ${err instanceof Error ? err.message : err}`);
    } finally {
      setGerando(null);
      carregar();
    }
  }

  async function excluir(p: Processo) {
    if (!confirm(`Excluir o processo "${p.titulo}"?\n\nOs arquivos gerados dele também serão removidos.`)) return;
    const r = await fetch(`/api/processos/${p.id}`, { method: "DELETE" });
    if (!r.ok) alert((await r.json()).erro || "Erro ao excluir.");
    carregar();
  }

  return (
    <div className="page-larga">
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>Follow-up</h1>
      <p className="detalhe" style={{ marginBottom: 20 }}>
        O processo abre com o Ofício; TR e Proposta entram nas fases seguintes.
      </p>

      {/* Abrir novo processo */}
      <form className="item item-col form-projeto" onSubmit={abrirProcesso} style={{ marginBottom: 24 }}>
        <strong>Abrir novo processo</strong>

        <select value={oficioId} onChange={(e) => selecionarOficio(e.target.value)}
          title="Escolher um ofício já gerado — o título se preenche sozinho"
          style={{ background: "var(--primaria-claro)", borderColor: "var(--primaria)" }}>
          <option value="">— Selecionar ofício gerado (preenche o título) —</option>
          {oficios.map((o) => (
            <option key={o.id} value={o.id}>
              {o.assunto || "Sem assunto"} — {o.destinatario} ({fmtData(o.data)})
            </option>
          ))}
        </select>

        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required
          placeholder="Título do processo *" title="Nome do processo no Follow-up" />

        <div style={{ display: "flex", gap: 10, width: "100%", alignItems: "center" }}>
          <select value={orgaoId} onChange={(e) => setOrgaoId(e.target.value)} style={{ flex: 1, marginBottom: 0 }}
            title="Cliente do processo — órgão do cadastro central (D6)">
            <option value="">— Cliente / órgão (opcional) —</option>
            {orgaos.map((o) => (
              <option key={o.id} value={o.id}>{o.razao_social} ({o.cidade}/{o.uf})</option>
            ))}
          </select>
          <button type="button" className="btn-doc" onClick={() => setNovoOrgao(!novoOrgao)}
            title="Cadastrar um órgão sem sair desta tela">＋ Novo órgão</button>
        </div>

        {novoOrgao && (
          <div style={{ display: "flex", gap: 8, width: "100%", flexWrap: "wrap", background: "#f8fafc", padding: 12, borderRadius: 8 }}>
            <select value={noTipo} onChange={(e) => setNoTipo(e.target.value)} style={{ width: 130, marginBottom: 0 }}>
              <option>Município</option><option>Estado</option>
            </select>
            <input value={noRazao} onChange={(e) => setNoRazao(e.target.value)} placeholder="Razão social *" style={{ flex: 2, minWidth: 180, marginBottom: 0 }} />
            <input value={noCidade} onChange={(e) => setNoCidade(e.target.value)} placeholder="Cidade *" style={{ flex: 1, minWidth: 120, marginBottom: 0 }} />
            <input value={noUf} onChange={(e) => setNoUf(e.target.value.toUpperCase().slice(0, 2))} placeholder="UF" style={{ width: 60, marginBottom: 0 }} />
            <button type="button" className="btn-azul" onClick={cadastrarOrgao}>Salvar órgão</button>
          </div>
        )}

        <div className="downloads">
          <label className="btn-doc" title="Anexar um ofício que não foi gerado pelo sistema">
            ＋ Anexar ofício externo (opcional)
            <input type="file" hidden accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg"
              onChange={(e) => { setArquivoOficio(e.target.files?.[0] || null); setOficioId(""); }} />
          </label>
          {arquivoOficio && <span className="detalhe">📎 {arquivoOficio.name}</span>}
        </div>

        <button type="submit" className="btn-azul" disabled={abrindo}
          title="Criar o processo na fase 'Abertura do processo (Ofício)'">
          {abrindo ? "Abrindo..." : "Abrir processo"}
        </button>

        <div className="downloads" style={{ borderTop: "1px solid var(--borda)", paddingTop: 12, width: "100%" }}>
          <Link href="/oficio" className="btn-doc" title="Abrir o Gerador de Ofício">📝 Gerar Ofício →</Link>
        </div>
      </form>

      {/* Cards dos processos */}
      {carregando && <p className="vazio">Carregando...</p>}
      {erro && <p className="vazio">❌ {erro}</p>}
      {!carregando && !processos.length && <p className="vazio">Nenhum processo aberto ainda.</p>}

      {processos.map((p) => {
        const et = etapas[p.etapa] || { nome: "-", tipo: "manual" };
        const pct = etapas.length ? Math.round(((p.etapa + 1) / etapas.length) * 100) : 0;
        const temTR = p.arquivos.includes("tr");
        const temProposta = p.arquivos.includes("proposta");
        const temOficio = !!p.documentos?.oficio;
        return (
          <div className="item item-col" key={p.id}>
            <div className="fu-topo">
              <button type="button" className="fu-excluir" onClick={() => excluir(p)}
                title="Excluir este processo e seus arquivos">🗑</button>
              <strong>{p.titulo}</strong>
              <span className={`fu-badge ${et.tipo}`}
                title={et.tipo === "auto" ? "Fase coberta pela automação de documentos" : "Fase conduzida manualmente"}>
                {et.tipo === "auto" ? "🤖 Automatizada" : "✋ Manual"}
              </span>
              <span className="detalhe">
                {p.orgao ? `${p.orgao.razao_social} — ` : ""}{fmtData(p.data)}
              </span>
            </div>

            <div className="fu-progresso" title={`Progresso: fase ${p.etapa + 1} de ${etapas.length}`}>
              <div className="fu-barra" style={{ width: `${pct}%` }} />
            </div>

            <select className="fu-etapa" value={p.etapa} onChange={(e) => mudarEtapa(p.id, Number(e.target.value))}
              title="Fases 🤖 avançam sozinhas conforme os documentos; selecione apenas as fases manuais ✋">
              {etapas.map((e2, i) => (
                <option key={i} value={i} disabled={e2.tipo === "auto"}>
                  {i + 1}. {e2.nome} {e2.tipo === "auto" ? "🤖 (automática)" : "✋"}
                </option>
              ))}
            </select>

            <div style={{ width: "100%" }}>
              <span className="detalhe">Documentos essenciais:</span>
              <div className="downloads">
                {temOficio ? (
                  <a className="btn-dl btn-sec" href={`/api/processos/${p.id}/download/oficio`}
                    title="Baixar o ofício deste processo">📎 Ofício</a>
                ) : (
                  <span className="btn-doc pendente" title="Abra o processo pelo drop de ofícios ou anexe um externo">Ofício pendente</span>
                )}

                {temTR ? (
                  <>
                    <a className="btn-dl btn-sec" href={`/api/processos/${p.id}/download/tr`}
                      title="TR enviado — clique para baixar">📎 TR (enviado)</a>
                    <label className="btn-doc" title="Enviar outro arquivo no lugar do TR atual">
                      ↻ Substituir TR
                      <input type="file" hidden accept=".pdf,.docx,.txt,.md"
                        onChange={(e) => e.target.files?.[0] && enviarTR(p.id, e.target.files[0])} />
                    </label>
                    {p.orgao?.id ? (
                      <Link className="btn-doc" href={`/tr-analise?orgao=${p.orgao.id}&processo=${p.id}`}
                        title="Auditar o TR com IA — os achados ficam vinculados e alimentam a geração da proposta (D8)">
                        🔍 Analisar TR{p.cadastro_tr_id ? " ✓" : ""}
                      </Link>
                    ) : (
                      <span className="btn-doc pendente" title="Defina o órgão (cliente) do processo para analisar o TR">
                        🔍 Análise exige órgão
                      </span>
                    )}
                  </>
                ) : (
                  <label className="btn-doc pendente" title="Enviar o Termo de Referência (PDF, DOCX ou TXT)">
                    ＋ Enviar TR
                    <input type="file" hidden accept=".pdf,.docx,.txt,.md"
                      onChange={(e) => e.target.files?.[0] && enviarTR(p.id, e.target.files[0])} />
                  </label>
                )}

                {temProposta ? (
                  <>
                    <a className="btn-dl btn-sec" href={`/api/processos/${p.id}/download/proposta`}
                      title="Baixar a proposta gerada (.docx)">📎 Proposta</a>
                    <a className="btn-dl btn-sec" href={`/api/processos/${p.id}/download/resumo`}
                      title="Baixar o resumo executivo (.docx)">📎 Resumo</a>
                  </>
                ) : temTR ? (
                  <button type="button" className="btn-doc" disabled={gerando === p.id}
                    onClick={() => gerarProposta(p.id)}
                    title="Analisar o TR com IA e gerar Proposta + Resumo com timbrado FIA (30–90 s)">
                    {gerando === p.id ? "⏳ Gerando... (30–90 s)" : "⚙ Gerar Proposta"}
                  </button>
                ) : (
                  <span className="btn-doc pendente" title="Envie o TR primeiro">Proposta (envie o TR primeiro)</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

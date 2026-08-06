"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Achado } from "@/lib/tr/types";
import { itensSemAchados } from "@/lib/tr/regras";

interface CadastroDetalhe {
  id: string;
  classificacao: string;
  nome_ente: string;
  uf: string;
  nome_responsavel: string;
  cargo: string;
  telefone: string | null;
  email: string;
  nome_arquivo_tr: string;
  status: string;
  resultado_bruto_ia: any;
  created_at: string;
}

interface AchadoRow {
  id: string;
  achado_id: string;
  item_numero: string;
  titulo: string;
  texto: string;
  comentario_obrigatorio: boolean;
  ciente: boolean;
  comentario: string | null;
}

export default function HistoricoDetalhePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [cadastro, setCadastro] = useState<CadastroDetalhe | null>(null);
  const [achadosRows, setAchadosRows] = useState<AchadoRow[]>([]);
  // D50: permissões derivadas do perfil — admin edita/exclui tudo; editor
  // edita e solicita exclusão ao admin; visualizador só consulta.
  const [perfil, setPerfil] = useState<"admin" | "editor" | "visualizador">("visualizador");
  const podeEditar = perfil === "admin" || perfil === "editor";
  const podeExcluir = perfil === "admin";
  const [solicitacaoPendente, setSolicitacaoPendente] = useState<{
    id: string; motivo: string | null; solicitante: string;
  } | null>(null);
  const [solicitando, setSolicitando] = useState(false);
  const [decidindo, setDecidindo] = useState(false);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [justificativas, setJustificativas] = useState<Record<string, string>>({});
  const [feedbackPorAchado, setFeedbackPorAchado] = useState<
    Record<string, { tipo: "ok" | "erro"; texto: string } | undefined>
  >({});
  const [historicoAberto, setHistoricoAberto] = useState<Record<string, boolean>>({});
  const [historicoDados, setHistoricoDados] = useState<Record<string, any[]>>({});
  const [carregandoHistorico, setCarregandoHistorico] = useState<Record<string, boolean>>({});

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const supabase = getSupabaseBrowserClient();

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace(`/login?proximo=/historico/${params.id}`);
        return;
      }

      const { data: meuProfile } = await supabase
        .from("gp_profiles")
        .select("perfil")
        .eq("id", userData.user.id)
        .single();
      if (meuProfile) {
        setPerfil(
          meuProfile.perfil === "admin" || meuProfile.perfil === "editor"
            ? meuProfile.perfil
            : "visualizador"
        );
      }

      // D50: há solicitação de exclusão pendente para esta análise?
      const { data: solic } = await supabase
        .from("gp_solicitacoes_exclusao")
        .select("id, motivo, solicitante:solicitado_por(nome_completo, email)")
        .eq("cadastro_id", params.id)
        .eq("status", "pendente")
        .maybeSingle();
      setSolicitacaoPendente(
        solic
          ? {
              id: solic.id,
              motivo: solic.motivo,
              solicitante:
                (solic.solicitante as any)?.nome_completo || (solic.solicitante as any)?.email || "usuário",
            }
          : null
      );

      const { data: cad, error: erroCad } = await supabase
        .from("gp_cadastros_tr")
        .select("*")
        .eq("id", params.id)
        .single();
      if (erroCad || !cad) throw new Error(erroCad?.message || "Cadastro não encontrado.");
      setCadastro(cad);

      const { data: achados, error: erroAchados } = await supabase
        .from("gp_achados_tr")
        .select("*")
        .eq("cadastro_id", params.id)
        .order("created_at", { ascending: true });
      if (erroAchados) throw new Error(erroAchados.message);
      setAchadosRows(achados || []);
    } catch (err: any) {
      setErro(err.message || "Erro ao carregar a análise.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  function atualizarLocal(id: string, campos: Partial<AchadoRow>) {
    setAchadosRows((prev) => prev.map((a) => (a.id === id ? { ...a, ...campos } : a)));
  }

  async function salvarAchado(row: AchadoRow) {
    const justificativa = (justificativas[row.id] || "").trim();
    if (!justificativa) {
      setFeedbackPorAchado((prev) => ({
        ...prev,
        [row.id]: { tipo: "erro", texto: "Informe a justificativa da edição antes de salvar." },
      }));
      return;
    }

    setSalvandoId(row.id);
    setFeedbackPorAchado((prev) => ({ ...prev, [row.id]: undefined }));
    try {
      const resp = await fetch(`/api/tr/achados/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ciente: row.ciente, comentario: row.comentario, justificativa }),
      });
      const dados = await resp.json();
      if (!resp.ok) throw new Error(dados.erro || "Falha ao salvar.");

      setFeedbackPorAchado((prev) => ({
        ...prev,
        [row.id]: { tipo: "ok", texto: `Alteração salva como versão ${dados.versao}.` },
      }));
      setJustificativas((prev) => ({ ...prev, [row.id]: "" }));
      if (historicoAberto[row.id]) {
        carregarHistorico(row.id);
      }
    } catch (err: any) {
      setFeedbackPorAchado((prev) => ({
        ...prev,
        [row.id]: {
          tipo: "erro",
          texto: err.message || "Falha ao salvar (verifique se você tem permissão de edição).",
        },
      }));
    } finally {
      setSalvandoId(null);
    }
  }

  async function carregarHistorico(achadoId: string) {
    setCarregandoHistorico((prev) => ({ ...prev, [achadoId]: true }));
    try {
      const resp = await fetch(`/api/tr/achados/${achadoId}`);
      const dados = await resp.json();
      if (!resp.ok) throw new Error(dados.erro || "Falha ao carregar histórico.");
      setHistoricoDados((prev) => ({ ...prev, [achadoId]: dados.historico }));
    } catch (err: any) {
      setErro(err.message || "Falha ao carregar histórico de versões.");
    } finally {
      setCarregandoHistorico((prev) => ({ ...prev, [achadoId]: false }));
    }
  }

  function alternarHistorico(achadoId: string) {
    const abrindo = !historicoAberto[achadoId];
    setHistoricoAberto((prev) => ({ ...prev, [achadoId]: abrindo }));
    if (abrindo && !historicoDados[achadoId]) {
      carregarHistorico(achadoId);
    }
  }

  // D50: editor solicita a exclusão; admin decide.
  async function solicitarExclusao() {
    const motivo = window.prompt("Motivo da exclusão (será mostrado ao administrador):");
    if (motivo === null) return;
    setSolicitando(true);
    setErro(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("gp_solicitacoes_exclusao").insert({
        cadastro_id: params.id,
        descricao_cadastro: cadastro
          ? `${cadastro.classificacao} de ${cadastro.nome_ente} — ${cadastro.nome_arquivo_tr}`
          : params.id,
        solicitado_por: userData.user!.id,
        motivo: motivo.trim() || null,
      });
      if (error) throw new Error(error.message);
      await carregar();
    } catch (err: any) {
      setErro(err.message || "Falha ao registrar a solicitação.");
    } finally {
      setSolicitando(false);
    }
  }

  async function decidirSolicitacao(aprovar: boolean) {
    if (!solicitacaoPendente) return;
    if (aprovar && !window.confirm("Aprovar e excluir esta análise? Essa ação não pode ser desfeita.")) return;
    setDecidindo(true);
    setErro(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: userData } = await supabase.auth.getUser();
      const { error: erroDecisao } = await supabase
        .from("gp_solicitacoes_exclusao")
        .update({
          status: aprovar ? "aprovada" : "recusada",
          decidido_por: userData.user!.id,
          decidido_em: new Date().toISOString(),
        })
        .eq("id", solicitacaoPendente.id);
      if (erroDecisao) throw new Error(erroDecisao.message);
      if (aprovar) {
        const { error } = await supabase.from("gp_cadastros_tr").delete().eq("id", params.id);
        if (error) throw new Error(error.message);
        router.push("/historico");
        return;
      }
      await carregar();
    } catch (err: any) {
      setErro(err.message || "Falha ao registrar a decisão.");
    } finally {
      setDecidindo(false);
    }
  }

  async function excluirCadastro() {
    if (!window.confirm("Tem certeza que deseja excluir esta análise? Essa ação não pode ser desfeita.")) {
      return;
    }
    setExcluindo(true);
    setErro(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from("gp_cadastros_tr").delete().eq("id", params.id);
      if (error) throw new Error(error.message);
      router.push("/historico");
    } catch (err: any) {
      setErro(err.message || "Falha ao excluir (verifique se você tem permissão).");
      setExcluindo(false);
    }
  }

  if (carregando) {
    return (
      <main>
        <div className="page">
          <p>Carregando...</p>
        </div>
      </main>
    );
  }

  if (!cadastro) {
    return (
      <main>
        <div className="page">
          <p className="msg erro">{erro || "Análise não encontrada."}</p>
          <Link href="/historico">← voltar ao histórico</Link>
        </div>
      </main>
    );
  }

  const mensagensOk = cadastro.resultado_bruto_ia
    ? itensSemAchados(
        cadastro.resultado_bruto_ia,
        achadosRows.map(
          (a): Achado => ({
            id: a.achado_id,
            itemNumero: a.item_numero,
            titulo: a.titulo,
            texto: a.texto,
            tipo: "atencao",
            comentarioObrigatorio: a.comentario_obrigatorio,
          })
        )
      )
    : [];

  return (
    <main>
      <header className="topo">
        <h1>
          Análise — {cadastro.classificacao} de {cadastro.nome_ente}
        </h1>
      </header>

      <div className="page">
        <p style={{ marginBottom: 20 }}>
          <Link href="/historico">← voltar ao histórico</Link>
        </p>

        <section className="card">
          <h2>Dados do cadastro</h2>
          <p>
            <strong>Responsável:</strong> {cadastro.nome_responsavel} ({cadastro.cargo})
            <br />
            <strong>Contato:</strong> {cadastro.email}
            {cadastro.telefone ? ` · ${cadastro.telefone}` : ""}
            <br />
            <strong>Arquivo do TR:</strong> {cadastro.nome_arquivo_tr}
            <br />
            <strong>Data:</strong> {new Date(cadastro.created_at).toLocaleString("pt-BR")}
          </p>
          {solicitacaoPendente && (
            <div className="item-analise" style={{ borderLeft: "3px solid var(--primaria)", marginTop: 10 }}>
              <strong style={{ fontSize: 13 }}>🗑 Exclusão solicitada por {solicitacaoPendente.solicitante}</strong>
              {solicitacaoPendente.motivo && (
                <p className="item-analise-resumo">Motivo: {solicitacaoPendente.motivo}</p>
              )}
              {perfil === "admin" ? (
                <div className="actions">
                  <button className="btn secondary" disabled={decidindo} onClick={() => decidirSolicitacao(true)}>
                    {decidindo ? "Processando..." : "✅ Aprovar e excluir"}
                  </button>
                  <button className="btn secondary" disabled={decidindo} onClick={() => decidirSolicitacao(false)}>
                    ❌ Recusar
                  </button>
                </div>
              ) : (
                <p className="item-analise-resumo">Aguardando decisão de um administrador.</p>
              )}
            </div>
          )}
          {podeExcluir && !solicitacaoPendente && (
            <div className="actions">
              <button className="btn secondary" onClick={excluirCadastro} disabled={excluindo}>
                {excluindo ? "Excluindo..." : "Excluir análise"}
              </button>
            </div>
          )}
          {perfil === "editor" && !solicitacaoPendente && (
            <div className="actions">
              <button className="btn secondary" onClick={solicitarExclusao} disabled={solicitando}
                title="A exclusão precisa ser aprovada por um administrador">
                {solicitando ? "Enviando..." : "🗑 Solicitar exclusão ao administrador"}
              </button>
            </div>
          )}
          {erro && <p className="msg erro">{erro}</p>}
        </section>

        <section className="card">
          <h2>Achados que exigiram atenção ({achadosRows.length})</h2>
          {achadosRows.map((row) => (
            <div className="item-analise" key={row.id}>
              <div className="item-analise-cabecalho">
                <span className="etapa-badge">
                  Item {row.item_numero} — {row.titulo}
                </span>
                <span className={`decisao-tag ${row.ciente ? "decisao-aceita" : "decisao-pendente"}`}>
                  {row.ciente ? "Ciente" : "Ciência pendente"}
                </span>
              </div>
              <p className="item-analise-resumo">{row.texto}</p>

              {podeEditar ? (
                <>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 10 }}>
                    <input
                      type="checkbox"
                      checked={row.ciente}
                      onChange={(e) => atualizarLocal(row.id, { ciente: e.target.checked })}
                    />
                    Estou ciente
                  </label>
                  <div className="field">
                    <label>Comentário</label>
                    <textarea
                      value={row.comentario || ""}
                      onChange={(e) => atualizarLocal(row.id, { comentario: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div className="field">
                    <label>Justificativa da edição (obrigatória para salvar)</label>
                    <textarea
                      value={justificativas[row.id] || ""}
                      onChange={(e) =>
                        setJustificativas((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      rows={2}
                      placeholder="Explique o motivo desta alteração."
                    />
                  </div>
                  <div className="actions">
                    <button
                      className="btn secondary"
                      onClick={() => salvarAchado(row)}
                      disabled={salvandoId === row.id}
                    >
                      {salvandoId === row.id ? "Salvando..." : "Salvar alteração"}
                    </button>
                  </div>
                  {feedbackPorAchado[row.id] && (
                    <p className={`msg ${feedbackPorAchado[row.id]!.tipo === "ok" ? "ok" : "erro"}`}>
                      {feedbackPorAchado[row.id]!.texto}
                    </p>
                  )}
                </>
              ) : (
                row.comentario && (
                  <p style={{ fontSize: 13, fontStyle: "italic" }}>Comentário: {row.comentario}</p>
                )
              )}

              <button
                type="button"
                onClick={() => alternarHistorico(row.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#1f4e3d",
                  fontSize: 12,
                  cursor: "pointer",
                  marginTop: 8,
                  padding: 0,
                }}
              >
                {historicoAberto[row.id] ? "Ocultar histórico de versões" : "Ver histórico de versões"}
              </button>

              {historicoAberto[row.id] && (
                <div style={{ marginTop: 8, borderTop: "1px dashed #d8dee3", paddingTop: 8 }}>
                  {carregandoHistorico[row.id] && <p style={{ fontSize: 12 }}>Carregando...</p>}
                  {!carregandoHistorico[row.id] && (historicoDados[row.id]?.length ?? 0) === 0 && (
                    <p style={{ fontSize: 12, color: "#667085" }}>Nenhuma edição registrada ainda.</p>
                  )}
                  {(historicoDados[row.id] || []).map((v) => (
                    <div
                      key={v.id}
                      style={{ fontSize: 12, marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #f0f0f0" }}
                    >
                      <strong>
                        Versão {v.versao} — {v.profiles?.nome_completo || v.profiles?.email || "usuário"} em{" "}
                        {new Date(v.editado_em).toLocaleString("pt-BR")}
                      </strong>
                      <div>Justificativa: {v.justificativa_edicao}</div>
                      <div style={{ color: "#667085" }}>
                        Ciência: {v.ciente_anterior ? "sim" : "não"} → {v.ciente_novo ? "sim" : "não"}
                      </div>
                      {(v.comentario_anterior || v.comentario_novo) && (
                        <div style={{ color: "#667085" }}>
                          Comentário: &quot;{v.comentario_anterior || "(vazio)"}&quot; → &quot;
                          {v.comentario_novo || "(vazio)"}&quot;
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>

        {mensagensOk.length > 0 && (
          <section className="card">
            <h2>Itens sem pontos de atenção</h2>
            {mensagensOk.map((msg, idx) => (
              <div className="item-analise item-ok" key={idx}>
                <span>{msg}</span>
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

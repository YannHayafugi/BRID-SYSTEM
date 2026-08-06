"use client";

/**
 * Follow-up — acompanhamento dos processos pelas macrofases do fluxo.
 * Portado do app Vite (D10 híbrido). Fases 🤖 avançam pelos documentos;
 * fases ✋ são selecionáveis. Cliente = órgão cadastrado (D6/D13), com
 * atalho de cadastro inline. Análise de TR pelo card (D12).
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Modal from "@/app/components/Modal";
import FormularioOrgao from "@/app/components/FormularioOrgao";
import AnaliseTRConteudo from "@/app/components/AnaliseTRConteudo";
import ProcessoTimeline from "@/app/components/ProcessoTimeline";

interface Etapa { nome: string; tipo: "auto" | "manual" }
interface Orgao { id: string; razao_social: string; tipo_ente?: string; cidade?: string; uf?: string }
interface HistoricoEtapa { etapa: number; nome: string; data_autenticacao: string; alterado_em: string }
interface Processo {
  id: string; titulo: string; orgao: Orgao | null; data: string; tr_nome: string;
  etapa: number; documentos: { oficio?: { nome: string } }; arquivos: string[];
  cadastro_tr_id: string | null; cadastro_tr_status: "em_analise" | "concluida" | null;
  proposta_aprovada: boolean; historico_etapas: HistoricoEtapa[];
  criado_por: { id: string; nome: string } | null;
}
function hoje() { return new Date().toISOString().slice(0, 10); }
function fmtDataCurta(iso: string) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}
function fmtData(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function FollowupConteudo() {
  const searchParams = useSearchParams();
  const processoAlvo = searchParams.get("processo");
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [orgaos, setOrgaos] = useState<Orgao[]>([]);
  const [carregando, setCarregando] = useState(true);
  // D43/D48: admin troca para qualquer fase; editor só avança para a
  // próxima; visualizador não troca
  const [souAdmin, setSouAdmin] = useState(false);
  const [perfil, setPerfil] = useState<"admin" | "editor" | "visualizador">("visualizador");
  // D47: para não-admin, a fase vira um dropdown que expande a timeline
  // (somente leitura) do processo
  const [timelineAberta, setTimelineAberta] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [gerando, setGerando] = useState<string | null>(null);
  const [aprovando, setAprovando] = useState<string | null>(null);
  // fase manual pendente de confirmação: exige data de autenticação (D21)
  const [etapaPendente, setEtapaPendente] = useState<{ id: string; etapa: number } | null>(null);
  const [dataAutenticacao, setDataAutenticacao] = useState(hoje());
  const [confirmando, setConfirmando] = useState(false);

  // formulário "abrir novo processo" — D36: virou modal
  const [modalAbrirAberto, setModalAbrirAberto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [orgaoId, setOrgaoId] = useState("");
  const [abrindo, setAbrindo] = useState(false);
  // D37: cadastro de órgão reaproveita o formulário completo (mesmo de /orgaos), em modal
  const [modalOrgaoAberto, setModalOrgaoAberto] = useState(false);

  // D40: "Analisar TR" abre em modal, em vez de navegar para /tr-analise
  const [modalAnaliseTr, setModalAnaliseTr] = useState<{ processoId: string; orgaoId: string } | null>(null);

  // D36: editar título do processo
  const [editandoTitulo, setEditandoTitulo] = useState<string | null>(null);
  const [tituloEditado, setTituloEditado] = useState("");
  const [orgaoEditado, setOrgaoEditado] = useState("");
  const [salvandoTitulo, setSalvandoTitulo] = useState(false);

  // D36: filtros — Órgão, Data (período) e Status (fase)
  const [filtroOrgao, setFiltroOrgao] = useState("");
  const [filtroDe, setFiltroDe] = useState("");
  const [filtroAte, setFiltroAte] = useState("");
  const [filtroEtapa, setFiltroEtapa] = useState("");

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const [rp, rg] = await Promise.all([
        fetch("/api/processos"),
        fetch("/api/orgaos"),
      ]);
      if (rp.status === 401) { window.location.href = "/login"; return; }
      const dp = await rp.json();
      setProcessos(dp.processos || []);
      setEtapas(dp.etapas || []);
      setSouAdmin(!!dp.souAdmin);
      setPerfil(dp.perfil === "admin" || dp.perfil === "editor" ? dp.perfil : "visualizador");
      setOrgaos((await rg.json()).orgaos || []);
    } catch {
      setErro("Falha ao carregar os processos.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Vindo do Dashboard (?processo=id): rola até o card e destaca por um instante.
  useEffect(() => {
    if (!processoAlvo || carregando) return;
    const el = document.getElementById(`processo-${processoAlvo}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [processoAlvo, carregando]);

  async function aoCadastrarOrgao(orgao: { id: string }) {
    setModalOrgaoAberto(false);
    await carregar();
    if (orgao?.id) setOrgaoId(orgao.id);
  }

  async function abrirProcesso(e: React.FormEvent) {
    e.preventDefault();
    setAbrindo(true);
    try {
      const fd = new FormData();
      fd.append("titulo", titulo);
      fd.append("orgao_id", orgaoId);
      const r = await fetch("/api/processos", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro || "Falha ao abrir o processo.");
      setTitulo(""); setOrgaoId("");
      setModalAbrirAberto(false);
      await carregar();
    } catch (err) {
      alert(`❌ ${err instanceof Error ? err.message : err}`);
    } finally {
      setAbrindo(false);
    }
  }

  function iniciarEdicaoTitulo(p: Processo) {
    setEditandoTitulo(p.id);
    setTituloEditado(p.titulo);
    setOrgaoEditado(p.orgao?.id || "");
  }

  async function salvarTitulo(id: string) {
    if (!tituloEditado.trim()) { alert("Informe o título do processo."); return; }
    if (!orgaoEditado) { alert("Selecione o órgão do processo."); return; }
    setSalvandoTitulo(true);
    try {
      const r = await fetch(`/api/processos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: tituloEditado, orgaoId: orgaoEditado }),
      });
      if (!r.ok) throw new Error((await r.json()).erro || "Falha ao salvar o título.");
      setEditandoTitulo(null);
      await carregar();
    } catch (err) {
      alert(`❌ ${err instanceof Error ? err.message : err}`);
    } finally {
      setSalvandoTitulo(false);
    }
  }

  async function aprovarProposta(id: string) {
    setAprovando(id);
    try {
      const r = await fetch(`/api/processos/${id}/aprovar`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).erro || "Falha ao aprovar a proposta.");
      await carregar();
    } catch (err) {
      alert(`❌ ${err instanceof Error ? err.message : err}`);
    } finally {
      setAprovando(null);
    }
  }

  // Abre o passo de confirmação: toda troca de fase manual exige a
  // data de autenticação (assinatura/validação) antes de ser aplicada.
  function pedirEtapa(id: string, etapa: number) {
    setDataAutenticacao(hoje());
    setEtapaPendente({ id, etapa });
  }

  async function confirmarEtapa() {
    if (!etapaPendente) return;
    if (!dataAutenticacao) { alert("Informe a data de autenticação."); return; }
    setConfirmando(true);
    try {
      const r = await fetch(`/api/processos/${etapaPendente.id}/etapa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapa: etapaPendente.etapa, dataAutenticacao }),
      });
      if (!r.ok) { alert((await r.json()).erro || "Erro ao mudar a fase."); return; }
      setEtapaPendente(null);
      await carregar();
    } finally {
      setConfirmando(false);
    }
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

  const processosFiltrados = useMemo(() => {
    return processos.filter((p) => {
      if (filtroOrgao && p.orgao?.id !== filtroOrgao) return false;
      if (filtroEtapa !== "" && p.etapa !== Number(filtroEtapa)) return false;
      if (filtroDe && p.data < `${filtroDe}T00:00:00`) return false;
      if (filtroAte && p.data > `${filtroAte}T23:59:59`) return false;
      return true;
    });
  }, [processos, filtroOrgao, filtroDe, filtroAte, filtroEtapa]);

  // D43: finalizado = última fase do fluxo (100%). Ganha tag própria e vai
  // para a seção "Finalizados", separada dos processos em andamento.
  const ehFinalizado = useCallback(
    (p: Processo) => etapas.length > 0 && p.etapa === etapas.length - 1,
    [etapas]
  );
  const processosAndamento = useMemo(
    () => processosFiltrados.filter((p) => !ehFinalizado(p)),
    [processosFiltrados, ehFinalizado]
  );
  const processosFinalizados = useMemo(
    () => processosFiltrados.filter(ehFinalizado),
    [processosFiltrados, ehFinalizado]
  );
  const totalFinalizados = useMemo(() => processos.filter(ehFinalizado).length, [processos, ehFinalizado]);

  const filtrosAtivos = !!(filtroOrgao || filtroDe || filtroAte || filtroEtapa !== "");
  function limparFiltros() {
    setFiltroOrgao(""); setFiltroDe(""); setFiltroAte(""); setFiltroEtapa("");
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
        Fluxo de documentos: TR → Proposta → Ofício. O Ofício só é liberado depois que a Proposta é aprovada.
      </p>

      {/* D36/D38: "Abrir novo processo" virou modal, aberto por este botão —
          sempre abre em branco (novo registro), mesmo se a última vez foi
          fechado sem salvar. */}
      <button type="button" className="btn-azul" style={{ marginBottom: 20 }}
        onClick={() => { setTitulo(""); setOrgaoId(""); setModalAbrirAberto(true); }}>
        ＋ Abrir processo
      </button>

      {/* D43: cards-resumo no topo — visão rápida antes do filtro */}
      <div className="fu-resumo">
        <div className="fu-resumo-card" title="Processos que ainda não chegaram à última fase">
          <span className="fu-resumo-num">{processos.length - totalFinalizados}</span>
          <span className="detalhe">⏳ Em andamento</span>
        </div>
        <div className="fu-resumo-card" title="Processos na última fase do fluxo (100%)">
          <span className="fu-resumo-num">{totalFinalizados}</span>
          <span className="detalhe">✅ Finalizados</span>
        </div>
        <div className="fu-resumo-card" title="Todos os processos abertos no Follow-up">
          <span className="fu-resumo-num">{processos.length}</span>
          <span className="detalhe">📋 Total</span>
        </div>
      </div>

      {modalAbrirAberto && (
        <Modal titulo="Abrir novo processo" onFechar={() => setModalAbrirAberto(false)}>
          <form className="item item-col form-projeto" onSubmit={abrirProcesso} style={{ boxShadow: "none", border: "none", padding: 0, margin: 0 }}>
            <div style={{ display: "flex", gap: 10, width: "100%", alignItems: "center" }}>
              <select value={orgaoId} onChange={(e) => setOrgaoId(e.target.value)} required
                style={{ flex: 1, marginBottom: 0, background: "var(--primaria-claro)", borderColor: "var(--primaria)" }}
                title="Cliente do processo — órgão do cadastro central (D6). Obrigatório: define o processo.">
                <option value="">— Órgão cadastrado (cliente) * —</option>
                {orgaos.map((o) => (
                  <option key={o.id} value={o.id}>{o.razao_social} ({o.cidade}/{o.uf})</option>
                ))}
              </select>
              <button type="button" className="btn-doc" onClick={() => setModalOrgaoAberto(true)}
                title="Cadastrar um órgão sem sair desta tela">＋ Novo órgão</button>
            </div>

            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required
              placeholder="Título do processo *" title="Nome do processo no Follow-up" />

            <button type="submit" className="btn-azul" disabled={abrindo}
              title="Criar o processo — o próximo passo é enviar o TR">
              {abrindo ? "Abrindo..." : "Abrir processo"}
            </button>
          </form>
        </Modal>
      )}

      {/* D37/D38: cadastro de órgão — mesmo formulário completo usado em
          /orgaos, aberto por cima do modal "Abrir novo processo" (zIndex
          maior, para empilhar corretamente em vez de somar dois fundos). */}
      {modalOrgaoAberto && (
        <Modal titulo="Cadastrar novo órgão" onFechar={() => setModalOrgaoAberto(false)} zIndex={200}>
          <FormularioOrgao onSucesso={aoCadastrarOrgao} onCancelar={() => setModalOrgaoAberto(false)} />
        </Modal>
      )}

      {/* D40: "Analisar TR" abre aqui, em vez de navegar para /tr-analise —
          o resultado da IA é salvo como rascunho ao terminar, então fechar
          e reabrir não perde nada nem roda a IA de novo. */}
      {modalAnaliseTr && (
        <Modal titulo="Análise de Termo de Referência" onFechar={() => setModalAnaliseTr(null)}>
          <AnaliseTRConteudo
            orgaoId={modalAnaliseTr.orgaoId}
            processoId={modalAnaliseTr.processoId}
            onFinalizado={carregar}
          />
        </Modal>
      )}

      {/* D36: filtros — Órgão, Data (período) e Status (fase) */}
      <div className="item" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <label className="detalhe" style={{ display: "block", marginBottom: 4 }}>Órgão</label>
          <select value={filtroOrgao} onChange={(e) => setFiltroOrgao(e.target.value)}>
            <option value="">Todos</option>
            {orgaos.map((o) => (
              <option key={o.id} value={o.id}>{o.razao_social}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="detalhe" style={{ display: "block", marginBottom: 4 }}>De</label>
          <input type="date" value={filtroDe} onChange={(e) => setFiltroDe(e.target.value)} />
        </div>
        <div>
          <label className="detalhe" style={{ display: "block", marginBottom: 4 }}>Até</label>
          <input type="date" value={filtroAte} onChange={(e) => setFiltroAte(e.target.value)} />
        </div>
        <div>
          <label className="detalhe" style={{ display: "block", marginBottom: 4 }}>Status (fase)</label>
          <select value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value)}>
            <option value="">Todos</option>
            {etapas.map((e2, i) => (
              <option key={i} value={i}>{i + 1}. {e2.nome}</option>
            ))}
          </select>
        </div>
        {filtrosAtivos && (
          <button type="button" className="btn-doc" onClick={limparFiltros}>Limpar filtros</button>
        )}
        <span className="detalhe" style={{ marginLeft: "auto" }}>
          {processosFiltrados.length} de {processos.length} processo(s)
        </span>
      </div>

      {/* Cards dos processos */}
      {carregando && <p className="vazio">Carregando...</p>}
      {erro && <p className="vazio">❌ {erro}</p>}
      {!carregando && !processos.length && <p className="vazio">Nenhum processo aberto ainda.</p>}
      {!carregando && processos.length > 0 && !processosFiltrados.length && (
        <p className="vazio">Nenhum processo encontrado com esses filtros.</p>
      )}

      {/* D43: em andamento em cima; finalizados em seção própria abaixo */}
      {processosAndamento.map(renderProcesso)}

      {processosFinalizados.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>✅ Finalizados ({processosFinalizados.length})</h2>
          <p className="detalhe" style={{ marginBottom: 12 }}>Processos que concluíram todas as fases do fluxo.</p>
          {processosFinalizados.map(renderProcesso)}
        </div>
      )}
    </div>
  );

  function renderProcesso(p: Processo) {
    const et = etapas[p.etapa] || { nome: "-", tipo: "manual" };
    const pct = etapas.length ? Math.round(((p.etapa + 1) / etapas.length) * 100) : 0;
    const temTR = p.arquivos.includes("tr");
    const temProposta = p.arquivos.includes("proposta");
    const temOficio = !!p.documentos?.oficio;
    const finalizado = ehFinalizado(p);
    const destacado = processoAlvo === p.id;
    return (
          <div className="item item-col" key={p.id} id={`processo-${p.id}`}
            style={destacado ? { outline: "2px solid var(--primaria)", outlineOffset: 2 } : undefined}>
            <div className="fu-topo">
              <div className="fu-icones">
                <button type="button" className="fu-icone-btn" onClick={() => iniciarEdicaoTitulo(p)}
                  title="Editar título e órgão do processo">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
                <button type="button" className="fu-icone-btn lixeira" onClick={() => excluir(p)}
                  title="Excluir este processo e seus arquivos">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" /><path d="M14 11v6" />
                  </svg>
                </button>
              </div>
              {editandoTitulo === p.id ? (
                <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <input value={tituloEditado} onChange={(e) => setTituloEditado(e.target.value)}
                    style={{ marginBottom: 0, width: 220 }} autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") salvarTitulo(p.id); if (e.key === "Escape") setEditandoTitulo(null); }} />
                  <select value={orgaoEditado} onChange={(e) => setOrgaoEditado(e.target.value)} style={{ marginBottom: 0, width: 200 }}>
                    <option value="">— Órgão * —</option>
                    {orgaos.map((o) => (
                      <option key={o.id} value={o.id}>{o.razao_social} ({o.cidade}/{o.uf})</option>
                    ))}
                  </select>
                  <button type="button" className="btn-doc" disabled={salvandoTitulo} onClick={() => salvarTitulo(p.id)}>
                    {salvandoTitulo ? "Salvando..." : "Salvar"}
                  </button>
                  <button type="button" className="btn-doc" onClick={() => setEditandoTitulo(null)}>Cancelar</button>
                </span>
              ) : (
                <strong>{p.titulo}</strong>
              )}
              {finalizado ? (
                <span className="fu-badge finalizado" title="Processo concluiu todas as fases do fluxo (100%)">
                  ✅ Finalizado
                </span>
              ) : (
                <span className={`fu-badge ${et.tipo}`}
                  title={et.tipo === "auto" ? "Fase coberta pela automação de documentos" : "Fase conduzida manualmente"}>
                  {et.tipo === "auto" ? "🤖 Automatizada" : "✋ Manual"}
                </span>
              )}
              <span className="detalhe">
                {p.orgao ? `${p.orgao.razao_social} — ` : ""}{fmtData(p.data)}
                {p.criado_por ? ` — criado por ${p.criado_por.nome}` : ""}
              </span>
            </div>

            <div className="fu-progresso" title={`Progresso: fase ${p.etapa + 1} de ${etapas.length}`}>
              <div className="fu-barra" style={{ width: `${pct}%` }} />
            </div>

            {/* D43: trocar fase é exclusivo do admin — e para ele o seletor é
                livre (qualquer fase, sem depender de tipo ou ordem). Usuário
                comum vê a fase atual como texto. */}
            {souAdmin ? (
              <select className="fu-etapa"
                value={etapaPendente?.id === p.id ? etapaPendente.etapa : p.etapa}
                disabled={etapaPendente?.id === p.id}
                onChange={(e) => pedirEtapa(p.id, Number(e.target.value))}
                title="Selecione qualquer fase — a mudança pede a data de autenticação">
                {etapas.map((e2, i) => (
                  <option key={i} value={i}>
                    {i + 1}. {e2.nome} {e2.tipo === "auto" ? "🤖" : "✋"}
                  </option>
                ))}
              </select>
            ) : (
              <>
                {/* D47: dropdown que expande a timeline das fases */}
                <button type="button" className="fu-etapa"
                  style={{ textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
                  onClick={() => setTimelineAberta(timelineAberta === p.id ? null : p.id)}
                  title={perfil === "editor"
                    ? "Ver a linha do tempo das fases — como editor, você pode avançar para a próxima fase"
                    : "Ver a linha do tempo das fases (somente administradores e editores trocam a fase)"}>
                  <span>{p.etapa + 1}. {et.nome} {et.tipo === "auto" ? "🤖" : "✋"}{perfil === "editor" ? "" : " 🔒"}</span>
                  <span>{timelineAberta === p.id ? "▾" : "▸"}</span>
                </button>
                {timelineAberta === p.id && (
                  <div style={{ width: "100%", padding: "10px 4px 0" }}>
                    <ProcessoTimeline
                      etapas={etapas}
                      etapaAtual={p.etapa}
                      historico={p.historico_etapas || []}
                      bloqueado={perfil !== "editor" || etapaPendente?.id === p.id}
                      apenasProxima={perfil === "editor"}
                      onSelecionar={(i) => perfil === "editor" && pedirEtapa(p.id, i)}
                    />
                  </div>
                )}
                {/* D48: editor avança direto para a próxima fase */}
                {perfil === "editor" && !finalizado && etapaPendente?.id !== p.id && (
                  <button type="button" className="btn-doc" style={{ alignSelf: "flex-start" }}
                    onClick={() => pedirEtapa(p.id, p.etapa + 1)}
                    title="Avançar este processo para a próxima fase (pede a data de autenticação)">
                    → Avançar para: {p.etapa + 2}. {etapas[p.etapa + 1]?.nome || ""}
                  </button>
                )}
              </>
            )}

            {etapaPendente?.id === p.id && (
              <div style={{
                display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
                background: "var(--primaria-claro)", border: "1px solid var(--primaria)",
                borderRadius: 8, padding: 8, width: "100%",
              }}>
                <label className="detalhe" style={{ margin: 0 }}>
                  📅 Data de autenticação para &quot;{etapas[etapaPendente.etapa]?.nome}&quot;:
                </label>
                <input type="date" value={dataAutenticacao} max={hoje()}
                  onChange={(e) => setDataAutenticacao(e.target.value)} style={{ marginBottom: 0, width: 150 }} />
                <button type="button" className="btn-azul" disabled={confirmando} onClick={confirmarEtapa}>
                  {confirmando ? "Confirmando..." : "Confirmar"}
                </button>
                <button type="button" className="btn-doc" onClick={() => setEtapaPendente(null)}>Cancelar</button>
              </div>
            )}

            {p.historico_etapas?.length > 0 && (
              <span className="detalhe" style={{ width: "100%" }}
                title="Última mudança de fase manual autenticada">
                🔏 Última autenticação: {fmtDataCurta(p.historico_etapas[p.historico_etapas.length - 1].data_autenticacao)}
                {" — "}{p.historico_etapas[p.historico_etapas.length - 1].nome}
              </span>
            )}

            <div style={{ width: "100%" }}>
              <span className="detalhe">Documentos essenciais (TR → Proposta → Ofício):</span>
              <div className="downloads">
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
                      <button type="button"
                        className={p.cadastro_tr_status === "em_analise" ? "btn-doc destaque" : "btn-doc"}
                        onClick={() => setModalAnaliseTr({ processoId: p.id, orgaoId: p.orgao!.id })}
                        title={
                          p.cadastro_tr_status === "em_analise"
                            ? "A IA já analisou este TR — falta revisar e gerar o relatório final"
                            : "Auditar o TR com IA — os achados ficam vinculados e alimentam a geração da proposta (D8)"
                        }>
                        {p.cadastro_tr_status === "em_analise"
                          ? "📝 Pré-análise pronta"
                          : `🔍 Analisar TR${p.cadastro_tr_status === "concluida" ? " ✓" : ""}`}
                      </button>
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
                    {!p.proposta_aprovada && (
                      <button type="button" className="btn-doc" disabled={aprovando === p.id}
                        onClick={() => aprovarProposta(p.id)}
                        title="Aprovar a Proposta — libera a emissão do Ofício">
                        {aprovando === p.id ? "Aprovando..." : "✅ Aprovar Proposta"}
                      </button>
                    )}
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

                {temOficio ? (
                  <a className="btn-dl btn-sec" href={`/api/processos/${p.id}/download/oficio`}
                    title="Baixar o ofício deste processo">📎 Ofício</a>
                ) : p.proposta_aprovada ? (
                  <Link className="btn-doc" href={`/oficio?processo=${p.id}`}
                    title="Emitir o Ofício — a Proposta já foi aprovada">
                    📝 Gerar Ofício
                  </Link>
                ) : (
                  <span className="btn-doc pendente" title="Aprove a Proposta para liberar o Ofício">
                    Ofício liberado após aprovação da Proposta
                  </span>
                )}
              </div>
            </div>
          </div>
        );
  }
}

export default function FollowupPage() {
  return (
    <Suspense>
      <FollowupConteudo />
    </Suspense>
  );
}

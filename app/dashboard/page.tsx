"use client";

/** Dashboard — KPIs, notificações de automação, processos por fase e progresso.
 * Portado do app Vite (layout em colunas, sem scroll da página).
 * D20: filtros por Órgão, Data (período) e Status (fase) do processo. */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarrasHorizontais, BarrasMensais, Donut } from "@/app/components/DashboardCharts";
import Modal from "@/app/components/Modal";

interface Etapa { nome: string; tipo: "auto" | "manual" }
interface Orgao { id: string; razao_social: string; tipo_ente?: string }
interface Processo {
  id: string; titulo: string; etapa: number; tr_nome: string;
  arquivos: string[]; documentos: { oficio?: unknown };
  orgao: Orgao | null; data: string; atualizado_em: string; proposta_aprovada: boolean;
}

const DIAS_ESTAGNADO = 15;
const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const FILTROS_VAZIOS = { orgaoId: "", de: "", ate: "", etapa: "" };

function fmtData(iso: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function DashboardPage() {
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [faseAberta, setFaseAberta] = useState<number | null>(null);
  const [notificacoesAbertas, setNotificacoesAbertas] = useState(false);

  useEffect(() => {
    fetch("/api/processos").then(async (r) => {
      if (r.status === 401) { window.location.href = "/login"; return; }
      const d = await r.json();
      setProcessos(d.processos || []);
      setEtapas(d.etapas || []);
      setCarregando(false);
    }).catch(() => setCarregando(false));
  }, []);

  const orgaosDisponiveis = useMemo(() => {
    const mapa = new Map<string, string>();
    processos.forEach((p) => { if (p.orgao) mapa.set(p.orgao.id, p.orgao.razao_social); });
    return Array.from(mapa, ([id, razao_social]) => ({ id, razao_social }))
      .sort((a, b) => a.razao_social.localeCompare(b.razao_social));
  }, [processos]);

  const processosFiltrados = useMemo(() => {
    return processos.filter((p) => {
      if (filtros.orgaoId && p.orgao?.id !== filtros.orgaoId) return false;
      if (filtros.etapa !== "" && p.etapa !== Number(filtros.etapa)) return false;
      if (filtros.de && p.data < `${filtros.de}T00:00:00`) return false;
      if (filtros.ate && p.data > `${filtros.ate}T23:59:59`) return false;
      return true;
    });
  }, [processos, filtros]);

  function limparFiltros() {
    setFiltros(FILTROS_VAZIOS);
  }

  const filtrosAtivos = !!(filtros.orgaoId || filtros.de || filtros.ate || filtros.etapa !== "");

  const total = processosFiltrados.length;
  const nAuto = etapas.filter((e) => e.tipo === "auto").length || 1;
  const temOficio = (p: Processo) => !!p.documentos?.oficio;
  const temTR = (p: Processo) => p.arquivos.includes("tr");
  const temProposta = (p: Processo) => p.arquivos.includes("proposta");
  const completo = (p: Processo) => temOficio(p) && temTR(p) && temProposta(p);

  const qualidade = total ? Math.round((processosFiltrados.filter(completo).length / total) * 100) : 0;
  const totalDocs = processosFiltrados.reduce(
    (s, p) => s + Number(temOficio(p)) + Number(temTR(p)) + Number(temProposta(p)) + Number(p.arquivos.includes("resumo")), 0);
  const eficiencia = total
    ? Math.round((processosFiltrados.reduce((s, p) => s + Math.min(p.etapa + 1, nAuto) / nAuto, 0) / total) * 100) : 0;
  const emContrato = processosFiltrados.filter((p) => p.etapa >= nAuto).length;
  const concluidos = processosFiltrados.filter((p) => p.etapa >= etapas.length - 1).length;
  const eficacia = total ? Math.round((emContrato / total) * 100) : 0;

  const primeiraManual = etapas.findIndex((e) => e.tipo === "manual");

  const avisosAutomacao = processosFiltrados.flatMap((p) => {
    if (!temOficio(p)) return [{ p, msg: "sem Ofício de abertura — gere ou anexe pelo Follow-up", pronto: false }];
    if (!temTR(p)) return [{ p, msg: "aguardando envio do TR", pronto: false }];
    if (!temProposta(p)) return [{ p, msg: "TR enviado — pronto para gerar a Proposta 🤖", pronto: true }];
    return [];
  });

  const avisosManual = processosFiltrados.flatMap((p) => {
    if (primeiraManual < 0 || p.etapa < primeiraManual) return [];
    return [{ p, msg: `Fase atual: ${etapas[p.etapa]?.nome || "-"}`, pronto: false }];
  });

  const totalAvisos = avisosAutomacao.length + avisosManual.length;
  const avisosProntos = avisosAutomacao.filter((a) => a.pronto).length;

  // ---- D24: KPIs e gráficos adicionais ----
  const comProposta = processosFiltrados.filter(temProposta);
  const taxaAprovacao = comProposta.length
    ? Math.round((comProposta.filter((p) => p.proposta_aprovada).length / comProposta.length) * 100)
    : 0;

  const agora = Date.now();
  const estagnados = processosFiltrados.filter((p) => {
    if (etapas.length && p.etapa >= etapas.length - 1) return false; // já concluído
    const diasParado = (agora - new Date(p.atualizado_em).getTime()) / 86400000;
    return diasParado >= DIAS_ESTAGNADO;
  }).length;

  const contagemPorOrgao = useMemo(() => {
    const mapa = new Map<string, { rotulo: string; valor: number }>();
    processosFiltrados.forEach((p) => {
      if (!p.orgao) return;
      const atual = mapa.get(p.orgao.id) || { rotulo: p.orgao.razao_social, valor: 0 };
      atual.valor += 1;
      mapa.set(p.orgao.id, atual);
    });
    return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor);
  }, [processosFiltrados]);
  const orgaoTop = contagemPorOrgao[0] || null;

  const municipios = processosFiltrados.filter((p) => p.orgao?.tipo_ente === "Município").length;
  const estados = processosFiltrados.filter((p) => p.orgao?.tipo_ente === "Estado").length;
  const percMunicipio = total ? Math.round((municipios / total) * 100) : 0;

  const funil = useMemo(() => [
    { rotulo: "TR", valor: processosFiltrados.filter(temTR).length },
    { rotulo: "Proposta", valor: processosFiltrados.filter(temProposta).length },
    { rotulo: "Aprovação", valor: processosFiltrados.filter((p) => p.proposta_aprovada).length },
    { rotulo: "Ofício", valor: processosFiltrados.filter(temOficio).length },
  ], [processosFiltrados]);

  const porMes = useMemo(() => {
    const mapa = new Map<string, number>();
    processosFiltrados.forEach((p) => {
      const d = new Date(p.data);
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      mapa.set(chave, (mapa.get(chave) || 0) + 1);
    });
    const chaves = Array.from(mapa.keys()).sort().slice(-6);
    return chaves.map((chave) => {
      const [ano, mes] = chave.split("-");
      return { rotulo: `${MESES_ABREV[Number(mes) - 1]}/${ano.slice(2)}`, valor: mapa.get(chave) || 0 };
    });
  }, [processosFiltrados]);

  const rankingOrgaos = contagemPorOrgao.slice(0, 10);

  const faseAutoManual = useMemo(() => {
    const auto = processosFiltrados.filter((p) => etapas[p.etapa]?.tipo === "auto").length;
    const manual = processosFiltrados.filter((p) => etapas[p.etapa]?.tipo === "manual").length;
    return [
      { rotulo: "Automática", valor: auto, cor: "var(--primaria)" },
      { rotulo: "Manual", valor: manual, cor: "#5a6b7b" },
    ];
  }, [processosFiltrados, etapas]);

  if (carregando) return <div className="page-larga"><p className="vazio">Carregando...</p></div>;

  return (
    <div className="page-larga">
      <div className="item" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <label className="detalhe" style={{ display: "block", marginBottom: 4 }}>Órgão</label>
          <select value={filtros.orgaoId} onChange={(e) => setFiltros((f) => ({ ...f, orgaoId: e.target.value }))}>
            <option value="">Todos</option>
            {orgaosDisponiveis.map((o) => (
              <option key={o.id} value={o.id}>{o.razao_social}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="detalhe" style={{ display: "block", marginBottom: 4 }}>De</label>
          <input type="date" value={filtros.de} onChange={(e) => setFiltros((f) => ({ ...f, de: e.target.value }))} />
        </div>
        <div>
          <label className="detalhe" style={{ display: "block", marginBottom: 4 }}>Até</label>
          <input type="date" value={filtros.ate} onChange={(e) => setFiltros((f) => ({ ...f, ate: e.target.value }))} />
        </div>
        <div>
          <label className="detalhe" style={{ display: "block", marginBottom: 4 }}>Status (fase)</label>
          <select value={filtros.etapa} onChange={(e) => setFiltros((f) => ({ ...f, etapa: e.target.value }))}>
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
          {total} de {processos.length} processo(s)
        </span>
      </div>

      <button
        type="button"
        onClick={() => setNotificacoesAbertas(true)}
        className="btn-azul"
        style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
          background: totalAvisos ? "var(--primaria)" : "var(--bg-card)",
          border: totalAvisos ? "none" : "1px solid var(--borda)",
          color: totalAvisos ? "var(--escuro)" : "var(--texto)",
        }}
        title="Ver notificações de automação e de fases manuais"
      >
        🔔 Notificações
        {totalAvisos > 0 && (
          <span style={{
            background: "var(--escuro)", color: "var(--primaria)", borderRadius: 999,
            fontSize: 12, fontWeight: 800, padding: "2px 9px",
          }}>
            {totalAvisos}
          </span>
        )}
        {avisosProntos > 0 && (
          <span className="detalhe" style={{ color: totalAvisos ? "var(--escuro)" : undefined }}>
            {avisosProntos} pronto(s) para gerar Proposta 🤖
          </span>
        )}
      </button>

      <div className="dash-kpis">
        <div className="kpi" title="Percentual de processos com os 3 documentos essenciais completos">
          <span className="kpi-valor">{qualidade}%</span>
          <span className="kpi-nome">Qualidade</span>
          <span className="kpi-desc">documentação essencial completa</span>
        </div>
        <div className="kpi" title="Processos abertos e documentos gerados/anexados">
          <span className="kpi-valor">{total} <small>proc.</small> · {totalDocs} <small>docs</small></span>
          <span className="kpi-nome">Produtividade</span>
          <span className="kpi-desc">processos e documentos no sistema</span>
        </div>
        <div className="kpi" title="Quanto das fases automatizadas já foi percorrido, na média">
          <span className="kpi-valor">{eficiencia}%</span>
          <span className="kpi-nome">Eficiência</span>
          <span className="kpi-desc">aproveitamento da automação</span>
        </div>
        <div className="kpi" title="Processos que avançaram além da automação (contrato em diante)">
          <span className="kpi-valor">{eficacia}% <small>({concluidos} concl.)</small></span>
          <span className="kpi-nome">Eficácia</span>
          <span className="kpi-desc">convertidos em contrato</span>
        </div>
        <div className="kpi" title="Percentual de propostas geradas que já foram aprovadas">
          <span className="kpi-valor">{taxaAprovacao}%</span>
          <span className="kpi-nome">Aprovação de Proposta</span>
          <span className="kpi-desc">{comProposta.length ? `${comProposta.filter((p) => p.proposta_aprovada).length} de ${comProposta.length} propostas` : "nenhuma proposta gerada"}</span>
        </div>
        <div className="kpi" title={`Processos sem atualização há ${DIAS_ESTAGNADO} dias ou mais`}>
          <span className="kpi-valor" style={estagnados ? { color: "#c2410c" } : undefined}>{estagnados}</span>
          <span className="kpi-nome">Estagnados</span>
          <span className="kpi-desc">sem atualização há {DIAS_ESTAGNADO}+ dias</span>
        </div>
        <div className="kpi" title="Órgão (cliente) com mais processos abertos no período filtrado">
          <span className="kpi-valor" style={{ fontSize: 15 }}>{orgaoTop ? orgaoTop.rotulo : "-"}</span>
          <span className="kpi-nome">Órgão com mais processos</span>
          <span className="kpi-desc">{orgaoTop ? `${orgaoTop.valor} processo(s)` : "sem processos"}</span>
        </div>
        <div className="kpi" title="Percentual de processos de órgãos do tipo Município vs Estado">
          <span className="kpi-valor">{percMunicipio}% <small>Município</small></span>
          <span className="kpi-nome">Município x Estado</span>
          <span className="kpi-desc">{municipios} Município · {estados} Estado</span>
        </div>
      </div>

      <div className="dash-graficos">
        <div className="dash-col">
          <h3>🔻 Funil de conversão</h3>
          <BarrasHorizontais dados={funil} />
        </div>
        <div className="dash-col">
          <h3>📈 Processos abertos por mês</h3>
          <BarrasMensais dados={porMes} />
        </div>
        <div className="dash-col">
          <h3>🏛️ Processos por órgão</h3>
          <div className="dash-scroll">
            <BarrasHorizontais dados={rankingOrgaos} vazio="Nenhum órgão com processos no período." />
          </div>
        </div>
        <div className="dash-col">
          <h3>🤖 Fase automática x manual</h3>
          <Donut dados={faseAutoManual} />
        </div>
      </div>

      <div className="dash-colunas" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="dash-col">
          <h3>📊 Processos por fase</h3>
          <div className="dash-scroll">
            {etapas.map((e, i) => {
              const processosFase = processosFiltrados.filter((p) => p.etapa === i);
              const qtd = processosFase.length;
              const pct = total ? Math.round((qtd / total) * 100) : 0;
              const aberta = faseAberta === i;
              return (
                <div key={i}>
                  <div className="item fase-linha" style={{ cursor: qtd ? "pointer" : "default" }}
                    onClick={() => qtd && setFaseAberta(aberta ? null : i)}
                    title={qtd ? `Clique para ${aberta ? "recolher" : "ver"} os ${qtd} processo(s) desta fase` : `0 processo(s) na fase ${i + 1}`}>
                    <span className="fase-nome">
                      {qtd ? (aberta ? "▾ " : "▸ ") : ""}{i + 1}. {e.nome} {e.tipo === "auto" ? "🤖" : "✋"}
                    </span>
                    <div className="fu-progresso fase-barra"><div className="fu-barra" style={{ width: `${pct}%` }} /></div>
                    <span className="fase-qtd">{qtd}</span>
                  </div>
                  {aberta && (
                    <div style={{ paddingLeft: 16, borderLeft: "2px solid var(--primaria-claro)", marginBottom: 6 }}>
                      {processosFase.map((p) => (
                        <Link key={p.id} href={`/followup?processo=${p.id}`} className="item"
                          style={{ display: "block", padding: "6px 10px", textDecoration: "none", color: "inherit" }}
                          title="Abrir este processo no Follow-up">
                          <strong>{p.titulo}</strong>{p.orgao ? <span className="detalhe"> — {p.orgao.razao_social}</span> : null}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="dash-col">
          <h3>📋 Processos e progresso</h3>
          <div className="dash-scroll">
            {total ? processosFiltrados.map((p) => {
              const pct = etapas.length ? Math.round(((p.etapa + 1) / etapas.length) * 100) : 0;
              return (
                <Link href={`/followup?processo=${p.id}`} className="item fase-linha" key={p.id}
                  style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}
                  title={`Fase atual: ${etapas[p.etapa]?.nome || "-"} — clique para abrir o processo`}>
                  <span className="fase-nome"><strong>{p.titulo}</strong>
                    <span className="detalhe">{etapas[p.etapa]?.nome || ""}</span></span>
                  <div className="fu-progresso fase-barra"><div className="fu-barra" style={{ width: `${pct}%` }} /></div>
                  <span className="fase-qtd">{pct}%</span>
                </Link>
              );
            }) : <p className="vazio">Nenhum processo encontrado com esses filtros.</p>}
          </div>
        </div>
      </div>

      {notificacoesAbertas && (
        <Modal titulo="🔔 Notificações" onFechar={() => setNotificacoesAbertas(false)}>
          <span className="detalhe" style={{ fontWeight: 700, display: "block", margin: "4px 0" }}>🤖 Automação</span>
          {avisosAutomacao.length ? avisosAutomacao.map((a, i) => (
            <Link href={`/followup?processo=${a.p.id}`} className={`item notif ${a.pronto ? "pronto" : ""}`} key={i}
              style={{ display: "block", textDecoration: "none", color: "inherit", cursor: "pointer" }}
              title="Abrir este processo no Follow-up" onClick={() => setNotificacoesAbertas(false)}>
              <div>
                <strong>{a.p.titulo}</strong>
                <span className="detalhe">{a.msg}</span>
                <span className="detalhe">Última atualização: {fmtData(a.p.atualizado_em)}</span>
              </div>
            </Link>
          )) : <p className="vazio">✅ Nenhuma pendência de automação.</p>}

          <span className="detalhe" style={{ fontWeight: 700, display: "block", margin: "12px 0 4px" }}>✋ Manual</span>
          {avisosManual.length ? avisosManual.map((a, i) => (
            <Link href={`/followup?processo=${a.p.id}`} className="item notif" key={i}
              style={{ display: "block", textDecoration: "none", color: "inherit", cursor: "pointer" }}
              title="Abrir este processo no Follow-up" onClick={() => setNotificacoesAbertas(false)}>
              <div>
                <strong>{a.p.titulo}</strong>
                <span className="detalhe">{a.msg}</span>
                <span className="detalhe">Última atualização: {fmtData(a.p.atualizado_em)}</span>
              </div>
            </Link>
          )) : <p className="vazio">✅ Nenhum processo em fase manual.</p>}
        </Modal>
      )}
    </div>
  );
}

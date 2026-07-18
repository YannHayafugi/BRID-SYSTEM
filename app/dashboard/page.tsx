"use client";

/** Dashboard — KPIs, notificações de automação, processos por fase e progresso.
 * Portado do app Vite (layout em colunas, sem scroll da página).
 * D20: filtros por Órgão, Data (período) e Status (fase) do processo. */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarrasHorizontais, BarrasMensais, Donut } from "@/app/components/DashboardCharts";
import HoverCard from "@/app/components/HoverCard";
import ProcessoTimeline, { HistoricoEtapaTL } from "@/app/components/ProcessoTimeline";

interface Etapa { nome: string; tipo: "auto" | "manual" }
interface Orgao { id: string; razao_social: string; tipo_ente?: string }
interface Processo {
  id: string; titulo: string; etapa: number; tr_nome: string;
  arquivos: string[]; documentos: { oficio?: unknown };
  orgao: Orgao | null; data: string; atualizado_em: string; proposta_aprovada: boolean;
  historico_etapas: HistoricoEtapaTL[];
}

const DIAS_ESTAGNADO = 15;
const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const FILTROS_VAZIOS = { orgaoId: "", de: "", ate: "", etapa: "" };

// D32: conteúdo do mini modal (HoverCard) que aparece ao passar o mouse
// sobre os indicadores — lista os processos que compõem aquele número.
function popoverLista(descricao: string, lista: Processo[]) {
  return (
    <div>
      <p style={{ margin: "0 0 8px", fontWeight: 700 }}>{descricao}</p>
      {lista.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {lista.slice(0, 12).map((p) => (
            <Link key={p.id} href={`/followup?processo=${p.id}`}
              style={{ color: "var(--primaria)", textDecoration: "none" }}>
              • {p.titulo}
            </Link>
          ))}
          {lista.length > 12 && <span className="detalhe">…e mais {lista.length - 12}</span>}
        </div>
      ) : <p className="vazio" style={{ margin: 0 }}>Nenhum processo.</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [faseAberta, setFaseAberta] = useState<number | null>(null);

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

  const completosLista = processosFiltrados.filter(completo);
  const qualidade = total ? Math.round((completosLista.length / total) * 100) : 0;
  const totalDocs = processosFiltrados.reduce(
    (s, p) => s + Number(temOficio(p)) + Number(temTR(p)) + Number(temProposta(p)) + Number(p.arquivos.includes("resumo")), 0);
  const eficiencia = total
    ? Math.round((processosFiltrados.reduce((s, p) => s + Math.min(p.etapa + 1, nAuto) / nAuto, 0) / total) * 100) : 0;
  const emContratoLista = processosFiltrados.filter((p) => p.etapa >= nAuto);
  const emContrato = emContratoLista.length;
  const concluidos = processosFiltrados.filter((p) => p.etapa >= etapas.length - 1).length;
  const eficacia = total ? Math.round((emContrato / total) * 100) : 0;

  // ---- D24: KPIs e gráficos adicionais ----
  const comProposta = processosFiltrados.filter(temProposta);
  const taxaAprovacao = comProposta.length
    ? Math.round((comProposta.filter((p) => p.proposta_aprovada).length / comProposta.length) * 100)
    : 0;

  const agora = Date.now();
  const estagnadosLista = processosFiltrados.filter((p) => {
    if (etapas.length && p.etapa >= etapas.length - 1) return false; // já concluído
    const diasParado = (agora - new Date(p.atualizado_em).getTime()) / 86400000;
    return diasParado >= DIAS_ESTAGNADO;
  });
  const estagnados = estagnadosLista.length;

  const contagemPorOrgao = useMemo(() => {
    const mapa = new Map<string, { rotulo: string; valor: number; processos: Processo[] }>();
    processosFiltrados.forEach((p) => {
      if (!p.orgao) return;
      const atual = mapa.get(p.orgao.id) || { rotulo: p.orgao.razao_social, valor: 0, processos: [] as Processo[] };
      atual.valor += 1;
      atual.processos.push(p);
      mapa.set(p.orgao.id, atual);
    });
    return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor);
  }, [processosFiltrados]);
  const orgaoTop = contagemPorOrgao[0] || null;

  const municipiosLista = processosFiltrados.filter((p) => p.orgao?.tipo_ente === "Município");
  const estadosLista = processosFiltrados.filter((p) => p.orgao?.tipo_ente === "Estado");
  const municipios = municipiosLista.length;
  const estados = estadosLista.length;
  const percMunicipio = total ? Math.round((municipios / total) * 100) : 0;

  const funil = useMemo(() => [
    { rotulo: "TR", valor: processosFiltrados.filter(temTR).length, processos: processosFiltrados.filter(temTR) },
    { rotulo: "Proposta", valor: processosFiltrados.filter(temProposta).length, processos: processosFiltrados.filter(temProposta) },
    { rotulo: "Aprovação", valor: processosFiltrados.filter((p) => p.proposta_aprovada).length, processos: processosFiltrados.filter((p) => p.proposta_aprovada) },
    { rotulo: "Ofício", valor: processosFiltrados.filter(temOficio).length, processos: processosFiltrados.filter(temOficio) },
  ], [processosFiltrados]);

  const porMes = useMemo(() => {
    const mapa = new Map<string, Processo[]>();
    processosFiltrados.forEach((p) => {
      const d = new Date(p.data);
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      mapa.set(chave, [...(mapa.get(chave) || []), p]);
    });
    const chaves = Array.from(mapa.keys()).sort().slice(-6);
    return chaves.map((chave) => {
      const [ano, mes] = chave.split("-");
      const processosDoMes = mapa.get(chave) || [];
      return { rotulo: `${MESES_ABREV[Number(mes) - 1]}/${ano.slice(2)}`, valor: processosDoMes.length, processos: processosDoMes };
    });
  }, [processosFiltrados]);

  const rankingOrgaos = contagemPorOrgao.slice(0, 10);

  // D42: processos finalizados (última fase do fluxo) somem das duas listas
  // abaixo ("Processos por fase" e "Processos e progresso") — já concluíram
  // o acompanhamento. KPIs e gráficos continuam contando todos, para manter
  // as métricas históricas.
  const processosAtivos = useMemo(
    () => (etapas.length ? processosFiltrados.filter((p) => p.etapa < etapas.length - 1) : processosFiltrados),
    [processosFiltrados, etapas]
  );
  const totalAtivos = processosAtivos.length;

  const faseAutoManual = useMemo(() => {
    const auto = processosFiltrados.filter((p) => etapas[p.etapa]?.tipo === "auto");
    const manual = processosFiltrados.filter((p) => etapas[p.etapa]?.tipo === "manual");
    return [
      { rotulo: "Automática", valor: auto.length, cor: "var(--primaria)", processos: auto },
      { rotulo: "Manual", valor: manual.length, cor: "#5a6b7b", processos: manual },
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

      <div className="dash-kpis">
        <HoverCard conteudo={popoverLista("Percentual de processos com os 3 documentos essenciais completos", completosLista)}>
          <div className="kpi">
            <span className="kpi-valor">{qualidade}%</span>
            <span className="kpi-nome">Qualidade</span>
            <span className="kpi-desc">documentação essencial completa</span>
          </div>
        </HoverCard>
        <HoverCard conteudo={popoverLista("Processos abertos e documentos gerados/anexados", processosFiltrados)}>
          <div className="kpi">
            <span className="kpi-valor">{total} <small>proc.</small> · {totalDocs} <small>docs</small></span>
            <span className="kpi-nome">Produtividade</span>
            <span className="kpi-desc">processos e documentos no sistema</span>
          </div>
        </HoverCard>
        <HoverCard conteudo={popoverLista("Quanto das fases automatizadas já foi percorrido, na média", processosFiltrados)}>
          <div className="kpi">
            <span className="kpi-valor">{eficiencia}%</span>
            <span className="kpi-nome">Eficiência</span>
            <span className="kpi-desc">aproveitamento da automação</span>
          </div>
        </HoverCard>
        <HoverCard conteudo={popoverLista("Processos que avançaram além da automação (contrato em diante)", emContratoLista)}>
          <div className="kpi">
            <span className="kpi-valor">{eficacia}% <small>({concluidos} concl.)</small></span>
            <span className="kpi-nome">Eficácia</span>
            <span className="kpi-desc">convertidos em contrato</span>
          </div>
        </HoverCard>
        <HoverCard conteudo={popoverLista("Percentual de propostas geradas que já foram aprovadas", comProposta)}>
          <div className="kpi">
            <span className="kpi-valor">{taxaAprovacao}%</span>
            <span className="kpi-nome">Aprovação de Proposta</span>
            <span className="kpi-desc">{comProposta.length ? `${comProposta.filter((p) => p.proposta_aprovada).length} de ${comProposta.length} propostas` : "nenhuma proposta gerada"}</span>
          </div>
        </HoverCard>
        <HoverCard conteudo={popoverLista(`Processos sem atualização há ${DIAS_ESTAGNADO} dias ou mais`, estagnadosLista)}>
          <div className="kpi">
            <span className="kpi-valor" style={estagnados ? { color: "#c2410c" } : undefined}>{estagnados}</span>
            <span className="kpi-nome">Estagnados</span>
            <span className="kpi-desc">sem atualização há {DIAS_ESTAGNADO}+ dias</span>
          </div>
        </HoverCard>
        <HoverCard conteudo={popoverLista("Órgão (cliente) com mais processos abertos no período filtrado", orgaoTop?.processos || [])}>
          <div className="kpi">
            <span className="kpi-valor" style={{ fontSize: 15 }}>{orgaoTop ? orgaoTop.rotulo : "-"}</span>
            <span className="kpi-nome">Órgão com mais processos</span>
            <span className="kpi-desc">{orgaoTop ? `${orgaoTop.valor} processo(s)` : "sem processos"}</span>
          </div>
        </HoverCard>
        <HoverCard conteudo={popoverLista("Percentual de processos de órgãos do tipo Município vs Estado", [...municipiosLista, ...estadosLista])}>
          <div className="kpi">
            <span className="kpi-valor">{percMunicipio}% <small>Município</small></span>
            <span className="kpi-nome">Município x Estado</span>
            <span className="kpi-desc">{municipios} Município · {estados} Estado</span>
          </div>
        </HoverCard>
      </div>

      <div className="dash-graficos">
        <div className="dash-col">
          <h3>🔻 Funil de conversão</h3>
          <BarrasHorizontais dados={funil} renderPopover={(d) => popoverLista(d.rotulo, d.processos)} />
        </div>
        <div className="dash-col">
          <h3>📈 Processos abertos por mês</h3>
          <BarrasMensais dados={porMes} renderPopover={(d) => popoverLista(d.rotulo, d.processos)} />
        </div>
        <div className="dash-col">
          <h3>🏛️ Processos por órgão</h3>
          <div className="dash-scroll">
            <BarrasHorizontais dados={rankingOrgaos} vazio="Nenhum órgão com processos no período."
              renderPopover={(d) => popoverLista(d.rotulo, d.processos)} />
          </div>
        </div>
        <div className="dash-col">
          <h3>🤖 Fase automática x manual</h3>
          <Donut dados={faseAutoManual} renderPopover={(d) => popoverLista(d.rotulo, d.processos)} />
        </div>
      </div>

      <div className="dash-colunas" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="dash-col">
          <h3>📊 Processos por fase</h3>
          <p className="detalhe" style={{ margin: "-4px 0 8px" }}>Processos finalizados (última fase) não aparecem aqui.</p>
          <div className="dash-scroll">
            {etapas.map((e, i) => {
              const processosFase = processosAtivos.filter((p) => p.etapa === i);
              const qtd = processosFase.length;
              const pct = totalAtivos ? Math.round((qtd / totalAtivos) * 100) : 0;
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
          <p className="detalhe" style={{ margin: "-4px 0 8px" }}>Processos finalizados (última fase) não aparecem aqui.</p>
          <div className="dash-scroll">
            {totalAtivos ? processosAtivos.map((p) => {
              const pct = etapas.length ? Math.round(((p.etapa + 1) / etapas.length) * 100) : 0;
              return (
                <HoverCard key={p.id} largura={280}
                  conteudo={
                    <div>
                      <p style={{ margin: "0 0 8px", fontWeight: 700 }}>{p.titulo} — fase atual</p>
                      <ProcessoTimeline
                        etapas={etapas}
                        etapaAtual={p.etapa}
                        historico={p.historico_etapas || []}
                        bloqueado
                        onSelecionar={() => {}}
                      />
                    </div>
                  }
                >
                  <Link href={`/followup?processo=${p.id}`} className="item fase-linha"
                    style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}>
                    <span className="fase-nome"><strong>{p.titulo}</strong>
                      <span className="detalhe">{etapas[p.etapa]?.nome || ""}</span></span>
                    <div className="fu-progresso fase-barra"><div className="fu-barra" style={{ width: `${pct}%` }} /></div>
                    <span className="fase-qtd">{pct}%</span>
                  </Link>
                </HoverCard>
              );
            }) : <p className="vazio">Nenhum processo encontrado com esses filtros.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

/** Dashboard — KPIs, notificações de automação, processos por fase e progresso.
 * Portado do app Vite (layout em colunas, sem scroll da página).
 * D20: filtros por Órgão, Data (período) e Status (fase) do processo. */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface Etapa { nome: string; tipo: "auto" | "manual" }
interface Orgao { id: string; razao_social: string }
interface Processo {
  id: string; titulo: string; etapa: number; tr_nome: string;
  arquivos: string[]; documentos: { oficio?: unknown };
  orgao: Orgao | null; data: string;
}

const FILTROS_VAZIOS = { orgaoId: "", de: "", ate: "", etapa: "" };

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

  const qualidade = total ? Math.round((processosFiltrados.filter(completo).length / total) * 100) : 0;
  const totalDocs = processosFiltrados.reduce(
    (s, p) => s + Number(temOficio(p)) + Number(temTR(p)) + Number(temProposta(p)) + Number(p.arquivos.includes("resumo")), 0);
  const eficiencia = total
    ? Math.round((processosFiltrados.reduce((s, p) => s + Math.min(p.etapa + 1, nAuto) / nAuto, 0) / total) * 100) : 0;
  const emContrato = processosFiltrados.filter((p) => p.etapa >= nAuto).length;
  const concluidos = processosFiltrados.filter((p) => p.etapa >= etapas.length - 1).length;
  const eficacia = total ? Math.round((emContrato / total) * 100) : 0;

  const avisos = processosFiltrados.flatMap((p) => {
    if (!temOficio(p)) return [{ p, msg: "sem Ofício de abertura — gere ou anexe pelo Follow-up", pronto: false }];
    if (!temTR(p)) return [{ p, msg: "aguardando envio do TR", pronto: false }];
    if (!temProposta(p)) return [{ p, msg: "TR enviado — pronto para gerar a Proposta 🤖", pronto: true }];
    return [];
  });

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
      </div>

      <div className="dash-colunas">
        <div className="dash-col">
          <h3>🔔 Notificações de automação</h3>
          <div className="dash-scroll">
            {avisos.length ? avisos.map((a, i) => (
              <Link href={`/followup?processo=${a.p.id}`} className={`item notif ${a.pronto ? "pronto" : ""}`} key={i}
                style={{ display: "block", textDecoration: "none", color: "inherit", cursor: "pointer" }}
                title="Abrir este processo no Follow-up">
                <div><strong>{a.p.titulo}</strong><span className="detalhe">{a.msg}</span></div>
              </Link>
            )) : <p className="vazio">✅ Nenhuma pendência de automação.</p>}
          </div>
        </div>

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
    </div>
  );
}

"use client";

/** Dashboard — KPIs, notificações de automação, processos por fase e progresso.
 * Portado do app Vite (layout em colunas, sem scroll da página). */
import { useEffect, useState } from "react";

interface Etapa { nome: string; tipo: "auto" | "manual" }
interface Processo {
  id: string; titulo: string; etapa: number; tr_nome: string;
  arquivos: string[]; documentos: { oficio?: unknown };
}

export default function DashboardPage() {
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch("/api/processos").then(async (r) => {
      if (r.status === 401) { window.location.href = "/login"; return; }
      const d = await r.json();
      setProcessos(d.processos || []);
      setEtapas(d.etapas || []);
      setCarregando(false);
    }).catch(() => setCarregando(false));
  }, []);

  const total = processos.length;
  const nAuto = etapas.filter((e) => e.tipo === "auto").length || 1;
  const temOficio = (p: Processo) => !!p.documentos?.oficio;
  const temTR = (p: Processo) => p.arquivos.includes("tr");
  const temProposta = (p: Processo) => p.arquivos.includes("proposta");
  const completo = (p: Processo) => temOficio(p) && temTR(p) && temProposta(p);

  const qualidade = total ? Math.round((processos.filter(completo).length / total) * 100) : 0;
  const totalDocs = processos.reduce(
    (s, p) => s + Number(temOficio(p)) + Number(temTR(p)) + Number(temProposta(p)) + Number(p.arquivos.includes("resumo")), 0);
  const eficiencia = total
    ? Math.round((processos.reduce((s, p) => s + Math.min(p.etapa + 1, nAuto) / nAuto, 0) / total) * 100) : 0;
  const emContrato = processos.filter((p) => p.etapa >= nAuto).length;
  const concluidos = processos.filter((p) => p.etapa >= etapas.length - 1).length;
  const eficacia = total ? Math.round((emContrato / total) * 100) : 0;

  const avisos = processos.flatMap((p) => {
    if (!temOficio(p)) return [{ p, msg: "sem Ofício de abertura — gere ou anexe pelo Follow-up", pronto: false }];
    if (!temTR(p)) return [{ p, msg: "aguardando envio do TR", pronto: false }];
    if (!temProposta(p)) return [{ p, msg: "TR enviado — pronto para gerar a Proposta 🤖", pronto: true }];
    return [];
  });

  if (carregando) return <div className="page-larga"><p className="vazio">Carregando...</p></div>;

  return (
    <div className="page-larga">
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
              <div className={`item notif ${a.pronto ? "pronto" : ""}`} key={i}>
                <div><strong>{a.p.titulo}</strong><span className="detalhe">{a.msg}</span></div>
              </div>
            )) : <p className="vazio">✅ Nenhuma pendência de automação.</p>}
          </div>
        </div>

        <div className="dash-col">
          <h3>📊 Processos por fase</h3>
          <div className="dash-scroll">
            {etapas.map((e, i) => {
              const qtd = processos.filter((p) => p.etapa === i).length;
              const pct = total ? Math.round((qtd / total) * 100) : 0;
              return (
                <div className="item fase-linha" key={i} title={`${qtd} processo(s) na fase ${i + 1}`}>
                  <span className="fase-nome">{i + 1}. {e.nome} {e.tipo === "auto" ? "🤖" : "✋"}</span>
                  <div className="fu-progresso fase-barra"><div className="fu-barra" style={{ width: `${pct}%` }} /></div>
                  <span className="fase-qtd">{qtd}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="dash-col">
          <h3>📋 Processos e progresso</h3>
          <div className="dash-scroll">
            {total ? processos.map((p) => {
              const pct = etapas.length ? Math.round(((p.etapa + 1) / etapas.length) * 100) : 0;
              return (
                <div className="item fase-linha" key={p.id} title={`Fase atual: ${etapas[p.etapa]?.nome || "-"}`}>
                  <span className="fase-nome"><strong>{p.titulo}</strong>
                    <span className="detalhe">{etapas[p.etapa]?.nome || ""}</span></span>
                  <div className="fu-progresso fase-barra"><div className="fu-barra" style={{ width: `${pct}%` }} /></div>
                  <span className="fase-qtd">{pct}%</span>
                </div>
              );
            }) : <p className="vazio">Nenhum processo aberto ainda.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

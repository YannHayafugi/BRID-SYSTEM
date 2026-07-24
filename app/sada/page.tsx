"use client";

/** SADA — Sistema de Análise de Dívida Ativa.
 * Dashboard das 4 análises: estoque, arrecadação, recuperação e ranking.
 * Lê /api/sada/dashboard (agregado a partir das views sada_vw_*). */
import { useEffect, useState } from "react";
import Link from "next/link";
import { BarrasHorizontais, BarrasMensais } from "@/app/components/DashboardCharts";

interface Dados {
  kpis: {
    estoqueTotal: number;
    arrecadadoTotal: number;
    recuperacaoGlobal: number;
    anos: { de: number; ate: number } | null;
    entesPendentes: number;
  };
  estoquePorAno: { ano: number; total: number }[];
  arrecadacaoPorAno: { ano: number; normal: number; da: number }[];
  recuperacaoPorTributo: { sigla: string; estoque: number; arrecadado: number; pct: number }[];
  rankingTributos: { sigla: string; estoque: number }[];
  topDevedores: { cnpj_cpf: string; divida: number; titulos: number }[];
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const milhoes = (v: number) => Math.round(v / 1e5) / 10; // valor em R$ milhões, 1 casa
const cpfCnpj = (v: string) => {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return v;
};

export default function SadaPage() {
  const [d, setD] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/sada/dashboard")
      .then(async (r) => {
        if (r.status === 401) { window.location.href = "/login"; return; }
        const j = await r.json();
        if (r.status === 403) throw new Error(j.erro || "Você não tem acesso ao módulo SADA.");
        if (!r.ok) throw new Error(j.erro || "Falha ao carregar.");
        setD(j);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) return <main className="sada-wrap"><p className="vazio">Carregando análises…</p></main>;
  if (erro) return <main className="sada-wrap"><p className="erro-texto">{erro}</p></main>;
  if (!d) return null;

  return (
    <main className="sada-wrap">
      <header className="sada-head">
        <div>
          <h1>SADA — Análise de Dívida Ativa</h1>
          <p className="sub">
            {d.kpis.anos ? `Base ${d.kpis.anos.de}–${d.kpis.anos.ate}. ` : ""}
            Estoque, arrecadação, recuperação e ranking de tributos.
          </p>
        </div>
        <Link href="/" className="landing-cta secundario">← Hub</Link>
      </header>

      {/* KPIs */}
      <div className="dash-kpis">
        <div className="kpi">
          <span className="kpi-valor">{brl(d.kpis.estoqueTotal)}</span>
          <span className="kpi-nome">Estoque de dívida ativa</span>
          <span className="kpi-desc">saldo em aberto</span>
        </div>
        <div className="kpi">
          <span className="kpi-valor">{brl(d.kpis.arrecadadoTotal)}</span>
          <span className="kpi-nome">Recuperado (DA)</span>
          <span className="kpi-desc">arrecadado da dívida ativa</span>
        </div>
        <div className="kpi">
          <span className="kpi-valor">{d.kpis.recuperacaoGlobal}%</span>
          <span className="kpi-nome">Taxa de recuperação</span>
          <span className="kpi-desc">recuperado ÷ (recuperado + estoque)</span>
        </div>
        <div className="kpi">
          <span className="kpi-valor">{d.kpis.entesPendentes}</span>
          <span className="kpi-nome">Entes pendentes</span>
          <span className="kpi-desc">CNPJ sem cadastro em Órgãos</span>
        </div>
      </div>

      <div className="sada-grid">
        {/* Recuperação por tributo */}
        <section className="card">
          <h2>Recuperação por tributo (%)</h2>
          <BarrasHorizontais
            dados={d.recuperacaoPorTributo.slice(0, 8).map((r) => ({ rotulo: r.sigla, valor: r.pct }))}
            cor="var(--primaria)"
          />
        </section>

        {/* Ranking de tributos por estoque */}
        <section className="card">
          <h2>Maiores tributos por estoque (R$ mi)</h2>
          <BarrasHorizontais
            dados={d.rankingTributos.slice(0, 8).map((r) => ({ rotulo: r.sigla, valor: milhoes(r.estoque) }))}
            cor="#c9a227"
          />
        </section>

        {/* Estoque por ano */}
        <section className="card">
          <h2>Estoque de dívida por ano (R$ mi)</h2>
          <BarrasMensais dados={d.estoquePorAno.map((e) => ({ rotulo: String(e.ano), valor: milhoes(e.total) }))} />
        </section>

        {/* Arrecadação de DA por ano */}
        <section className="card">
          <h2>Arrecadação de DA por ano (R$ mi)</h2>
          <BarrasMensais dados={d.arrecadacaoPorAno.map((a) => ({ rotulo: String(a.ano), valor: milhoes(a.da) }))} />
        </section>

        {/* Top devedores */}
        <section className="card sada-col-2">
          <h2>Maiores devedores</h2>
          <table className="sada-tabela">
            <thead>
              <tr><th>Contribuinte (CNPJ/CPF)</th><th>Títulos</th><th>Dívida</th></tr>
            </thead>
            <tbody>
              {d.topDevedores.map((t) => (
                <tr key={t.cnpj_cpf}>
                  <td>{cpfCnpj(t.cnpj_cpf)}</td>
                  <td>{t.titulos.toLocaleString("pt-BR")}</td>
                  <td>{brl(t.divida)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}

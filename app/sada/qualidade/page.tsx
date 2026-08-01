"use client";

/** SADA · Qualidade dos dados — lista as verificações da base e as linhas
 * incorretas ou vazias encontradas em cada uma. Lê /api/sada/qualidade. */
import { useEffect, useState } from "react";
import Link from "next/link";

interface Check {
  categoria: string;
  tabela: string;
  problema: string;
  qtd: number;
  base: number;
  pct: number;
}

const ROTULO_CATEGORIA: Record<string, string> = {
  total_nulo: "Valor total ausente",
  contribuinte: "Contribuinte não identificado",
  valor: "Valores inválidos",
  campo_chave: "Campos-chave vazios",
};

export default function QualidadePage() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [resumo, setResumo] = useState<{ comProblema: number; totalOcorrencias: number } | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/sada/qualidade")
      .then(async (r) => {
        if (r.status === 401) { window.location.href = "/login"; return; }
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro || "Falha ao carregar.");
        setChecks(j.checks);
        setResumo(j.resumo);
      })
      .catch((e) => setErro(e.message));
  }, []);

  const fmt = (n: number) => n.toLocaleString("pt-BR");

  return (
    <main className="sada-wrap">
      <header className="sada-head">
        <div>
          <h1>Qualidade dos dados</h1>
          <p className="sub">
            Verificações automáticas da base vigente. Linhas incorretas ou vazias
            que merecem revisão na origem.
          </p>
        </div>
        <Link href="/sada" className="landing-cta secundario">← Dashboard</Link>
      </header>

      {erro && <p className="erro-texto">{erro}</p>}

      {resumo && (
        <div className="dash-kpis" style={{ marginBottom: 16 }}>
          <div className="kpi">
            <span className="kpi-valor">{resumo.comProblema}</span>
            <span className="kpi-nome">Verificações com pendência</span>
            <span className="kpi-desc">de {checks?.length ?? 0} no total</span>
          </div>
          <div className="kpi">
            <span className="kpi-valor">{fmt(resumo.totalOcorrencias)}</span>
            <span className="kpi-nome">Ocorrências encontradas</span>
            <span className="kpi-desc">linhas marcadas nas checagens</span>
          </div>
        </div>
      )}

      <section className="card">
        <h2>Verificações</h2>
        {!checks && !erro && <p className="vazio">Carregando…</p>}
        {checks && (
          <table className="sada-tabela">
            <thead>
              <tr><th>Problema</th><th>Categoria</th><th>Linhas</th><th>% da tabela</th></tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.problema} style={c.qtd === 0 ? { opacity: 0.5 } : undefined}>
                  <td>
                    {c.qtd > 0 ? "⚠ " : "✓ "}{c.problema}
                  </td>
                  <td>{ROTULO_CATEGORIA[c.categoria] ?? c.categoria}</td>
                  <td>{fmt(c.qtd)}</td>
                  <td>{c.qtd > 0 ? `${c.pct}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

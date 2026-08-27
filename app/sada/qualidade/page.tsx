"use client";

/** SADA · Qualidade dos dados.
 *
 * Três abas, uma por natureza de problema:
 *   Verificações  — campo vazio, valor inválido, incoerência de linha. Expandir
 *                   uma verificação lista os registros que a originaram.
 *   Duplicidades  — repetição na base vigente (linha inteira ou sequência).
 *   Incoerências  — cruzamentos entre dívida ativa e recebimentos.
 *
 * Tudo recortado pelo cliente selecionado, que soma os CNPJs vinculados a ele.
 * Qualquer listagem pode ser baixada em .xlsx para mandar ao ente corrigir na
 * origem — é o formato em que ele mandou os dados.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";

interface Check {
  codigo: string;
  categoria: string;
  tabela: string;
  problema: string;
  qtd: number;
  base: number;
  pct: number;
}

interface Cliente {
  id: string;
  razaoSocial: string;
  cidade: string;
  uf: string;
  cnpjs: { id: number; cnpj: string; apelido: string | null }[];
}

/** Linha crua de qualquer uma das listagens. As colunas variam por modo. */
type Linha = Record<string, unknown>;

const ROTULO_CATEGORIA: Record<string, string> = {
  total_nulo: "Valor total ausente",
  contribuinte: "Contribuinte não identificado",
  valor: "Valores inválidos",
  campo_chave: "Campos-chave vazios",
  incoerencia: "Incoerência",
};

const ABAS = [
  { id: "checks", rotulo: "Verificações" },
  { id: "duplicidades", rotulo: "Duplicidades" },
  { id: "incoerencias", rotulo: "Incoerências" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

export default function QualidadePage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cliente, setCliente] = useState("");
  const [aba, setAba] = useState<Aba>("checks");

  const [checks, setChecks] = useState<Check[] | null>(null);
  const [resumo, setResumo] = useState<{ comProblema: number; totalOcorrencias: number } | null>(null);

  // Listagem aberta: na aba "checks" é a verificação expandida; nas outras é a
  // própria aba. `truncado` avisa que o limite do servidor cortou o resultado.
  const [expandido, setExpandido] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [truncado, setTruncado] = useState(false);
  const [carregandoLinhas, setCarregandoLinhas] = useState(false);

  const [erro, setErro] = useState("");

  const fmt = (n: number) => n.toLocaleString("pt-BR");
  const qs = useCallback(
    (extra: Record<string, string>) =>
      new URLSearchParams({ ...(cliente ? { cliente } : {}), ...extra }).toString(),
    [cliente],
  );

  useEffect(() => {
    fetch("/api/sada/clientes")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setClientes(j.clientes ?? []))
      .catch(() => {});
  }, []);

  // Resumo: refaz a cada troca de cliente e fecha o que estiver expandido.
  useEffect(() => {
    setChecks(null);
    setExpandido(null);
    setLinhas(null);
    setErro("");
    fetch(`/api/sada/qualidade?${qs({ modo: "resumo" })}`)
      .then(async (r) => {
        if (r.status === 401) { window.location.href = "/login"; return; }
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro || "Falha ao carregar.");
        setChecks(j.checks ?? []);
        setResumo(j.resumo ?? null);
      })
      .catch((e) => setErro(e.message));
  }, [qs]);

  async function carregarLinhas(modo: string, codigo?: string) {
    setCarregandoLinhas(true);
    setLinhas(null);
    setErro("");
    try {
      const r = await fetch(`/api/sada/qualidade?${qs({ modo, ...(codigo ? { codigo } : {}) })}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Falha ao listar.");
      setLinhas(j.linhas ?? []);
      setTruncado(!!j.truncado);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregandoLinhas(false);
    }
  }

  function alternarCheck(c: Check) {
    if (expandido === c.codigo) { setExpandido(null); setLinhas(null); return; }
    setExpandido(c.codigo);
    void carregarLinhas("linhas", c.codigo);
  }

  function trocarAba(nova: Aba) {
    setAba(nova);
    setExpandido(null);
    setLinhas(null);
    if (nova !== "checks") void carregarLinhas(nova);
  }

  /** Baixa a listagem aberta em .xlsx — o mesmo formato em que o ente mandou. */
  function baixar(nomeBase: string) {
    if (!linhas?.length) return;
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "linhas");
    const quem = clientes.find((c) => c.id === cliente)?.razaoSocial ?? "todos-os-entes";
    const nome = `sada-${nomeBase}-${quem}.xlsx`;
    XLSX.writeFile(wb, nome.replace(/[^\p{L}\p{N}._-]+/gu, "-"));
  }

  const colunas = linhas?.length ? Object.keys(linhas[0]) : [];

  const tabelaLinhas = (nomeBase: string) => (
    <>
      <div className="depara-filtros" style={{ marginBottom: 8 }}>
        <button className="btn secondary" onClick={() => baixar(nomeBase)} disabled={!linhas?.length}>
          Baixar .xlsx
        </button>
        {truncado && (
          <small>
            Lista cortada no limite do servidor — o arquivo traz o mesmo recorte.
            Selecione um cliente para reduzir.
          </small>
        )}
      </div>
      {carregandoLinhas && <p className="vazio">Carregando linhas…</p>}
      {!carregandoLinhas && linhas && linhas.length === 0 && <p className="vazio">Nada encontrado.</p>}
      {!carregandoLinhas && linhas && linhas.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="sada-tabela">
            <thead>
              <tr>{colunas.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i}>
                  {colunas.map((c) => (
                    <td key={c}>{l[c] === null || l[c] === undefined ? "—" : String(l[c])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  return (
    <main className="sada-wrap">
      <header className="sada-head">
        <div>
          <h1>Qualidade dos dados</h1>
          <p className="sub">
            Verificações automáticas da base vigente. Linhas incorretas, vazias,
            repetidas ou incoerentes que merecem revisão na origem.
          </p>
        </div>
        <Link href="/sada" className="landing-cta secundario">← Dashboard</Link>
      </header>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="field">
          <label>Cliente</label>
          <select value={cliente} onChange={(e) => setCliente(e.target.value)}>
            <option value="">Todos os entes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.razaoSocial}{c.uf ? " — " + c.uf : ""} ({c.cnpjs.length} CNPJ)
              </option>
            ))}
          </select>
          <small>
            Um cliente soma todos os CNPJs vinculados a ele — prefeitura, autarquias, fundos.
          </small>
        </div>
      </section>

      {erro && <p className="erro-texto">{erro}</p>}

      {resumo && aba === "checks" && (
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

      <div className="depara-abas">
        {ABAS.map((a) => (
          <button key={a.id} className={aba === a.id ? "ativa" : ""} onClick={() => trocarAba(a.id)}>
            {a.rotulo}
          </button>
        ))}
      </div>

      {aba === "checks" && (
        <section className="card">
          <h2>Verificações</h2>
          <p className="sub">Clique numa linha para ver quais registros a originaram.</p>
          {!checks && !erro && <p className="vazio">Carregando…</p>}
          {checks && (
            <table className="sada-tabela">
              <thead>
                <tr><th>Problema</th><th>Categoria</th><th>Linhas</th><th>% da tabela</th></tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr
                    key={c.codigo}
                    onClick={() => { if (c.qtd > 0) alternarCheck(c); }}
                    style={{ opacity: c.qtd === 0 ? 0.5 : 1, cursor: c.qtd > 0 ? "pointer" : "default" }}
                  >
                    <td>{c.qtd > 0 ? (expandido === c.codigo ? "▾ " : "▸ ") : "✓ "}{c.problema}</td>
                    <td>{ROTULO_CATEGORIA[c.categoria] ?? c.categoria}</td>
                    <td>{fmt(c.qtd)}</td>
                    <td>{c.qtd > 0 ? `${c.pct}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {expandido && <div style={{ marginTop: 16 }}>{tabelaLinhas(expandido)}</div>}
        </section>
      )}

      {aba === "duplicidades" && (
        <section className="card">
          <h2>Duplicidades</h2>
          <p className="sub">
            Repetição na base vigente. <strong>linha_duplicada</strong> é a mesma linha de
            negócio mais de uma vez. <strong>sequencia_duplicada</strong> é o mesmo título
            repetido na dívida ativa, onde cada um deveria aparecer uma vez só — em
            lançamentos e recebimentos, várias linhas por título é o normal.
          </p>
          {tabelaLinhas("duplicidades")}
        </section>
      )}

      {aba === "incoerencias" && (
        <section className="card">
          <h2>Incoerências</h2>
          <p className="sub">
            Cruzamentos entre dívida ativa e recebimentos: pagamento sem título
            correspondente, e título com pagamento acima do próprio valor.
          </p>
          {tabelaLinhas("incoerencias")}
        </section>
      )}
    </main>
  );
}

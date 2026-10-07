"use client";

/** SADA · Validação tributária.
 *
 * Duas abas:
 *   Resultado      — o que a base vigente tem de errado ou suspeito, uma linha
 *                    por verificação; expandir lista as dívidas, com o valor
 *                    esperado ao lado do informado, e baixa em .xlsx.
 *   Regras         — a lei geral (limites e regra supletiva, para todos os
 *                    entes) e as leis municipais, por tributo e período de
 *                    vigência, com um simulador para conferir antes de salvar.
 *
 * A conferência linha a linha roda no banco (sada_vw_validacao_*); esta tela
 * só pede o resumo e o detalhe. O simulador usa a mesma matemática em
 * TypeScript (lib/sada/tributario.ts).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import {
  encargosEsperados,
  limitesVigentes,
  mesesAtraso,
  TRIBUTO_TODOS,
  type JurosModo,
  type MultaTipo,
  type NivelRegra,
  type RegraTributaria,
} from "@/lib/sada/tributario";

interface Check {
  codigo: string;
  rotulo: string;
  explicacao: string;
  fundamento: string | null;
  gravidade: "erro" | "alerta";
  dependeDeRegra: boolean;
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

type Linha = Record<string, unknown>;

const ABAS = [
  { id: "resultado", rotulo: "Resultado" },
  { id: "regras", rotulo: "Regras" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

/**
 * Regra nova. Os padrões são os do CTN, que valem quando a lei local cala.
 * A lei geral nasce sem alíquota de multa de propósito: a lei federal não
 * fixa multa de mora municipal — só o teto.
 */
function regraVazia(nivel: NivelRegra, cnpj: string | null): RegraTributaria {
  const geral = nivel === "geral";
  return {
    nivel,
    cnpjOrgao: geral ? null : cnpj,
    tributo: TRIBUTO_TODOS,
    vigenciaInicio: "",
    vigenciaFim: null,
    multaTipo: "unica",
    multaPct: geral ? null : 20,
    multaTetoPct: null,
    jurosModo: "mensal",
    jurosPctMes: 1,
    selicMediaAA: null,
    correcaoIndice: geral ? null : "IPCA",
    correcaoPctAA: null,
    honorariosPct: null,
    toleranciaPct: 5,
    toleranciaReais: 1,
    fundamento: null,
    observacao: null,
    tetoMultaPct: geral ? 20 : null,
    tetoJurosPctMes: geral ? 1 : null,
    anosPrescricao: geral ? 5 : null,
  };
}

/** Lei geral primeiro: é o pano de fundo das municipais. */
function ordenar(regras: RegraTributaria[]): RegraTributaria[] {
  return [...regras].sort(
    (a, b) =>
      Number(a.nivel === "municipal") - Number(b.nivel === "municipal") ||
      (a.cnpjOrgao ?? "").localeCompare(b.cnpjOrgao ?? "") ||
      a.tributo.localeCompare(b.tributo) ||
      b.vigenciaInicio.localeCompare(a.vigenciaInicio),
  );
}

/** Data de hoje em AAAA-MM-DD, para resolver limites de uma regra ainda sem vigência. */
const hoje = () => new Date().toISOString().slice(0, 10);

const brl = (v: unknown) =>
  v === null || v === undefined || v === ""
    ? "—"
    : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ValidacaoTributariaPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cliente, setCliente] = useState("");
  const [aba, setAba] = useState<Aba>("resultado");
  const [erro, setErro] = useState("");

  const [checks, setChecks] = useState<Check[] | null>(null);
  const [resumo, setResumo] = useState<{ comProblema: number; totalOcorrencias: number; base: number } | null>(null);

  const [expandido, setExpandido] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [truncado, setTruncado] = useState(false);
  const [carregandoLinhas, setCarregandoLinhas] = useState(false);

  const [regras, setRegras] = useState<RegraTributaria[] | null>(null);
  const [rascunho, setRascunho] = useState<RegraTributaria | null>(null);
  const [salvando, setSalvando] = useState(false);

  const fmt = (n: number) => n.toLocaleString("pt-BR");
  const qs = useCallback(
    (extra: Record<string, string>) =>
      new URLSearchParams({ ...(cliente ? { cliente } : {}), ...extra }).toString(),
    [cliente],
  );

  const cnpjsDoCliente = useMemo(
    () => clientes.find((c) => c.id === cliente)?.cnpjs ?? [],
    [clientes, cliente],
  );

  useEffect(() => {
    fetch("/api/sada/clientes")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setClientes(j.clientes ?? []))
      .catch(() => {});
  }, []);

  // Resumo e regras são refeitos a cada troca de cliente.
  useEffect(() => {
    setChecks(null);
    setExpandido(null);
    setLinhas(null);
    setRegras(null);
    setRascunho(null);
    setErro("");

    // Ver o comentário equivalente na tela de Qualidade: sem abortar, a
    // resposta de um cliente anterior podia sobrescrever a do atual.
    const ctrl = new AbortController();

    fetch(`/api/sada/validacao?${qs({ modo: "resumo" })}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (r.status === 401) { window.location.href = "/login"; return; }
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro || "Falha ao carregar.");
        setChecks(j.checks ?? []);
        setResumo(j.resumo ?? null);
      })
      .catch((e) => { if (e.name !== "AbortError") setErro(e.message); });

    fetch(`/api/sada/regras?${qs({})}`, { signal: ctrl.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro || "Falha ao carregar as regras.");
        setRegras(ordenar(j.regras ?? []));
      })
      .catch((e) => { if ((e as Error).name !== "AbortError") setErro((e as Error).message); });

    return () => ctrl.abort();
  }, [qs]);

  async function alternarCheck(c: Check) {
    if (expandido === c.codigo) { setExpandido(null); setLinhas(null); return; }
    setExpandido(c.codigo);
    setCarregandoLinhas(true);
    setLinhas(null);
    setErro("");
    try {
      const r = await fetch(`/api/sada/validacao?${qs({ modo: "linhas", codigo: c.codigo })}`);
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

  function baixar(codigo: string) {
    if (!linhas?.length) return;
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "linhas");
    const quem = clientes.find((c) => c.id === cliente)?.razaoSocial ?? "todos-os-entes";
    XLSX.writeFile(wb, `sada-${codigo}-${quem}.xlsx`.replace(/[^\p{L}\p{N}._-]+/gu, "-"));
  }

  async function salvarRegra() {
    if (!rascunho) return;
    setSalvando(true);
    setErro("");
    try {
      const r = await fetch("/api/sada/regras", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rascunho),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Falha ao salvar.");
      setRegras((atual) => ordenar([...(atual ?? []).filter((x) => x.id !== j.regra.id), j.regra]));
      setRascunho(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function excluirRegra(id: number) {
    if (!confirm("Excluir esta regra? As dívidas que dependiam dela passam a ser conferidas pela regra de nível abaixo (ou por nenhuma).")) return;
    setErro("");
    try {
      const r = await fetch(`/api/sada/regras?id=${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Falha ao excluir.");
      setRegras((atual) => (atual ?? []).filter((x) => x.id !== id));
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const colunas = linhas?.length ? Object.keys(linhas[0]) : [];

  return (
    <main className="sada-wrap">
      <header className="sada-head">
        <div>
          <h1>Validação tributária</h1>
          <p className="sub">
            Confere as fórmulas e os valores da dívida ativa contra a regra
            aplicável: a lei municipal do ente quando cadastrada, senão a lei
            geral. Multa, juros, correção monetária, tetos legais e prescrição.
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
                {c.razaoSocial}
                {c.cidade ? ` — ${c.cidade}/${c.uf}` : ""}
              </option>
            ))}
          </select>
        </div>
      </section>

      {erro && <p className="erro">{erro}</p>}

      <nav className="depara-abas" style={{ marginBottom: 16 }}>
        {ABAS.map((a) => (
          <button
            key={a.id}
            className={`btn ${aba === a.id ? "" : "secondary"}`}
            onClick={() => setAba(a.id)}
          >
            {a.rotulo}
          </button>
        ))}
      </nav>

      {aba === "resultado" && (
        <section className="card">
          {!checks && <p className="vazio">Carregando…</p>}
          {checks && resumo && (
            <p className="sub" style={{ marginTop: 0 }}>
              {resumo.comProblema === 0
                ? `Nenhuma divergência em ${fmt(resumo.base)} dívidas examinadas.`
                : `${resumo.comProblema} verificação(ões) com ocorrência, ${fmt(resumo.totalOcorrencias)} no total, sobre ${fmt(resumo.base)} dívidas.`}
            </p>
          )}

          {checks?.map((c) => (
            <div key={c.codigo} style={{ borderTop: "1px solid var(--borda)", padding: "10px 0" }}>
              <button
                onClick={() => alternarCheck(c)}
                disabled={c.qtd === 0}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "baseline",
                  width: "100%",
                  background: "none",
                  border: "none",
                  padding: 0,
                  textAlign: "left",
                  cursor: c.qtd > 0 ? "pointer" : "default",
                  color: "inherit",
                  font: "inherit",
                }}
              >
                <strong style={{ flex: "1 1 auto" }}>
                  {c.rotulo}
                  {c.gravidade === "alerta" && (
                    <span className="detalhe" style={{ marginLeft: 8 }}>alerta</span>
                  )}
                </strong>
                <span style={{ fontWeight: 700 }}>{fmt(c.qtd)}</span>
                <span className="detalhe">{c.pct}%</span>
              </button>
              <p className="detalhe" style={{ margin: "4px 0 0" }}>
                {c.explicacao}
                {c.fundamento ? ` (${c.fundamento})` : ""}
              </p>

              {expandido === c.codigo && (
                <div style={{ marginTop: 10 }}>
                  <div className="depara-filtros" style={{ marginBottom: 8 }}>
                    <button className="btn secondary" onClick={() => baixar(c.codigo)} disabled={!linhas?.length}>
                      Baixar .xlsx
                    </button>
                    {truncado && (
                      <small>
                        Lista cortada no limite do servidor — o arquivo traz o mesmo
                        recorte. Selecione um cliente para reduzir.
                      </small>
                    )}
                  </div>
                  {carregandoLinhas && <p className="vazio">Carregando linhas…</p>}
                  {!carregandoLinhas && linhas && linhas.length === 0 && (
                    <p className="vazio">Nada encontrado.</p>
                  )}
                  {!carregandoLinhas && linhas && linhas.length > 0 && (
                    <div style={{ overflowX: "auto" }}>
                      <table className="sada-tabela">
                        <thead>
                          <tr>{colunas.map((col) => <th key={col}>{col}</th>)}</tr>
                        </thead>
                        <tbody>
                          {linhas.map((l, i) => (
                            <tr key={i}>
                              {colunas.map((col) => (
                                <td key={col}>
                                  {/^(valor|atualizacao|juros|multa|total|.*_esperad[ao])$/.test(col)
                                    ? brl(l[col])
                                    : l[col] === null || l[col] === undefined
                                      ? "—"
                                      : String(l[col])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {aba === "regras" && (
        <section className="card">
          <p className="sub" style={{ marginTop: 0 }}>
            Dois níveis. A <strong>lei geral</strong> vale para todos os entes:
            traz os limites que nenhuma lei municipal afasta (multa, juros,
            prescrição) e a regra supletiva do CTN, usada onde o município não
            tem lei cadastrada. A <strong>lei municipal</strong> traz as
            alíquotas do Código Tributário do ente e prevalece no cálculo do
            esperado — mas não afasta os limites. Cadastre uma regra por
            período de vigência: dívida de 2016 é conferida com a lei de 2016.
          </p>

          {regras && (
            <>
              <table className="sada-tabela">
                <thead>
                  <tr>
                    <th>Nível</th><th>Tributo</th><th>Vigência</th><th>Multa</th>
                    <th>Juros</th><th>Correção</th><th>Limites</th>
                    <th>Fundamento</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {regras.length === 0 && (
                    <tr><td colSpan={9} className="vazio">Nenhuma regra cadastrada.</td></tr>
                  )}
                  {regras.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.nivel === "geral" ? "Lei geral" : "Lei municipal"}
                        {r.cnpjOrgao && (
                          <span className="detalhe" style={{ display: "block" }}>{r.cnpjOrgao}</span>
                        )}
                      </td>
                      <td>{r.tributo === TRIBUTO_TODOS ? "todos" : r.tributo}</td>
                      <td>
                        {r.vigenciaInicio}
                        {r.vigenciaFim ? ` a ${r.vigenciaFim}` : " em diante"}
                      </td>
                      <td>
                        {r.multaPct === null
                          ? "—"
                          : `${r.multaPct}%${r.multaTipo === "progressiva" ? ` ao mês (teto ${r.multaTetoPct ?? "—"}%)` : ""}`}
                      </td>
                      <td>
                        {r.jurosModo === "selic"
                          ? `SELIC${r.selicMediaAA !== null ? ` (~${r.selicMediaAA}% a.a.)` : ""}`
                          : r.jurosPctMes === null
                            ? "—"
                            : `${r.jurosPctMes}% ao mês`}
                      </td>
                      <td>
                        {r.jurosModo === "selic"
                          ? "embutida na SELIC"
                          : `${r.correcaoIndice ?? "—"}${r.correcaoPctAA !== null ? ` ${r.correcaoPctAA}% a.a.` : " (sem taxa)"}`}
                      </td>
                      <td>
                        {r.nivel === "geral"
                          ? `multa ${r.tetoMultaPct ?? "—"}% · juros ${r.tetoJurosPctMes ?? "—"}%/mês · prescrição ${r.anosPrescricao ?? "—"} anos`
                          : "—"}
                      </td>
                      <td>{r.fundamento ?? "—"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="btn secondary" onClick={() => setRascunho({ ...r })}>Editar</button>{" "}
                        <button className="btn secondary" onClick={() => r.id && excluirRegra(r.id)}>Excluir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn"
                  onClick={() => setRascunho(regraVazia("municipal", cnpjsDoCliente[0]?.cnpj ?? ""))}
                  disabled={cnpjsDoCliente.length === 0}
                  title={cnpjsDoCliente.length === 0 ? "Selecione um cliente com CNPJ vinculado" : undefined}
                >
                  Nova lei municipal
                </button>
                <button
                  className="btn secondary"
                  onClick={() => setRascunho(regraVazia("geral", null))}
                >
                  Nova lei geral
                </button>
              </div>
              {cnpjsDoCliente.length === 0 && (
                <p className="detalhe" style={{ marginTop: 8 }}>
                  Selecione um cliente para cadastrar lei municipal. A lei geral
                  aparece e pode ser editada em qualquer seleção.
                </p>
              )}
            </>
          )}

          {rascunho && (
            <FormularioRegra
              regra={rascunho}
              cnpjs={cnpjsDoCliente}
              limites={limitesVigentes(regras ?? [], rascunho.tributo, rascunho.vigenciaInicio || hoje())}
              salvando={salvando}
              onMudar={setRascunho}
              onSalvar={salvarRegra}
              onCancelar={() => setRascunho(null)}
            />
          )}
        </section>
      )}

    </main>
  );
}

/** Formulário + simulador. O simulador usa a mesma fórmula da validação: se o
 *  número aqui não é o que o ente cobra, a regra ainda está errada. */
function FormularioRegra({
  regra,
  cnpjs,
  limites,
  salvando,
  onMudar,
  onSalvar,
  onCancelar,
}: {
  regra: RegraTributaria;
  cnpjs: { id: number; cnpj: string; apelido: string | null }[];
  limites: { tetoMultaPct: number; tetoJurosPctMes: number; anosPrescricao: number };
  salvando: boolean;
  onMudar: (r: RegraTributaria) => void;
  onSalvar: () => void;
  onCancelar: () => void;
}) {
  const geral = regra.nivel === "geral";
  const [sim, setSim] = useState({ principal: 1000, mes: 1, ano: new Date().getFullYear() - 2 });

  const mudar = <K extends keyof RegraTributaria>(campo: K, valor: RegraTributaria[K]) =>
    onMudar({ ...regra, [campo]: valor });

  const numero = (v: string): number | null => (v.trim() === "" ? null : Number(v.replace(",", ".")));

  const dataBase = new Date(Date.UTC(new Date().getFullYear() - 1, 11, 31));
  const meses = mesesAtraso({ mes: sim.mes, ano: sim.ano }, dataBase);
  const esperado = encargosEsperados(regra, sim.principal, meses);
  const somaSim =
    sim.principal + (esperado.multa ?? 0) + (esperado.juros ?? 0) + (esperado.correcao ?? 0);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>
        {regra.id ? "Editar" : "Nova"} {geral ? "lei geral" : "lei municipal"}
      </h3>
      {geral && (
        <p className="detalhe" style={{ marginTop: 0 }}>
          Vale para todos os entes. Se a lei geral mudar, não edite esta: cadastre
          outra com o novo início de vigência e feche esta pelo campo de fim —
          senão a dívida antiga passa a ser conferida com a lei nova.
        </p>
      )}

      <div className="depara-filtros">
        {!geral && (
          <div className="field">
            <label>CNPJ do ente</label>
            <select value={regra.cnpjOrgao ?? ""} onChange={(e) => mudar("cnpjOrgao", e.target.value)}>
              {cnpjs.map((c) => (
                <option key={c.id} value={c.cnpj}>{c.apelido ? `${c.apelido} — ${c.cnpj}` : c.cnpj}</option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label>Tributo</label>
          <input
            value={regra.tributo}
            onChange={(e) => mudar("tributo", e.target.value.toUpperCase())}
            placeholder="IPTU, ISS… ou * para todos"
          />
        </div>
        <div className="field">
          <label>Vigência — início</label>
          <input type="date" value={regra.vigenciaInicio} onChange={(e) => mudar("vigenciaInicio", e.target.value)} />
        </div>
        <div className="field">
          <label>Vigência — fim (vazio = em vigor)</label>
          <input type="date" value={regra.vigenciaFim ?? ""} onChange={(e) => mudar("vigenciaFim", e.target.value || null)} />
        </div>
      </div>

      <div className="depara-filtros">
        <div className="field">
          <label>Multa</label>
          <select value={regra.multaTipo} onChange={(e) => mudar("multaTipo", e.target.value as MultaTipo)}>
            <option value="unica">Única sobre o principal</option>
            <option value="progressiva">Progressiva por mês</option>
          </select>
        </div>
        <div className="field">
          <label>
            {regra.multaTipo === "progressiva" ? "Multa % ao mês" : "Multa %"}
            {geral ? " (deixe vazio: a alíquota é municipal)" : ""}
          </label>
          <input value={regra.multaPct ?? ""} onChange={(e) => mudar("multaPct", numero(e.target.value))} />
        </div>
        {regra.multaTipo === "progressiva" && (
          <div className="field">
            <label>Teto da multa %</label>
            <input value={regra.multaTetoPct ?? ""} onChange={(e) => mudar("multaTetoPct", numero(e.target.value))} />
          </div>
        )}
      </div>

      <div className="depara-filtros">
        <div className="field">
          <label>Juros</label>
          <select value={regra.jurosModo} onChange={(e) => mudar("jurosModo", e.target.value as JurosModo)}>
            <option value="mensal">Taxa fixa ao mês</option>
            <option value="selic">SELIC (juros + correção juntos)</option>
          </select>
        </div>
        {regra.jurosModo === "mensal" ? (
          <div className="field">
            <label>Juros % ao mês{geral ? " (supletivo)" : ""}</label>
            <input value={regra.jurosPctMes ?? ""} onChange={(e) => mudar("jurosPctMes", numero(e.target.value))} />
          </div>
        ) : (
          <div className="field">
            <label>SELIC média % ao ano (aproximação)</label>
            <input value={regra.selicMediaAA ?? ""} onChange={(e) => mudar("selicMediaAA", numero(e.target.value))} />
          </div>
        )}
        {regra.jurosModo === "mensal" && (
          <>
            <div className="field">
              <label>Índice de correção</label>
              <input value={regra.correcaoIndice ?? ""} onChange={(e) => mudar("correcaoIndice", e.target.value || null)} placeholder="IPCA, IPCA-E, IGP-M, UFM…" />
            </div>
            <div className="field">
              <label>Correção % ao ano</label>
              <input value={regra.correcaoPctAA ?? ""} onChange={(e) => mudar("correcaoPctAA", numero(e.target.value))} />
            </div>
          </>
        )}
      </div>

      {geral && (
        <div className="depara-filtros">
          <div className="field">
            <label>Teto da multa %</label>
            <input value={regra.tetoMultaPct ?? ""} onChange={(e) => mudar("tetoMultaPct", numero(e.target.value))} />
          </div>
          <div className="field">
            <label>Teto dos juros % ao mês</label>
            <input value={regra.tetoJurosPctMes ?? ""} onChange={(e) => mudar("tetoJurosPctMes", numero(e.target.value))} />
          </div>
          <div className="field">
            <label>Prescrição (anos)</label>
            <input value={regra.anosPrescricao ?? ""} onChange={(e) => mudar("anosPrescricao", numero(e.target.value))} />
          </div>
        </div>
      )}

      <div className="depara-filtros">
        <div className="field">
          <label>Tolerância %</label>
          <input value={String(regra.toleranciaPct)} onChange={(e) => mudar("toleranciaPct", numero(e.target.value) ?? 5)} />
        </div>
        <div className="field">
          <label>Tolerância mínima R$</label>
          <input value={String(regra.toleranciaReais)} onChange={(e) => mudar("toleranciaReais", numero(e.target.value) ?? 1)} />
        </div>
        <div className="field" style={{ flex: "1 1 260px" }}>
          <label>Fundamento legal</label>
          <input value={regra.fundamento ?? ""} onChange={(e) => mudar("fundamento", e.target.value || null)} placeholder="Lei Municipal 1.234/2015, art. 8º" />
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--borda)", marginTop: 12, paddingTop: 12 }}>
        <strong>Simulador</strong>
        <p className="detalhe" style={{ margin: "2px 0 8px" }}>
          Com esta regra, o que se espera de uma dívida vencida — conferido
          contra {dataBase.toISOString().slice(0, 10)}, a data-base de uma foto
          de fim de ano.
        </p>
        <div className="depara-filtros">
          <div className="field">
            <label>Principal R$</label>
            <input value={String(sim.principal)} onChange={(e) => setSim({ ...sim, principal: Number(e.target.value.replace(",", ".")) || 0 })} />
          </div>
          <div className="field">
            <label>Mês do vencimento</label>
            <input value={String(sim.mes)} onChange={(e) => setSim({ ...sim, mes: Number(e.target.value) || 1 })} />
          </div>
          <div className="field">
            <label>Ano do vencimento</label>
            <input value={String(sim.ano)} onChange={(e) => setSim({ ...sim, ano: Number(e.target.value) || 2020 })} />
          </div>
        </div>
        {meses === null ? (
          <p className="detalhe">
            Vencimento inválido ou posterior à data-base: não há encargo a esperar.
          </p>
        ) : (
          <>
            <p className="detalhe">
              {meses} meses de atraso · multa{" "}
              {esperado.multa === null ? "sem alíquota cadastrada" : brl(esperado.multa)} · juros{" "}
              {esperado.juros === null ? "sem taxa cadastrada" : brl(esperado.juros)} · correção{" "}
              {esperado.correcao === null ? "sem taxa cadastrada" : brl(esperado.correcao)} ·
              <strong> total esperado {brl(somaSim)}</strong>
            </p>
            <p className="detalhe">
              Limites em vigor (da lei geral): multa até {limites.tetoMultaPct}% ·
              juros até {limites.tetoJurosPctMes}% ao mês · prescrição em{" "}
              {limites.anosPrescricao} anos.
            </p>
          </>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <button className="btn" onClick={onSalvar} disabled={salvando || !regra.vigenciaInicio || !regra.cnpjOrgao}>
          {salvando ? "Salvando…" : "Salvar regra"}
        </button>{" "}
        <button className="btn secondary" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

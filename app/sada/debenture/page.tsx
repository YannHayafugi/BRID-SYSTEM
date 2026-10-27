"use client";

/** SADA · Debênture — ficha de dados do ente.
 *
 * Primeira etapa da geração do InfoPack de securitização. Antes de montar
 * gráfico nenhum, esta tela responde duas perguntas:
 *
 *   1. Que arquivo ainda falta pedir ao ente?
 *   2. Cada tributo é imobiliário, mobiliário ou nenhum dos dois?
 *
 * A segunda pergunta parece burocracia e não é: o documento inteiro segmenta
 * a carteira nessas três categorias, e o SADA só conhece a sigla que o ente
 * escreveu. Classificar errado um tributo de milhões desloca a leitura da
 * carteira toda.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ComoUsar, Dica } from "@/app/components/Ajuda";
import {
  CATEGORIAS,
  COR_CATEGORIA,
  ROTULO_CATEGORIA,
  ROTULO_ORIGEM,
  pendentesDeDecisao,
  somarPorCategoria,
  type Categoria,
  type SiglaCategoria,
} from "@/lib/sada/categoria";

interface Cliente {
  id: string;
  razaoSocial: string;
  uf: string;
  cnpjs: { id: number; cnpj: string; apelido: string | null }[];
}

interface Exigencia {
  cnpjOrgao: string;
  codigo: string;
  pronto: boolean;
  exigencia: string;
  detalhe: string;
}

interface Resumo {
  cnpjOrgao: string;
  titulos: number;
  principal: number;
  correcao: number;
  juros: number;
  multa: number;
  total: number;
  safraMin: number | null;
  safraMax: number | null;
  devedores: number;
  ticketMedio: number | null;
  ticketMedioSemTop10: number | null;
  concentracaoTop10: number | null;
}

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const inteiro = (v: number) => v.toLocaleString("pt-BR");

export default function DebenturePage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cliente, setCliente] = useState("");

  const [siglas, setSiglas] = useState<SiglaCategoria[] | null>(null);
  const [prontidao, setProntidao] = useState<Exigencia[]>([]);
  const [resumo, setResumo] = useState<Resumo[]>([]);
  const [semVinculo, setSemVinculo] = useState(false);

  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState<string | null>(null);
  const [soPendentes, setSoPendentes] = useState(false);

  useEffect(() => {
    fetch("/api/sada/clientes")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setClientes(j.clientes ?? []))
      .catch(() => {});
  }, []);

  const carregar = useCallback(
    async (sinal?: AbortSignal) => {
      const q = cliente ? `?cliente=${encodeURIComponent(cliente)}` : "";
      // `no-store`: logo abaixo desta tela a pessoa classifica uma sigla e
      // recarrega. Resposta de cache aqui mostraria a classificação antiga.
      const r = await fetch(`/api/sada/deb/dados${q}`, { signal: sinal, cache: "no-store" });
      if (r.status === 401) { window.location.href = "/login"; return; }
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Falha ao carregar.");
      setSiglas(j.siglas ?? []);
      setProntidao(j.prontidao ?? []);
      setResumo(j.resumo ?? []);
      setSemVinculo(!!j.semVinculo);
    },
    [cliente],
  );

  // AbortController pelo mesmo motivo das outras telas do módulo: trocar de
  // cliente depressa deixava duas respostas em voo, e a última a CHEGAR
  // vencia a última ESCOLHIDA — a tela ficava com os dados de outro ente.
  useEffect(() => {
    const ctrl = new AbortController();
    setSiglas(null);
    setErro("");
    carregar(ctrl.signal).catch((e) => {
      if ((e as Error).name !== "AbortError") setErro((e as Error).message);
    });
    return () => ctrl.abort();
  }, [carregar]);

  async function classificar(s: SiglaCategoria, categoria: Categoria) {
    const chave = `${s.cnpjOrgao}|${s.sigla}`;
    setSalvando(chave);
    setErro("");
    try {
      const r = await fetch("/api/sada/deb/dados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpjOrgao: s.cnpjOrgao, sigla: s.sigla, categoria }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Falha ao salvar.");
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(null);
    }
  }

  async function voltarAoChute(s: SiglaCategoria) {
    const chave = `${s.cnpjOrgao}|${s.sigla}`;
    setSalvando(chave);
    setErro("");
    try {
      const r = await fetch(
        `/api/sada/deb/dados?sigla=${encodeURIComponent(s.sigla)}&cnpjOrgao=${s.cnpjOrgao}`,
        { method: "DELETE" },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Falha ao desfazer.");
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(null);
    }
  }

  const lista = siglas ?? [];
  const pendentes = pendentesDeDecisao(lista);
  const visiveis = soPendentes ? pendentes : lista;
  const porCategoria = somarPorCategoria(lista);
  const principalTotal = porCategoria.reduce((s, c) => s + c.principal, 0);
  // Vários CNPJs no mesmo cliente: aí a coluna do ente passa a importar.
  const variosEntes = new Set(lista.map((s) => s.cnpjOrgao)).size > 1;

  // A prontidão vem por ente; com vários entes selecionados, uma exigência só
  // está atendida se estiver atendida em todos — senão o documento sai capenga
  // para um deles sem avisar.
  const exigencias = Object.values(
    prontidao.reduce<Record<string, Exigencia & { faltam: number }>>((acc, e) => {
      const cur = acc[e.codigo] ?? { ...e, faltam: 0 };
      acc[e.codigo] = {
        ...cur,
        pronto: cur.pronto && e.pronto,
        detalhe: e.pronto ? cur.detalhe : e.detalhe,
        faltam: cur.faltam + (e.pronto ? 0 : 1),
      };
      return acc;
    }, {}),
  );
  const faltando = exigencias.filter((e) => !e.pronto);

  const somaResumo = resumo.reduce(
    (a, r) => ({
      titulos: a.titulos + r.titulos,
      principal: a.principal + r.principal,
      correcao: a.correcao + r.correcao,
      juros: a.juros + r.juros,
      multa: a.multa + r.multa,
      total: a.total + r.total,
      devedores: a.devedores + r.devedores,
    }),
    { titulos: 0, principal: 0, correcao: 0, juros: 0, multa: 0, total: 0, devedores: 0 },
  );
  // Ticket e concentração só fazem sentido num ente de cada vez: somar
  // carteiras de prefeituras diferentes e dividir pelo total de devedores dá
  // um número que não descreve nenhuma delas.
  const resumoUnico = resumo.length === 1 ? resumo[0] : null;

  return (
    <main className="sada-wrap">
      <header className="sada-head">
        <div>
          <h1>Debênture — ficha de dados</h1>
          <p className="sub">
            O que já dá para gerar do documento de securitização, o que ainda
            precisa ser pedido ao ente, e como cada tributo é classificado.
          </p>
        </div>
        <Link href="/sada" className="landing-cta secundario">← Dashboard</Link>
      </header>

      <ComoUsar chave="deb-ficha-v1" titulo="Como usar esta tela">
        <p>
          O documento de emissão separa a carteira em <strong>imobiliário</strong>,{" "}
          <strong>mobiliário</strong> e <strong>não estabelecido</strong> — é o eixo de
          quase todo gráfico dele. O sistema conhece só a sigla que o ente mandou, então
          ele <em>chuta</em> a categoria pelo nome e marca o chute como tal.
        </p>
        <p>
          Confira primeiro as siglas em <strong>chute pelo nome</strong> que pesam mais em
          reais: são as que mudam a leitura da carteira. O resto pode ficar como está.
        </p>
        <p>
          O bloco <strong>o que falta</strong> lista os arquivos ainda não importados. Um
          gráfico sem dado não fica vazio por acaso num material de investidor — ele se lê
          como “esta carteira nunca recuperou nada”. Por isso a tela prefere avisar.
        </p>
      </ComoUsar>

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
            O documento é emitido por ente. Selecione um cliente para ver a ficha dele.
          </small>
        </div>
      </section>

      {erro && <p className="erro-texto">{erro}</p>}
      {semVinculo && (
        <p className="vazio">Este cliente ainda não tem CNPJ vinculado.</p>
      )}
      {siglas === null && !semVinculo && <p className="vazio">Carregando…</p>}

      {siglas !== null && !semVinculo && (
        <>
          {/* ---------------- o que falta ---------------- */}
          <section className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0 }}>
              O que falta{" "}
              <Dica texto="Cada linha é uma exigência de dado do documento. Com vários entes selecionados, a exigência só aparece atendida se estiver atendida em todos." />
            </h2>
            {exigencias.length === 0 && <p className="vazio">Nenhum dado importado ainda.</p>}
            {exigencias.length > 0 && (
              <ul className="deb-exigencias">
                {exigencias.map((e) => (
                  <li key={e.codigo} className={e.pronto ? "ok" : "falta"}>
                    <span className="marca" aria-hidden>{e.pronto ? "✓" : "!"}</span>
                    <div>
                      <strong>{e.exigencia}</strong>
                      <small>
                        {e.detalhe}
                        {e.faltam > 1 && ` (em ${e.faltam} entes)`}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {faltando.length > 0 && (
              <p className="deb-aviso">
                Com o que está importado hoje, {faltando.length} de {exigencias.length}{" "}
                exigências não são atendidas — as páginas que dependem delas não podem ser
                geradas.
              </p>
            )}
          </section>

          {/* ---------------- quadro resumo ---------------- */}
          {somaResumo.titulos > 0 && (
            <section className="card" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Quadro resumo do estoque</h2>
              <div className="dash-kpis">
                <div className="kpi">
                  <span className="kpi-valor">{moeda(somaResumo.total)}</span>
                  <span className="kpi-nome">Valor total</span>
                  <span className="kpi-desc">principal {moeda(somaResumo.principal)}</span>
                </div>
                <div className="kpi">
                  <span className="kpi-valor">{inteiro(somaResumo.devedores)}</span>
                  <span className="kpi-nome">Devedores</span>
                  <span className="kpi-desc">{inteiro(somaResumo.titulos)} títulos</span>
                </div>
                <div className="kpi">
                  <span className="kpi-valor">
                    {resumoUnico?.ticketMedio != null ? moeda(resumoUnico.ticketMedio) : "—"}
                  </span>
                  <span className="kpi-nome">Ticket médio</span>
                  <span className="kpi-desc">
                    {resumoUnico?.ticketMedioSemTop10 != null
                      ? `${moeda(resumoUnico.ticketMedioSemTop10)} sem o top 10`
                      : "só com um ente selecionado"}
                  </span>
                </div>
                <div className="kpi">
                  <span className="kpi-valor">
                    {resumoUnico?.concentracaoTop10 != null
                      ? `${resumoUnico.concentracaoTop10.toLocaleString("pt-BR")}%`
                      : "—"}
                  </span>
                  <span className="kpi-nome">Concentração (top 10)</span>
                  <span className="kpi-desc">
                    {resumoUnico
                      ? `safras ${resumoUnico.safraMin ?? "?"}–${resumoUnico.safraMax ?? "?"}`
                      : "só com um ente selecionado"}
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* ---------------- classificação ---------------- */}
          <section className="card">
            <h2 style={{ marginTop: 0 }}>Classificação dos tributos</h2>

            <div className="deb-barra" role="img"
                 aria-label={porCategoria
                   .map((c) => `${ROTULO_CATEGORIA[c.categoria]}: ${c.pct.toFixed(1)}%`)
                   .join(", ")}>
              {porCategoria.map((c) => (
                c.pct > 0 && (
                  <span key={c.categoria}
                        style={{ width: `${c.pct}%`, background: COR_CATEGORIA[c.categoria] }} />
                )
              ))}
            </div>
            <div className="deb-legenda">
              {porCategoria.map((c) => (
                <span key={c.categoria}>
                  <i style={{ background: COR_CATEGORIA[c.categoria] }} />
                  {ROTULO_CATEGORIA[c.categoria]} — {moeda(c.principal)}{" "}
                  ({c.pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%, {c.siglas} sigla
                  {c.siglas === 1 ? "" : "s"})
                </span>
              ))}
            </div>

            <div className="depara-filtros" style={{ margin: "12px 0 8px" }}>
              <label className="deb-check">
                <input type="checkbox" checked={soPendentes}
                       onChange={(e) => setSoPendentes(e.target.checked)} />
                Só as que ainda estão no chute e pesam mais de R$ 100 mil
                {pendentes.length > 0 && ` (${pendentes.length})`}
              </label>
            </div>

            {lista.length === 0 && <p className="vazio">Nenhum tributo no lote vigente.</p>}
            {visiveis.length === 0 && lista.length > 0 && (
              <p className="vazio">Nenhuma sigla relevante pendente de decisão.</p>
            )}

            {visiveis.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table className="sada-tabela">
                  <thead>
                    <tr>
                      {variosEntes && <th>Ente</th>}
                      <th>Tributo</th>
                      <th>Categoria</th>
                      <th>Origem</th>
                      <th style={{ textAlign: "right" }}>Principal em DA</th>
                      <th style={{ textAlign: "right" }}>Títulos</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((s) => {
                      const chave = `${s.cnpjOrgao}|${s.sigla}`;
                      const ocupado = salvando === chave;
                      return (
                        <tr key={chave} className={s.origem === "heuristica" ? "deb-chute" : undefined}>
                          {variosEntes && <td>{s.cnpjOrgao}</td>}
                          <td>{s.sigla}</td>
                          <td>
                            <select
                              value={s.categoria}
                              disabled={ocupado}
                              onChange={(e) => classificar(s, e.target.value as Categoria)}
                            >
                              {CATEGORIAS.map((c) => (
                                <option key={c.valor} value={c.valor}>{c.rotulo}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <small>{ROTULO_ORIGEM[s.origem]}</small>
                          </td>
                          <td style={{ textAlign: "right" }}>{moeda(s.principalDa)}</td>
                          <td style={{ textAlign: "right" }}>{inteiro(s.titulosDa)}</td>
                          <td>
                            {s.origem === "ente" && (
                              <button className="btn secondary" disabled={ocupado}
                                      onClick={() => voltarAoChute(s)}>
                                Desfazer
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {principalTotal > 0 && (
              <small style={{ display: "block", marginTop: 8 }}>
                Percentuais sobre o principal em dívida ativa do lote vigente.
              </small>
            )}
          </section>
        </>
      )}
    </main>
  );
}

"use client";

/** SADA · situação cadastral dos CNPJs que já existem na base.
 *
 * O enriquecimento é sob demanda e conduzido pelo navegador, uma requisição
 * por CNPJ, com pausa entre elas. Não é preguiça de não fazer em lote no
 * servidor: a BrasilAPI é pública e limita por IP, e um laço server-side sobre
 * centenas de documentos estouraria o tempo da função. Assim você vê o
 * progresso, pode parar no meio, e o que já gravou continua valendo.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface Linha {
  cnpjOrgao: string; documento: string; qtdTitulos: number; dividaTotal: number;
  razaoSocial: string | null; situacao: string | null; situacaoData: string | null;
  consultadoEm: string | null; pendente: boolean;
}
interface Cobertura {
  documentosPj: number; documentosPf: number; documentosInvalidos: number;
  pjComStatus: number; dividaPj: number; dividaPf: number;
}
interface Cliente { id: string; razaoSocial: string; uf: string }

/** Pausa entre consultas. A API não publica um teto exato; 300 ms mantém o
 *  ritmo abaixo de 4 req/s, que é educado e ainda enriquece 200 documentos em
 *  cerca de um minuto. */
const PAUSA_MS = 300;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const nf = (v: number) => v.toLocaleString("pt-BR");
const dataHora = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "nunca");
const doc14 = (d: string) => d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");

export default function StatusDaBase() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cliente, setCliente] = useState("");
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [cobertura, setCobertura] = useState<Cobertura | null>(null);
  const [validadeDias, setValidadeDias] = useState(30);
  const [truncado, setTruncado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  // Progresso do enriquecimento. `cancelar` é ref e não estado porque o laço
  // precisa enxergar a mudança sem depender de novo render.
  const [rodando, setRodando] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const [aFazer, setAFazer] = useState(0);
  const [falhas, setFalhas] = useState<string[]>([]);
  const cancelar = useRef(false);

  useEffect(() => {
    fetch("/api/sada/clientes")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setClientes(j.clientes ?? []))
      .catch(() => {});
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const q = cliente ? `?cliente=${encodeURIComponent(cliente)}` : "";
      const r = await fetch(`/api/sada/cnpj-status${q}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Falha ao carregar.");
      setLinhas(j.linhas ?? []);
      setCobertura(j.cobertura ?? null);
      setValidadeDias(j.validadeDias ?? 30);
      setTruncado(!!j.truncado);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [cliente]);

  useEffect(() => { void carregar(); }, [carregar]);

  const pendentes = (linhas ?? []).filter((l) => l.pendente);

  async function atualizar() {
    if (!pendentes.length) return;
    cancelar.current = false;
    setRodando(true); setFeitos(0); setFalhas([]); setAFazer(pendentes.length);

    const errosLocais: string[] = [];
    for (const l of pendentes) {
      if (cancelar.current) break;
      try {
        const r = await fetch(`/api/cnpj/receita?cnpj=${l.documento}&forcar=1`);
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          errosLocais.push(`${l.documento}: ${j.erro ?? r.status}`);
        }
      } catch {
        errosLocais.push(`${l.documento}: falha de rede`);
      }
      setFeitos((n) => n + 1);
      await espera(PAUSA_MS);
    }

    setFalhas(errosLocais);
    setRodando(false);
    await carregar();
  }

  const pctCobertura = cobertura && cobertura.documentosPj > 0
    ? (100 * cobertura.pjComStatus) / cobertura.documentosPj : 0;

  return (
    <>
      <section className="card" style={{ marginBottom: 16 }}>
        <div className="field">
          <label>Cliente</label>
          <select value={cliente} disabled={rodando}
                  onChange={(e) => setCliente(e.target.value)}>
            <option value="">Todos os entes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.razaoSocial}{c.uf ? " — " + c.uf : ""}</option>
            ))}
          </select>
        </div>
      </section>

      {erro && <p className="erro-texto">{erro}</p>}
      {carregando && !linhas && <p className="vazio">Carregando…</p>}

      {cobertura && (
        <div className="dash-kpis" style={{ marginBottom: 16 }}>
          <div className="kpi">
            <span className="kpi-valor">{pctCobertura.toFixed(0)}%</span>
            <span className="kpi-nome">Cobertura</span>
            <span className="kpi-desc">
              {nf(cobertura.pjComStatus)} de {nf(cobertura.documentosPj)} CNPJ com status
            </span>
          </div>
          <div className="kpi">
            <span className="kpi-valor">{nf(cobertura.documentosPf)}</span>
            <span className="kpi-nome">CPF — fora do alcance</span>
            <span className="kpi-desc">{brl(cobertura.dividaPf)} em dívida</span>
          </div>
          <div className="kpi">
            <span className="kpi-valor">{brl(cobertura.dividaPj)}</span>
            <span className="kpi-nome">Dívida de PJ</span>
            <span className="kpi-desc">é o que a consulta alcança</span>
          </div>
          {cobertura.documentosInvalidos > 0 && (
            <div className="kpi">
              <span className="kpi-valor">{nf(cobertura.documentosInvalidos)}</span>
              <span className="kpi-nome">Documentos inválidos</span>
              <span className="kpi-desc">nem 11 nem 14 dígitos</span>
            </div>
          )}
        </div>
      )}

      {linhas && (
        <section className="card">
          <h2>Situação cadastral dos CNPJs da base</h2>
          <p className="sub">
            Ordenado por dívida. Consultas com mais de {validadeDias} dias entram
            como pendentes e voltam a ser buscadas.
          </p>

          <div className="depara-filtros" style={{ marginBottom: 12 }}>
            {!rodando ? (
              <button className="btn" onClick={() => void atualizar()} disabled={pendentes.length === 0}>
                {pendentes.length === 0
                  ? "Tudo atualizado"
                  : `Atualizar ${nf(pendentes.length)} pendente(s)`}
              </button>
            ) : (
              <button className="btn secondary" onClick={() => { cancelar.current = true; }}>
                Parar ({feitos} de {aFazer})
              </button>
            )}
            <button className="btn secondary" onClick={() => void carregar()} disabled={rodando || carregando}>
              Recarregar
            </button>
            {truncado && <small>Lista cortada no limite — filtre por cliente para reduzir.</small>}
          </div>

          {rodando && (
            <div style={{ margin: "12px 0" }}>
              <div style={{ height: 10, background: "var(--track)", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${aFazer ? (100 * feitos) / aFazer : 0}%`,
                              background: "var(--accent, #c9a227)" }} />
              </div>
              <small>Consultando uma por vez, com pausa entre elas para não atropelar a API.</small>
            </div>
          )}

          {falhas.length > 0 && (
            <p className="erro-texto">
              {falhas.length} consulta(s) falharam: {falhas.slice(0, 3).join(" · ")}
              {falhas.length > 3 ? ` e mais ${falhas.length - 3}` : ""}
            </p>
          )}

          {linhas.length === 0 ? (
            <p className="vazio">
              Nenhum CNPJ na base vigente. Só pessoa jurídica aparece aqui — se a
              carteira for toda de pessoa física, não há o que consultar.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="sada-tabela">
                <thead>
                  <tr>
                    <th>CNPJ</th><th>Razão social</th><th>Situação</th>
                    <th>Títulos</th><th>Dívida</th><th>Última consulta</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.cnpjOrgao + l.documento} style={l.pendente ? { opacity: 0.7 } : undefined}>
                      <td>{doc14(l.documento)}</td>
                      <td>{l.razaoSocial ?? "—"}</td>
                      <td style={{
                        color: l.situacao
                          ? (l.situacao.toUpperCase() === "ATIVA" ? "var(--ok, #2e7d32)" : "var(--alerta, #c62828)")
                          : "inherit",
                      }}>
                        {l.situacao ?? "sem status"}
                      </td>
                      <td>{nf(l.qtdTitulos)}</td>
                      <td>{brl(l.dividaTotal)}</td>
                      <td>{dataHora(l.consultadoEm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}

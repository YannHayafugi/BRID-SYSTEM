"use client";

/** SADA · Completude do INFO REQUEST LIST.
 *
 * Recebe o arquivo devolvido pelo ente e mede quanto foi preenchido, campo a
 * campo, contra a especificação vigente no banco. O arquivo é lido no
 * navegador; ao servidor vai só o resultado da medição.
 *
 * A régua NÃO vem do arquivo. A criticidade de cada campo está na aba LEIA da
 * planilha, e lê-la de lá deixaria o ente alterar — de propósito ou sem querer
 * — o critério pelo qual está sendo avaliado.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import {
  analisarCompletude, separarAba, type CampoSpec, type Relatorio,
} from "@/lib/sada/completude";
import { somenteDigitos } from "@/lib/mascaras";

interface Versao { id: number; nome: string; arquivo_nome: string | null; created_at: string }
interface Cliente { id: string; razaoSocial: string; uf: string }

const pct = (n: number) => `${n.toFixed(1)}%`;

export default function CompletudePage() {
  const [versao, setVersao] = useState<Versao | null>(null);
  const [spec, setSpec] = useState<CampoSpec[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);

  const [cliente, setCliente] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);

  const [rel, setRel] = useState<Relatorio | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    fetch("/api/sada/spec")
      .then(async (r) => {
        const j = await r.json();
        if (r.status === 401) { window.location.href = "/login"; return; }
        if (!r.ok) throw new Error(j.erro || "Falha ao carregar a especificação.");
        setVersao(j.versao);
        setSpec(j.campos ?? []);
      })
      .catch((e) => setErro(e.message));

    fetch("/api/sada/clientes")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setClientes(j.clientes ?? []))
      .catch(() => {});
  }, []);

  async function analisar() {
    if (!arquivo) { setErro("Escolha o arquivo devolvido pelo ente."); return; }
    if (!spec.length) { setErro("Sem especificação vigente para comparar."); return; }
    setAnalisando(true); setErro(""); setOk(""); setRel(null);
    try {
      const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array" });
      // As abas a ler saem da especificação, não de uma lista fixa: mudou a
      // versão da planilha, a tela acompanha sem alteração de código.
      const abas = Array.from(new Set(spec.map((s) => s.aba)));
      const recebidas = abas
        .filter((a) => wb.SheetNames.includes(a))
        .map((a) =>
          separarAba(a, XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[a], {
            header: 1, raw: false, defval: null,
          }) as unknown[][]),
        );
      setRel(analisarCompletude(spec, recebidas));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setAnalisando(false);
    }
  }

  async function registrar() {
    if (!rel || !versao || !arquivo) return;
    setSalvando(true); setErro(""); setOk("");
    try {
      const r = await fetch("/api/sada/envios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versaoId: versao.id,
          orgaoId: cliente || null,
          cnpj: cnpj ? somenteDigitos(cnpj) : null,
          arquivoNome: arquivo.name,
          indiceCompletude: Number(rel.indiceCompletude.toFixed(2)),
          resumo: { porCriticidade: rel.porCriticidade, porAba: rel.porAba },
          porCampo: rel.porCampo,
          estruturais: rel.estruturais,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Falha ao registrar.");
      setOk("Envio registrado no histórico.");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  /** Exporta o detalhe por campo — é o que volta ao ente como lista de pendências. */
  function baixar() {
    if (!rel) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rel.porCampo.map((c) => ({
      Aba: c.aba, Campo: c.campo, Criticidade: c.criticidade,
      Coluna_presente: c.presente ? "sim" : "NAO",
      Linhas: c.total, Preenchidas: c.preenchidas, Percentual: Number(c.pct.toFixed(1)),
    }))), "por campo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rel.estruturais), "estruturais");
    const quem = clientes.find((c) => c.id === cliente)?.razaoSocial ?? (cnpj || "envio");
    XLSX.writeFile(wb, `completude-${quem}.xlsx`.replace(/[^\p{L}\p{N}._-]+/gu, "-"));
  }

  const pendentes = rel
    ? rel.porCampo.filter((c) => c.criticidade === "Essencial" && c.pct < 100).sort((a, b) => a.pct - b.pct)
    : [];

  return (
    <main className="sada-wrap">
      <header className="sada-head">
        <div>
          <h1>Completude do envio</h1>
          <p className="sub">
            Quanto do que foi pedido ao ente veio preenchido, medido contra a
            especificação {versao ? <strong>{versao.nome}</strong> : "vigente"}.
          </p>
        </div>
        <Link href="/sada" className="landing-cta secundario">← Dashboard</Link>
      </header>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="field">
          <label>Cliente</label>
          <select value={cliente} onChange={(e) => setCliente(e.target.value)} disabled={analisando}>
            <option value="">Não vincular</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.razaoSocial}{c.uf ? " — " + c.uf : ""}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>CNPJ do ente</label>
          <input value={cnpj} onChange={(e) => setCnpj(e.target.value)}
                 placeholder="Somente números" disabled={analisando} />
        </div>
        <div className="field">
          <label>Arquivo devolvido pelo ente (.xlsx)</label>
          <input type="file" accept=".xlsx" disabled={analisando}
                 onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); setRel(null); setOk(""); }} />
        </div>
        <button className="btn" onClick={analisar} disabled={analisando || !arquivo || !spec.length}>
          {analisando ? "Analisando…" : "Analisar"}
        </button>
      </section>

      {erro && <p className="erro-texto">{erro}</p>}
      {ok && <p className="vazio">{ok}</p>}

      {rel && (
        <>
          <div className="dash-kpis" style={{ marginBottom: 16 }}>
            <div className="kpi">
              <span className="kpi-valor">{pct(rel.indiceCompletude)}</span>
              <span className="kpi-nome">Índice de completude</span>
              <span className="kpi-desc">ponderado pela criticidade</span>
            </div>
            {rel.porCriticidade.map((c) => (
              <div className="kpi" key={c.criticidade}>
                <span className="kpi-valor">{pct(c.pct)}</span>
                <span className="kpi-nome">{c.criticidade}</span>
                <span className="kpi-desc">
                  {c.celulasPreenchidas.toLocaleString("pt-BR")} de {c.celulasEsperadas.toLocaleString("pt-BR")} células
                </span>
              </div>
            ))}
          </div>

          <section className="card" style={{ marginBottom: 16 }}>
            <h2>Por bloco</h2>
            <table className="sada-tabela">
              <thead>
                <tr><th>Aba</th><th>Linhas</th><th>Colunas ausentes</th><th>Essenciais</th><th>Geral</th></tr>
              </thead>
              <tbody>
                {rel.porAba.map((a) => (
                  <tr key={a.aba} style={a.presente ? undefined : { opacity: 0.6 }}>
                    <td>{a.presente ? "" : "⚠ "}{a.aba}</td>
                    <td>{a.linhas.toLocaleString("pt-BR")}</td>
                    <td>{a.camposAusentes > 0 ? `${a.camposAusentes} de ${a.camposEsperados}` : "—"}</td>
                    <td>{pct(a.pctEssencial)}</td>
                    <td>{pct(a.pctGeral)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card" style={{ marginBottom: 16 }}>
            <h2>Essenciais pendentes <small>({pendentes.length})</small></h2>
            <p className="sub">É esta a lista que volta ao ente. Ordenada do mais vazio para o mais completo.</p>
            {pendentes.length === 0 ? (
              <p className="vazio">Todos os campos essenciais vieram completos.</p>
            ) : (
              <table className="sada-tabela">
                <thead><tr><th>Aba</th><th>Campo</th><th>Situação</th><th>Preenchido</th></tr></thead>
                <tbody>
                  {pendentes.map((c) => (
                    <tr key={c.aba + c.campo}>
                      <td>{c.aba}</td>
                      <td>{c.campo}</td>
                      <td>{c.presente ? "coluna existe" : "coluna ausente"}</td>
                      <td>{c.preenchidas.toLocaleString("pt-BR")} de {c.total.toLocaleString("pt-BR")} ({pct(c.pct)})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card" style={{ marginBottom: 16 }}>
            <h2>Achados estruturais <small>({rel.estruturais.length})</small></h2>
            <p className="sub">
              Não entram no percentual, mas invalidam a leitura se ignorados — aba ou
              coluna faltando, linhas de exemplo não apagadas, colunas fora da especificação.
            </p>
            {rel.estruturais.length === 0 ? (
              <p className="vazio">Nada a apontar na estrutura do arquivo.</p>
            ) : (
              <ul>
                {rel.estruturais.map((e, i) => (
                  <li key={i}>{e.severidade === "erro" ? "⚠ " : "· "}{e.aba ? <strong>{e.aba}</strong> : null} {e.detalhe}</li>
                ))}
              </ul>
            )}
          </section>

          <div className="depara-filtros">
            <button className="btn" onClick={registrar} disabled={salvando || !versao}>
              {salvando ? "Registrando…" : "Registrar envio"}
            </button>
            <button className="btn secondary" onClick={baixar}>Baixar .xlsx</button>
          </div>
        </>
      )}
    </main>
  );
}

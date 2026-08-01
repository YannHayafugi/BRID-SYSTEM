"use client";

/** SADA · Atualização da Dívida — sobe uma planilha (.xlsx) e atualiza os
 * dados de um tipo (dívida ativa, lançamentos, recebimentos, recebimentos DA).
 * O navegador lê e converte a planilha e envia ao servidor em lotes pequenos
 * (o Vercel limita o corpo da requisição), com barra de progresso. O lote novo
 * entra como vigente e o anterior é preservado como histórico. */
import { useRef, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import {
  analisarQualidade, linhaVazia, mapearLinha, RelatorioQualidade,
  ROTULO_TIPO, TIPOS_SADA, TipoSada,
} from "@/lib/sada/import";

const LOTE = 1000;

interface Aba { ano: number; linhas: unknown[][] }

export default function AtualizacaoDivida() {
  const [tipo, setTipo] = useState<TipoSada>("divida_ativa");
  const [cnpj, setCnpj] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [status, setStatus] = useState("");
  const [erro, setErro] = useState("");
  const [concluido, setConcluido] = useState<string | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioQualidade | null>(null);
  // Planilha já lida — evita reprocessar o arquivo ao confirmar os avisos.
  const cache = useRef<{ arquivo: File; tipo: TipoSada; abas: Aba[] } | null>(null);

  /** Troca de arquivo/tipo invalida a verificação anterior. */
  function resetarVerificacao() {
    setRelatorio(null); setErro(""); setConcluido(null);
  }

  async function lerPlanilha(f: File, t: TipoSada): Promise<Aba[]> {
    const c = cache.current;
    if (c && c.arquivo === f && c.tipo === t) return c.abas;
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const abas: Aba[] = wb.SheetNames
      .map((nome) => ({ nome, ano: parseInt(nome, 10) }))
      .filter((a) => Number.isFinite(a.ano))
      .map(({ nome, ano }) => {
        const m = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, raw: false });
        return { ano, linhas: m.slice(1).filter((r) => !linhaVazia(r as unknown[])) as unknown[][] };
      });
    cache.current = { arquivo: f, tipo: t, abas };
    return abas;
  }

  async function post(url: string, body: unknown) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
    return j;
  }

  /** `forcar` = usuário já viu os avisos e mandou seguir mesmo assim. */
  async function atualizar(forcar = false) {
    setErro(""); setConcluido(null);
    if (!cnpj.trim()) { setErro("Informe o CNPJ do ente."); return; }
    if (!arquivo) { setErro("Selecione a planilha (.xlsx)."); return; }

    setRodando(true); setProgresso(0); setStatus("Lendo a planilha…");
    let importacaoId: number | null = null;
    let total = 0;
    let anoMin = Infinity, anoMax = -Infinity;

    try {
      const abas = await lerPlanilha(arquivo, tipo);
      const totalLinhas = abas.reduce((s, a) => s + a.linhas.length, 0);
      if (totalLinhas === 0) throw new Error("A planilha não tem linhas de dados.");

      // Verificação de qualidade ANTES de abrir o lote: /api/sada/importar já
      // marca a importação anterior como não-vigente, então uma planilha ruim
      // derrubaria o retrato atual sem ter nada correto para pôr no lugar.
      setStatus("Verificando os dados…");
      const rel = analisarQualidade(tipo, abas);
      setRelatorio(rel);

      if (rel.temBloqueio) {
        throw new Error(
          "A planilha tem dados incorretos ou vazios que impedem a importação. " +
          "Corrija na origem e envie novamente — nada foi alterado.",
        );
      }
      // Só avisos: espera a confirmação explícita do usuário (o finally libera o botão).
      if (rel.achados.length > 0 && !forcar) return;

      setStatus("Iniciando importação…");
      const ini = await post("/api/sada/importar", {
        cnpj: cnpj.trim(), tipo, arquivoNome: arquivo.name,
      });
      importacaoId = ini.importacaoId;

      let enviadas = 0;
      let buffer: Record<string, unknown>[] = [];

      const flush = async () => {
        if (!buffer.length) return;
        await post("/api/sada/importar/lote", { importacaoId, tipo, linhas: buffer });
        enviadas += buffer.length;
        buffer = [];
        setProgresso(Math.round((enviadas / totalLinhas) * 100));
      };

      for (const { ano, linhas } of abas) {
        anoMin = Math.min(anoMin, ano); anoMax = Math.max(anoMax, ano);
        setStatus(`Enviando ${ano}…`);
        for (const r of linhas) {
          buffer.push(mapearLinha(tipo, r, { cnpj_orgao: cnpj.trim(), ano }));
          total++;
          if (buffer.length >= LOTE) await flush();
        }
      }
      await flush();

      setStatus("Finalizando…");
      await post("/api/sada/importar/finalizar", {
        importacaoId, total, anoInicio: anoMin, anoFim: anoMax,
      });

      setProgresso(100);
      setRelatorio(null);
      setConcluido(`${total.toLocaleString("pt-BR")} linhas atualizadas (${anoMin}–${anoMax}).`);
    } catch (e) {
      setErro((e as Error).message);
      if (importacaoId) {
        // desfaz o lote incompleto para não deixar dado parcial
        await post("/api/sada/importar/finalizar", { importacaoId, cancelar: true }).catch(() => {});
      }
    } finally {
      setRodando(false); setStatus("");
    }
  }

  return (
    <main className="sada-wrap">
      <header className="sada-head">
        <div>
          <h1>Atualização da Dívida</h1>
          <p className="sub">
            Suba a planilha (.xlsx) de um tipo. Os dados anteriores do mesmo ente e tipo
            viram histórico; o novo passa a valer no dashboard.
          </p>
        </div>
        <Link href="/sada" className="landing-cta secundario">← Dashboard</Link>
      </header>

      <section className="card" style={{ maxWidth: 560 }}>
        <div className="field">
          <label>Tipo de planilha</label>
          <select value={tipo} disabled={rodando}
            onChange={(e) => { setTipo(e.target.value as TipoSada); resetarVerificacao(); }}>
            {TIPOS_SADA.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
          </select>
        </div>

        <div className="field">
          <label>CNPJ do ente</label>
          <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="Somente números"
            disabled={rodando} />
        </div>

        <div className="field">
          <label>Planilha (.xlsx)</label>
          <input type="file" accept=".xlsx" disabled={rodando}
            onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); resetarVerificacao(); }} />
          <small>Uma aba por ano. O envio é feito em lotes — pode levar alguns minutos.</small>
        </div>

        {rodando && (
          <div style={{ margin: "12px 0" }}>
            <div style={{ height: 10, background: "var(--track)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progresso}%`, background: "var(--primaria)", transition: "width .2s" }} />
            </div>
            <p className="detalhe" style={{ marginTop: 6 }}>{status} {progresso}%</p>
          </div>
        )}

        {relatorio && relatorio.achados.length > 0 && (
          <div className={`qualidade-relatorio ${relatorio.temBloqueio ? "bloqueio" : "aviso"}`}>
            <strong>
              {relatorio.temBloqueio
                ? "Importação bloqueada — dados incorretos ou vazios na planilha"
                : "Dados incorretos ou vazios encontrados"}
            </strong>
            <p className="detalhe">
              {relatorio.totalLinhas.toLocaleString("pt-BR")} linhas verificadas.
              {relatorio.temBloqueio
                ? " Corrija os itens marcados como impeditivos e envie de novo."
                : " Você pode importar mesmo assim — os avisos ficam registrados na tela de Qualidade."}
            </p>
            <ul>
              {relatorio.achados.map((a) => (
                <li key={a.codigo}>
                  <span className={`tag ${a.severidade}`}>
                    {a.severidade === "bloqueio" ? "impeditivo" : "aviso"}
                  </span>{" "}
                  {a.rotulo} — <strong>{a.qtd.toLocaleString("pt-BR")}</strong>
                  {a.qtd === 1 ? " linha" : " linhas"}
                  <br />
                  <small>
                    ex.: {a.exemplos.join("; ")}{a.qtd > a.exemplos.length ? "…" : ""}
                  </small>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="actions">
          <button className="btn" onClick={() => atualizar()} disabled={rodando}>
            {rodando ? "Atualizando…" : "Atualizar dívida"}
          </button>
          {relatorio && !relatorio.temBloqueio && relatorio.achados.length > 0 && !rodando && (
            <button className="btn secondary" onClick={() => atualizar(true)}>
              Importar mesmo assim
            </button>
          )}
          {erro && <span className="msg erro">{erro}</span>}
          {concluido && <span className="msg ok">✅ {concluido}</span>}
        </div>
      </section>
    </main>
  );
}

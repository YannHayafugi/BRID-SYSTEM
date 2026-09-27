"use client";

/** SADA · Atualização da Dívida — sobe uma planilha (.xlsx) e atualiza os
 * dados de um tipo (dívida ativa, lançamentos, recebimentos, recebimentos DA).
 *
 * A leitura do arquivo e o envio dos lotes rodam num WEB WORKER
 * (importador.worker.ts). Antes rodavam aqui, na thread da interface, e a aba
 * congelava: medido com as planilhas reais, 19 s na dívida ativa e 43 s em
 * lançamentos sem desenhar nada — nem a barra de progresso, nem o texto de
 * status. Agora esta tela só conversa com o worker e mostra o andamento.
 *
 * O lote novo entra como vigente e o anterior é preservado como histórico. */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RelatorioQualidade, ROTULO_TIPO, TIPOS_SADA, TipoSada } from "@/lib/sada/import";
import { AbaEscolhida, AbasModo, Mapa } from "@/lib/sada/depara";
import { somenteDigitos } from "@/lib/mascaras";
import type { DoWorker, ParaWorker } from "./importador.worker";

/** Linhas por requisição. O corpo precisa caber no limite do servidor. */
const LOTE = 1000;

interface ConfigDePara {
  mapa: Mapa;
  abasModo: AbasModo;
  abas: AbaEscolhida[] | null;
  padrao: boolean;
  /** Nomes de todos os mapas do ente+tipo — alimenta o seletor. */
  nomes: string[];
  pares: { campo: "sigla" | "fase"; valor_origem: string; valor_canonico: string }[];
}

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
  // Qual DE/PARA usar. Vazio = deixa o servidor escolher o mais recente, que é
  // o comportamento de quando só podia existir um mapa por ente+tipo.
  const [mapaNome, setMapaNome] = useState("");
  const [mapasDisponiveis, setMapasDisponiveis] = useState<string[]>([]);

  const worker = useRef<Worker | null>(null);
  /** Resolve ou rejeita a mensagem que está em curso no worker. */
  const emCurso = useRef<{ ok: (m: DoWorker) => void; falha: (e: Error) => void } | null>(null);
  /** O que já está lido DENTRO do worker — evita reler o arquivo quando o
   *  usuário confirma os avisos. */
  const analisado = useRef<
    { arquivo: File; tipo: TipoSada; cnpj: string; mapa: string; anos: number[] } | null
  >(null);

  /** Um worker por tela. Encerrado ao sair: um worker vivo depois da
   *  navegação continuaria segurando a planilha inteira em memória. */
  useEffect(() => {
    const w = new Worker(new URL("./importador.worker.ts", import.meta.url));
    w.onmessage = (e: MessageEvent<DoWorker>) => {
      const m = e.data;
      if (m.tipo === "status") { setStatus(m.texto); return; }
      if (m.tipo === "progresso") { setProgresso(m.pct); return; }
      const pendente = emCurso.current;
      emCurso.current = null;
      if (!pendente) return;
      if (m.tipo === "erro") pendente.falha(new Error(m.mensagem));
      else pendente.ok(m);
    };
    w.onerror = () => {
      const pendente = emCurso.current;
      emCurso.current = null;
      pendente?.falha(new Error("Falha ao processar a planilha no navegador."));
    };
    worker.current = w;
    return () => { w.terminate(); worker.current = null; };
  }, []);

  /** Manda uma mensagem e espera a resposta final (análise, envio ou erro). */
  function pedir(msg: ParaWorker, transferir?: Transferable[]): Promise<DoWorker> {
    const w = worker.current;
    if (!w) return Promise.reject(new Error("Processador da planilha indisponível."));
    return new Promise<DoWorker>((ok, falha) => {
      emCurso.current = { ok, falha };
      w.postMessage(msg, transferir ?? []);
    });
  }

  /** Troca de arquivo/tipo invalida a verificação anterior. */
  function resetarVerificacao() {
    setRelatorio(null); setErro(""); setConcluido(null);
    analisado.current = null;
  }

  /** Busca o DE/PARA do ente. Sem cadastro a API devolve o layout posicional
   *  padrão (`padrao: true`), então esta tela funciona igual para ente antigo. */
  async function carregarDePara(cnpjLimpo: string, t: TipoSada, nome: string): Promise<ConfigDePara> {
    const q = nome ? `&nome=${encodeURIComponent(nome)}` : "";
    const r = await fetch(`/api/sada/depara?cnpj=${encodeURIComponent(cnpjLimpo)}&tipo=${t}${q}`);
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro || "Falha ao carregar o DE/PARA do ente.");

    const rv = await fetch(`/api/sada/depara/valores?cnpj=${encodeURIComponent(cnpjLimpo)}`);
    const jv = await rv.json().catch(() => ({ pares: [] }));

    return {
      mapa: j.depara.mapa ?? {},
      abasModo: j.depara.abas_modo ?? "ano_no_nome",
      abas: j.depara.abas ?? null,
      padrao: !!j.padrao,
      nomes: j.nomes ?? [],
      pares: rv.ok
        ? (jv.pares ?? []).filter((p: { campo: string }) => p.campo === "sigla" || p.campo === "fase")
        : [],
    };
  }

  /** Lista os mapas do ente+tipo para o seletor. Silencioso de propósito:
   *  falhar aqui não impede importar, só esconde a escolha. */
  async function carregarMapas(t: TipoSada) {
    const c = somenteDigitos(cnpj);
    if (!c) { setMapasDisponiveis([]); return; }
    try {
      const r = await fetch(`/api/sada/depara?cnpj=${encodeURIComponent(c)}&tipo=${t}`);
      const j = await r.json();
      const nomes: string[] = r.ok ? (j.nomes ?? []) : [];
      setMapasDisponiveis(nomes);
      setMapaNome((atual) => (nomes.includes(atual) ? atual : ""));
    } catch {
      setMapasDisponiveis([]);
    }
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

    setRodando(true); setProgresso(0); setStatus("Preparando…");
    let importacaoId: number | null = null;

    try {
      // Só dígitos: a mesma chave usada pelo DE/PARA e gravada nas tabelas.
      const cnpjLimpo = somenteDigitos(cnpj);

      // Planilha já lida no worker: confirmar os avisos não reabre o arquivo
      // — são dezenas de segundos de leitura a menos.
      const feito = analisado.current;
      let anos: number[];
      if (forcar && feito && feito.arquivo === arquivo && feito.tipo === tipo
          && feito.cnpj === cnpjLimpo && feito.mapa === mapaNome) {
        anos = feito.anos;
      } else {
        setStatus("Carregando o DE/PARA do ente…");
        const cfg = await carregarDePara(cnpjLimpo, tipo, mapaNome);

        const buffer = await arquivo.arrayBuffer();
        // O ArrayBuffer é TRANSFERIDO, não copiado: são dezenas de MB.
        const resp = await pedir(
          {
            acao: "analisar",
            arquivo: buffer,
            tipo,
            cnpj: cnpjLimpo,
            cfg: { mapa: cfg.mapa, abasModo: cfg.abasModo, abas: cfg.abas, pares: cfg.pares },
          },
          [buffer],
        );
        if (resp.tipo !== "analise") throw new Error("Resposta inesperada do processador.");

        setRelatorio(resp.relatorio);
        analisado.current = { arquivo, tipo, cnpj: cnpjLimpo, mapa: mapaNome, anos: resp.anos };
        anos = resp.anos;

        if (resp.relatorio.temBloqueio) {
          throw new Error(
            "A planilha tem dados incorretos ou vazios que impedem a importação. " +
            "Corrija na origem e envie novamente — nada foi alterado.",
          );
        }
        // Só avisos: espera a confirmação explícita do usuário.
        if (resp.relatorio.achados.length > 0 && !forcar) return;
      }

      // O lote só é aberto agora, depois da verificação: /api/sada/importar já
      // marca a importação anterior como não-vigente, então uma planilha ruim
      // derrubaria o retrato atual sem nada correto para pôr no lugar.
      setStatus("Iniciando importação…");
      setProgresso(0);
      const ini = await post("/api/sada/importar", {
        cnpj: cnpjLimpo, tipo, arquivoNome: arquivo.name,
        // Sem isto o servidor aposenta todos os lotes do ente+tipo, e uma
        // importação de um ano só faz os demais sumirem dos dashboards.
        anos,
      });
      importacaoId = ini.importacaoId;

      const fim = await pedir({ acao: "enviar", importacaoId: importacaoId as number, lote: LOTE });
      if (fim.tipo !== "enviado") throw new Error("Resposta inesperada do processador.");

      setStatus("Finalizando…");
      await post("/api/sada/importar/finalizar", {
        importacaoId,
        total: fim.total,
        anoInicio: Math.min(...anos),
        anoFim: Math.max(...anos),
      });

      setProgresso(100);
      setRelatorio(null);
      analisado.current = null;
      setConcluido(
        `${fim.total.toLocaleString("pt-BR")} linhas atualizadas ` +
        `(${Math.min(...anos)}–${Math.max(...anos)}).`,
      );
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

  /** Interrompe o envio. O worker para no lote seguinte e o catch acima
   *  cancela a importação, para não deixar meia planilha no banco. */
  function cancelar() {
    worker.current?.postMessage({ acao: "cancelar" } as ParaWorker);
    setStatus("Cancelando…");
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
            onChange={(e) => {
              const t = e.target.value as TipoSada;
              setTipo(t); resetarVerificacao(); void carregarMapas(t);
            }}>
            {TIPOS_SADA.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
          </select>
        </div>

        <div className="field">
          <label>CNPJ do ente</label>
          <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="Somente números"
            onBlur={() => void carregarMapas(tipo)} disabled={rodando} />
          <small>A pontuação é ignorada — o ente é identificado só pelos dígitos.</small>
        </div>

        {mapasDisponiveis.length > 1 && (
          <div className="field">
            <label>DE/PARA a usar</label>
            <select value={mapaNome} disabled={rodando}
              onChange={(e) => { setMapaNome(e.target.value); resetarVerificacao(); }}>
              <option value="">Mais recente</option>
              {mapasDisponiveis.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <small>Este ente tem mais de um mapa cadastrado para este tipo de planilha.</small>
          </div>
        )}

        <div className="field">
          <label>Planilha (.xlsx)</label>
          <input type="file" accept=".xlsx" disabled={rodando}
            onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); resetarVerificacao(); }} />
          <small>
            Uma aba por ano. Arquivo grande leva algum tempo para abrir (perto de um
            minuto nos maiores) e o envio é feito em lotes — a tela continua
            respondendo e mostra o andamento.
          </small>
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
          {rodando && (
            <button className="btn secondary" onClick={cancelar}>Cancelar</button>
          )}
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

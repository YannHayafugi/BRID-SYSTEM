/**
 * Exercita app/sada/atualizacao/importador.worker.ts fora do navegador.
 *
 * Um Web Worker não roda no Node, mas o módulo é JavaScript comum: basta
 * fornecer o `self` (postMessage) e um `fetch` de mentira, e o mesmo código
 * que roda na aba processa uma planilha de verdade aqui. O que se verifica:
 * o protocolo de mensagens (analisar → analise, enviar → enviado), a divisão
 * em lotes e a contagem de linhas.
 *
 * Rodar:  npx tsx scripts/sada-worker-teste.ts "DÍVIDA ATIVA.xlsx" divida_ativa
 *
 * Terceiro argumento opcional: `ano_na_coluna` exercita o modo em que o ano
 * NÃO vem da aba e sim de uma coluna, linha a linha. Aqui a coluna usada é a
 * de ano de vencimento — serve para provar que o ano deixa de ser imposto
 * pela aba e passa a variar dentro dela.
 */
import * as fs from "node:fs";
import type { DoWorker, ParaWorker } from "../app/sada/atualizacao/importador.worker";
import type { TipoSada } from "../lib/sada/import";
import { MAPA_PADRAO, type AbasModo, type Mapa } from "../lib/sada/depara";

const arquivo = process.argv[2] ?? "DÍVIDA ATIVA.xlsx";
const tipo = (process.argv[3] ?? "divida_ativa") as TipoSada;
const abasModo = (process.argv[4] ?? "ano_no_nome") as AbasModo;

/** No modo de coluna o mapa precisa dizer de onde sai o `ano`. */
const mapa: Mapa =
  abasModo === "ano_na_coluna"
    ? { ...MAPA_PADRAO[tipo], ano: { origem: tipo === "lancamentos" ? 7 : 8 } }
    : {};
const LOTE = 1000;

const recebidas: DoWorker[] = [];
let ultimoStatus = "";

// `self` do worker: guarda o que seria enviado para a tela.
(globalThis as unknown as { self: unknown }).self = {
  postMessage: (m: DoWorker) => {
    recebidas.push(m);
    if (m.tipo === "status") ultimoStatus = m.texto;
  },
  onmessage: null as ((e: { data: ParaWorker }) => void) | null,
};

// `fetch` de mentira: conta linhas e lotes em vez de falar com o servidor.
let lotes = 0;
let linhasEnviadas = 0;
let maiorLote = 0;
(globalThis as unknown as { fetch: unknown }).fetch = async (_url: string, init: RequestInit) => {
  const corpo = JSON.parse(String(init.body)) as { linhas: unknown[] };
  lotes++;
  linhasEnviadas += corpo.linhas.length;
  maiorLote = Math.max(maiorLote, corpo.linhas.length);
  return { ok: true, json: async () => ({ ok: true }) };
};

async function main() {
  await import("../app/sada/atualizacao/importador.worker");
  const alvo = (globalThis as unknown as { self: { onmessage: (e: { data: ParaWorker }) => void } }).self;

  const b = fs.readFileSync(arquivo);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

  const esperar = async (ate: DoWorker["tipo"]) => {
    for (let i = 0; i < 6000; i++) {
      const achou = recebidas.find((m) => m.tipo === ate || m.tipo === "erro");
      if (achou) return achou;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`Worker não respondeu com "${ate}". Último status: ${ultimoStatus}`);
  };

  let t = Date.now();
  alvo.onmessage({
    data: {
      acao: "analisar",
      arquivo: ab,
      tipo,
      cnpj: "12345678000190",
      cfg: { mapa, abasModo, abas: null, opcionais: [], pares: [] },
    },
  });
  const analise = await esperar("analise");
  if (analise.tipo !== "analise") throw new Error(`erro na análise: ${JSON.stringify(analise)}`);
  console.log(
    `modo ${abasModo} ·`,
    `analisar: ${((Date.now() - t) / 1000).toFixed(1)}s ·`,
    `${analise.totalLinhas.toLocaleString("pt-BR")} linhas ·`,
    `anos ${analise.anos[0]}–${analise.anos[analise.anos.length - 1]} ·`,
    `${analise.relatorio.achados.length} achado(s), bloqueio=${analise.relatorio.temBloqueio}`,
  );

  const progressos = recebidas.filter((m) => m.tipo === "progresso").length;
  const status = recebidas.filter((m) => m.tipo === "status").length;
  console.log(`mensagens durante a análise: ${status} de status, ${progressos} de progresso`);

  recebidas.length = 0;
  t = Date.now();
  alvo.onmessage({ data: { acao: "enviar", importacaoId: 1, lote: LOTE } });
  const fim = await esperar("enviado");
  if (fim.tipo !== "enviado") throw new Error(`erro no envio: ${JSON.stringify(fim)}`);

  console.log(
    `enviar: ${((Date.now() - t) / 1000).toFixed(1)}s ·`,
    `${lotes} lotes (maior: ${maiorLote}) ·`,
    `${linhasEnviadas.toLocaleString("pt-BR")} linhas`,
  );

  const problemas: string[] = [];
  if (fim.total !== analise.totalLinhas) problemas.push("total enviado != total analisado");
  if (linhasEnviadas !== analise.totalLinhas) problemas.push("linhas no fetch != total analisado");
  if (maiorLote > LOTE) problemas.push("lote maior que o limite");
  if (recebidas.filter((m) => m.tipo === "progresso").length < 2) problemas.push("sem progresso no envio");

  if (problemas.length) {
    console.error("\nFALHOU: " + problemas.join("; "));
    process.exit(1);
  }
  console.log("\nOK — análise e envio conferem.");
}

void main();

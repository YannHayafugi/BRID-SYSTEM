/**
 * Exercita lib/sada/ingestao.ts — a leitura em streaming que o servidor usa
 * para arquivos grandes — com uma planilha REAL, sem tocar no banco.
 *
 * O gravador é substituído por um contador: o que se verifica aqui é a
 * leitura (linhas, anos, memória) e o formato das linhas do COPY, onde um
 * erro de ordem de coluna ou de escape passaria despercebido até a carga
 * falhar no meio de um arquivo de horas.
 *
 * Rodar:  npx tsx scripts/sada-ingestao-teste.ts "RECEBIMENTOS DA.xlsx" recebimentos_da
 */
import { colunasDoTipo, escapar, lerArquivo, montarLinhaCopy } from "../lib/sada/ingestao";
import { MAPA_PADRAO } from "../lib/sada/depara";
import type { TipoSada } from "../lib/sada/import";

const arquivo = process.argv[2] ?? "RECEBIMENTOS DA.xlsx";
const tipo = (process.argv[3] ?? "recebimentos_da") as TipoSada;

let falhas = 0;
const ok = (nome: string, cond: boolean, extra = "") => {
  if (!cond) { falhas++; console.log(`  FALHOU  ${nome} ${extra}`); }
  else console.log(`  ok      ${nome}`);
};

async function main() {
  // ------------------------------------------------------------ COPY
  console.log("\nFormato das linhas do COPY");

  const colunas = colunasDoTipo(tipo);
  const exemplo = { cnpj_orgao: "12345678000190", ano: 2024, sigla: "IPTU", valor: 10.5 };
  const linha = montarLinhaCopy(tipo, 77, exemplo);
  const partes = linha.split("\t");

  ok("uma coluna por campo declarado", partes.length === colunas.length,
    `${partes.length} vs ${colunas.length}`);
  ok("importacao_id entra na primeira coluna", partes[0] === "77", partes[0]);
  ok("campo ausente vira NULL do COPY", partes.includes("\\N"));
  ok("tabulação no dado não quebra a linha",
    escapar("a\tb") === "a\\tb" && escapar("a\nb") === "a\\nb" && escapar("a\\b") === "a\\\\b",
    escapar("a\tb"));
  ok("nulo e indefinido viram NULL", escapar(null) === "\\N" && escapar(undefined) === "\\N");

  // ------------------------------------------------------------ leitura
  console.log(`\nLeitura em streaming de ${arquivo}`);

  let pico = 0;
  const relogio = setInterval(() => {
    const mb = process.memoryUsage().rss / 1048576;
    if (mb > pico) pico = mb;
  }, 100);

  let blocos = 0;
  let linhasNoGravador = 0;
  let maiorBloco = 0;
  let amostra: Record<string, unknown> | null = null;

  const t0 = Date.now();
  const r = await lerArquivo(
    arquivo,
    arquivo,
    tipo,
    "12345678000190",
    { mapa: MAPA_PADRAO[tipo], abasModo: "ano_no_nome", abas: null, opcionais: [], pares: [] },
    async (bloco) => {
      blocos++;
      linhasNoGravador += bloco.length;
      maiorBloco = Math.max(maiorBloco, bloco.length);
      if (!amostra) amostra = bloco[0];
    },
  );
  clearInterval(relogio);

  const seg = (Date.now() - t0) / 1000;
  console.log(
    `  ${r.linhas.toLocaleString("pt-BR")} linhas em ${seg.toFixed(1)}s · ` +
    `${blocos} blocos (maior ${maiorBloco}) · pico ${pico.toFixed(0)} MB · ` +
    `anos ${r.anos[0]}–${r.anos[r.anos.length - 1]}`,
  );

  ok("tudo que foi lido chegou ao gravador", linhasNoGravador === r.linhas,
    `${linhasNoGravador} vs ${r.linhas}`);
  ok("achou linhas", r.linhas > 1000, String(r.linhas));
  ok("anos vieram das abas", r.anos.length > 1, JSON.stringify(r.anos));
  ok("relatório conta o arquivo inteiro", r.relatorio.totalLinhas === r.linhas);
  ok("registro traduzido tem o ente e o ano",
    !!amostra && (amostra as Record<string, unknown>).cnpj_orgao === "12345678000190"
      && typeof (amostra as Record<string, unknown>).ano === "number",
    JSON.stringify(amostra).slice(0, 120));
  // Memória constante é o ponto do streaming: o arquivo de 22 MB lido inteiro
  // custava 750 MB de heap.
  ok("memória não acompanha o tamanho do arquivo", pico < 900, `${pico.toFixed(0)} MB`);

  console.log(falhas === 0 ? "\nTUDO OK" : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
}

void main();

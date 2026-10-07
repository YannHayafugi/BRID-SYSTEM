/**
 * SADA · divide um .xlsx grande em arquivos importáveis, por ano.
 *
 * POR QUE NÃO É UM "CONVERSOR PARA CSV"
 *
 * Converter custa exatamente o que importar custa: o caro é abrir o .xlsx —
 * o zip é descompactado inteiro antes da primeira linha. Então o conversor
 * nunca destrava um arquivo que a importação já não conseguisse ler, e quem
 * consegue ler (este script e o importador de linha de comando, que leem em
 * streaming) consegue importar direto, sem passar por CSV. O ganho real do
 * CSV existe quando o ENTE exporta em CSV — aí o .xlsx nunca chega a existir.
 *
 * O que trava de verdade é outra coisa, e foi o que aconteceu com o T-1138:
 * um arquivo de 83 MB com 1,4 milhão de linhas não passa pelo navegador (ele
 * recusa alocar o que o SheetJS precisa), e dividir por ano resolve.
 *
 * POR QUE POR ANO, E NÃO EM PEDAÇOS IGUAIS
 *
 * O importador aposenta os lotes que cobrem os MESMOS anos do lote novo. Dois
 * arquivos que compartilhassem um ano fariam o segundo derrubar o primeiro —
 * em silêncio. Faixas de anos disjuntas convivem.
 *
 * Linhas com ano inválido (fora de 1980–2100) vão para um arquivo à parte:
 * sozinhas elas bloqueariam o lote inteiro, e o que elas precisam é voltar ao
 * ente para correção.
 *
 * Uso:
 *   npm run sada:dividir -- --arquivo "C:\\dados\\DIVIDA.xlsx" --coluna ANO_VENCTO
 *   npm run sada:dividir -- --arquivo ... --coluna ANO_VENCTO --por-linhas 350000
 *
 * Opções:
 *   --coluna <nome>     coluna que traz o ano (padrão: detecta ANO/EXERCICIO)
 *   --por-linhas <n>    alvo de linhas por arquivo (padrão 350.000); faixas de
 *                       anos são agrupadas até chegar perto disso
 *   --saida <pasta>     onde gravar (padrão: subpasta "importar" do arquivo)
 */
import ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const entrada = argumento("arquivo");
const colunaAno = argumento("coluna");
const porLinhas = Number(argumento("por-linhas") ?? 350000);
const saidaOpc = argumento("saida");

if (!entrada) {
  console.error(`
Informe o arquivo:
  npm run sada:dividir -- --arquivo <caminho.xlsx> [--coluna ANO_VENCTO] [--por-linhas 350000] [--saida <pasta>]
`);
  process.exit(1);
}

const SAIDA = saidaOpc ?? join(dirname(entrada), "importar");
const BASE = basename(entrada, extname(entrada));

/** Nomes que costumam carregar o ano, quando --coluna não é informado. */
const PISTAS = ["ano", "exercicio", "anovencto", "anovencimento", "anoexercicio", "competencia"];
const normalizar = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const ANO_MIN = 1980;
const ANO_MAX = 2100;

function valor(v: unknown): string | number {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || typeof v === "string") return v;
  const o = v as { text?: unknown; result?: unknown };
  if (o.text !== undefined) return String(o.text);
  if (o.result !== undefined) return String(o.result);
  return String(v);
}

function abrirLeitor() {
  return new ExcelJS.stream.xlsx.WorkbookReader(entrada!, {
    sharedStrings: "cache",
    worksheets: "emit",
    entries: "emit",
  });
}

const relogio = (ms: number) => `${Math.round(ms / 1000)}s`;

async function main() {
  const t0 = Date.now();

  // ------------------------------------------------------------------
  // Passada 1: cabeçalho e quantas linhas por ano.
  //
  // Duas passadas, e não uma: para agrupar os anos em arquivos equilibrados é
  // preciso saber o tamanho de cada ano ANTES de começar a escrever. A leitura
  // é em streaming nas duas, com memória constante.
  // ------------------------------------------------------------------
  console.log(`\nLendo ${basename(entrada!)}…`);
  let cabecalho: (string | number)[] = [];
  let iAno = -1;
  const porAno = new Map<number | null, number>();
  let total = 0;

  for await (const aba of abrirLeitor()) {
    let primeira = true;
    for await (const linha of aba) {
      const cels = ((linha.values as unknown[]) ?? []).slice(1).map(valor);
      if (primeira) {
        primeira = false;
        if (cabecalho.length === 0) {
          cabecalho = cels;
          const alvo = colunaAno ? normalizar(colunaAno) : null;
          iAno = cels.findIndex((c) =>
            alvo ? normalizar(c) === alvo : PISTAS.includes(normalizar(c)));
        }
        continue;
      }
      const ano = parseInt(String(cels[iAno] ?? ""), 10);
      const chave = Number.isFinite(ano) && ano >= ANO_MIN && ano <= ANO_MAX ? ano : null;
      porAno.set(chave, (porAno.get(chave) ?? 0) + 1);
      if (++total % 200000 === 0) {
        process.stdout.write(`\r  ${total.toLocaleString("pt-BR")} linhas · ${relogio(Date.now() - t0)}   `);
      }
    }
  }
  process.stdout.write("\r");

  if (iAno < 0) {
    console.error(
      `\nNão achei a coluna do ano. Cabeçalho: ${cabecalho.join(", ")}\n` +
      "Informe com --coluna <nome>.",
    );
    process.exit(1);
  }

  console.log(`\n${total.toLocaleString("pt-BR")} linhas · coluna do ano: ${cabecalho[iAno]}\n`);
  const anos = [...porAno.entries()].filter(([a]) => a !== null)
    .sort((a, b) => (a[0] as number) - (b[0] as number));
  for (const [ano, qtd] of anos) console.log(`  ${ano}  ${qtd.toLocaleString("pt-BR").padStart(12)}`);
  const invalidas = porAno.get(null) ?? 0;
  if (invalidas) console.log(`  ano inválido  ${invalidas.toLocaleString("pt-BR")} ← vai para arquivo à parte`);

  // ------------------------------------------------------------------
  // Agrupa anos CONSECUTIVOS até chegar perto do alvo de linhas.
  // Um ano nunca é partido entre dois arquivos: é isso que mantém as faixas
  // disjuntas e os lotes convivendo.
  // ------------------------------------------------------------------
  const faixas: { de: number; ate: number; linhas: number }[] = [];
  for (const [ano, qtd] of anos) {
    const ultima = faixas[faixas.length - 1];
    if (ultima && ultima.linhas + qtd <= porLinhas) {
      ultima.ate = ano as number;
      ultima.linhas += qtd;
    } else {
      faixas.push({ de: ano as number, ate: ano as number, linhas: qtd });
    }
  }

  console.log(`\nSerão ${faixas.length} arquivo(s)${invalidas ? " + 1 de correção" : ""}:`);
  faixas.forEach((f, i) =>
    console.log(`  ${i + 1}. ${f.de}-${f.ate}  ${f.linhas.toLocaleString("pt-BR")} linhas`));

  // ------------------------------------------------------------------
  // Passada 2: escreve, também em streaming.
  // ------------------------------------------------------------------
  mkdirSync(SAIDA, { recursive: true });
  const nomeDe = (f: { de: number; ate: number }, i: number) =>
    `${BASE} - ${i + 1} (${f.de === f.ate ? f.de : `${f.de}-${f.ate}`}).xlsx`;

  const escritores = faixas.map((f, i) => {
    const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: join(SAIDA, nomeDe(f, i)), useStyles: false, useSharedStrings: false,
    });
    const ws = wb.addWorksheet("Dados");
    ws.addRow(cabecalho).commit();
    return { wb, ws, n: 0 };
  });

  let ruins: { wb: ExcelJS.stream.xlsx.WorkbookWriter; ws: ExcelJS.Worksheet; n: number } | null = null;
  if (invalidas) {
    const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: join(SAIDA, `${BASE} - CORRIGIR - ano invalido.xlsx`),
      useStyles: false, useSharedStrings: false,
    });
    const ws = wb.addWorksheet("Dados");
    ws.addRow(cabecalho).commit();
    ruins = { wb, ws, n: 0 };
  }

  const t1 = Date.now();
  let escritas = 0;
  for await (const aba of abrirLeitor()) {
    let primeira = true;
    for await (const linha of aba) {
      if (primeira) { primeira = false; continue; }
      const cels = ((linha.values as unknown[]) ?? []).slice(1).map(valor);
      const ano = parseInt(String(cels[iAno] ?? ""), 10);
      const valido = Number.isFinite(ano) && ano >= ANO_MIN && ano <= ANO_MAX;

      if (!valido) {
        ruins?.ws.addRow(cels).commit();
        if (ruins) ruins.n++;
      } else {
        const i = faixas.findIndex((f) => ano >= f.de && ano <= f.ate);
        escritores[i].ws.addRow(cels).commit();
        escritores[i].n++;
      }
      if (++escritas % 200000 === 0) {
        process.stdout.write(`\r  ${escritas.toLocaleString("pt-BR")} linhas gravadas · ${relogio(Date.now() - t1)}   `);
      }
    }
  }
  process.stdout.write("\r");

  for (const e of escritores) { e.ws.commit(); await e.wb.commit(); }
  if (ruins) { ruins.ws.commit(); await ruins.wb.commit(); }

  const soma = escritores.reduce((s, e) => s + e.n, 0) + (ruins?.n ?? 0);
  console.log(`\nPronto em ${relogio(Date.now() - t0)} — ${SAIDA}`);
  escritores.forEach((e, i) =>
    console.log(`  ${nomeDe(faixas[i], i)}  ${e.n.toLocaleString("pt-BR")} linhas`));
  if (ruins) {
    console.log(`  ${BASE} - CORRIGIR - ano invalido.xlsx  ${ruins.n.toLocaleString("pt-BR")} linhas`);
    console.log("\n  O arquivo CORRIGIR não deve ser importado: mande ao ente para corrigir o ano.");
  }
  if (soma !== total) {
    console.error(`\nATENÇÃO: gravadas ${soma} de ${total} linhas — confira antes de importar.`);
    process.exit(1);
  }
  console.log(`\n${soma.toLocaleString("pt-BR")} linhas conferem com a leitura.`);
}

main().catch((e) => { console.error(`\nFALHOU: ${(e as Error).message}`); process.exit(1); });

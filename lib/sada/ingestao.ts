/**
 * SADA · ingestão de arquivo grande, no SERVIDOR.
 *
 * O caminho do navegador (app/sada/atualizacao/importador.worker.ts) lê o
 * arquivo inteiro na memória. Medido nesta base: a aba recusa alocar 2 GB de
 * uma vez, e a leitura consome de 35 a 50 vezes o tamanho do arquivo — o
 * máximo real é um .xlsx de ~100 MB. Para arquivos de 2 GB ou mais a leitura
 * passa a ser aqui, com duas diferenças que mudam tudo:
 *
 *   1. STREAMING — o arquivo é percorrido linha a linha, direto do disco.
 *      Medido com a planilha real de lançamentos (22 MB, 486 mil linhas):
 *      20,9 s e pico de 287 MB, contra 750 MB da leitura inteira.
 *   2. COPY — as linhas entram no Postgres pelo protocolo de cópia, e não
 *      uma requisição REST a cada mil. É a diferença entre minutos e horas
 *      num arquivo de dezenas de milhões de linhas.
 *
 * Sem `SADA_DB_URL` configurada não há COPY: a gravação cai para lotes via
 * API do Supabase, que funciona e é muito mais lenta. O chamador avisa.
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import ExcelJS from "exceljs";
import { Client } from "pg";
import { from as copyFrom } from "pg-copy-streams";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  analisarQualidade,
  linhaVazia,
  TABELA_SADA,
  type RelatorioQualidade,
  type TipoSada,
} from "./import";
import {
  compilarMapa,
  compilarValores,
  type AbaEscolhida,
  type AbasModo,
  type Mapa,
  type MapaCompilado,
} from "./depara";

export interface ConfigIngestao {
  mapa: Mapa;
  abasModo: AbasModo;
  abas: AbaEscolhida[] | null;
  opcionais: string[];
  pares: { campo: "sigla" | "fase"; valor_origem: string; valor_canonico: string }[];
}

export interface ProgressoIngestao {
  linhasLidas: number;
  linhasGravadas: number;
  fase: "lendo" | "gravando";
}

/** Linhas por bloco enviado à gravação. Grande o bastante para o COPY render,
 *  pequeno o bastante para o bloco não pesar na memória. */
const BLOCO = 20_000;

/** Extensões tratadas como texto delimitado. O resto vai pelo leitor de xlsx. */
const TEXTO = /\.(csv|txt|tsv)$/i;

// =====================================================================
// Leitura
// =====================================================================

type AoBloco = (linhas: Record<string, unknown>[]) => Promise<void>;

/** Separador de um CSV, deduzido da primeira linha: ponto-e-vírgula é o que
 *  sai do Excel em português, vírgula o que sai de exportação de banco. */
function separador(cabecalho: string): string {
  const conta = (c: string) => cabecalho.split(c).length - 1;
  const tab = conta("\t");
  const ponto = conta(";");
  const virgula = conta(",");
  if (tab >= ponto && tab >= virgula) return "\t";
  return ponto >= virgula ? ";" : ",";
}

/** Quebra uma linha de CSV respeitando aspas. */
function celulas(linha: string, sep: string): string[] {
  const out: string[] = [];
  let atual = "";
  let dentro = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentro && linha[i + 1] === '"') { atual += '"'; i++; }
      else dentro = !dentro;
    } else if (c === sep && !dentro) {
      out.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  out.push(atual);
  return out;
}

interface ResultadoLeitura {
  linhas: number;
  anos: number[];
  relatorio: RelatorioQualidade;
}

/**
 * Percorre o arquivo e entrega as linhas já traduzidas, em blocos.
 *
 * Roda a MESMA verificação de qualidade da tela (analisarQualidade) enquanto
 * lê — de carona, sem uma segunda passagem pelo arquivo.
 */
export async function lerArquivo(
  caminho: string,
  nomeArquivo: string,
  tipo: TipoSada,
  cnpj: string,
  cfg: ConfigIngestao,
  aoBloco: AoBloco,
  aoProgresso?: (p: ProgressoIngestao) => void,
): Promise<ResultadoLeitura> {
  const valores = compilarValores(cfg.pares);
  const anos = new Set<number>();
  const faltando = new Set<string>();
  const origensAusentes = new Set<string>();

  let lidas = 0;
  let bloco: Record<string, unknown>[] = [];

  // A verificação de qualidade consome um iterável; alimentamos um buffer que
  // ela puxa à medida que as linhas chegam do arquivo. Assim o relatório sai
  // da mesma passagem, sem guardar o arquivo convertido em memória.
  const achados: Record<string, unknown>[] = [];
  const registrar = (reg: Record<string, unknown>) => {
    if (typeof reg.ano === "number" && Number.isInteger(reg.ano)) anos.add(reg.ano);
    // Amostra para o relatório: as regras olham linha a linha, e guardar
    // tudo seria guardar o arquivo inteiro. 50 mil linhas dão um retrato
    // honesto de um arquivo de milhões — e o custo é constante.
    if (achados.length < 50_000) achados.push(reg);
  };

  const traduzir = (compilado: MapaCompilado, linha: unknown[], anoDaAba: number | null) => {
    const reg = compilado.aplicar(linha);
    if ("sigla" in reg) reg.sigla = valores.aplicar("sigla", reg.sigla);
    if ("fase" in reg) reg.fase = valores.aplicar("fase", reg.fase);
    reg.cnpj_orgao = cnpj;
    if (anoDaAba !== null) reg.ano = anoDaAba;
    return reg;
  };

  const empurrar = async (reg: Record<string, unknown>) => {
    registrar(reg);
    bloco.push(reg);
    lidas++;
    if (bloco.length >= BLOCO) {
      await aoBloco(bloco);
      bloco = [];
      aoProgresso?.({ linhasLidas: lidas, linhasGravadas: lidas, fase: "gravando" });
    }
  };

  if (TEXTO.test(nomeArquivo)) {
    await lerTexto(caminho, tipo, cfg, traduzir, empurrar, faltando, origensAusentes);
  } else {
    await lerXlsx(caminho, tipo, cfg, traduzir, empurrar, faltando, origensAusentes);
  }

  if (bloco.length) {
    await aoBloco(bloco);
    aoProgresso?.({ linhasLidas: lidas, linhasGravadas: lidas, fase: "gravando" });
  }

  const relatorio = analisarQualidade(
    tipo,
    [{ ano: 0, registros: achados }],
    { faltando: [...faltando], origensAusentes: [...origensAusentes] },
  );
  // O total do relatório é o da amostra; o do arquivo é `lidas`.
  relatorio.totalLinhas = lidas;

  return { linhas: lidas, anos: [...anos].sort((a, b) => a - b), relatorio };
}

async function lerTexto(
  caminho: string,
  tipo: TipoSada,
  cfg: ConfigIngestao,
  traduzir: (c: MapaCompilado, l: unknown[], ano: number | null) => Record<string, unknown>,
  empurrar: (reg: Record<string, unknown>) => Promise<void>,
  faltando: Set<string>,
  origensAusentes: Set<string>,
) {
  const rl = createInterface({
    input: createReadStream(caminho, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let sep = ";";
  let compilado: MapaCompilado | null = null;
  // Num arquivo de texto não há abas: o ano vem da coluna mapeada, ou de uma
  // única aba declarada no DE/PARA.
  const anoFixo = cfg.abasModo === "abas_escolhidas" ? cfg.abas?.[0]?.ano ?? null : null;

  for await (const linha of rl) {
    if (!compilado) {
      sep = separador(linha);
      const cabecalho = celulas(linha, sep).map((c) => c.trim());
      compilado = compilarMapa(tipo, cfg.mapa, cabecalho, {
        abasModo: cfg.abasModo,
        opcionais: cfg.opcionais,
      });
      compilado.faltando.forEach((f) => faltando.add(f));
      compilado.origensAusentes.forEach((o) => origensAusentes.add(o));
      continue;
    }
    const cels = celulas(linha, sep);
    if (linhaVazia(cels)) continue;
    await empurrar(traduzir(compilado, cels, anoFixo));
  }
}

async function lerXlsx(
  caminho: string,
  tipo: TipoSada,
  cfg: ConfigIngestao,
  traduzir: (c: MapaCompilado, l: unknown[], ano: number | null) => Record<string, unknown>,
  empurrar: (reg: Record<string, unknown>) => Promise<void>,
  faltando: Set<string>,
  origensAusentes: Set<string>,
) {
  // `sharedStrings: cache` é o que permite ler valores de texto sem abrir o
  // arquivo inteiro. É também o que mais consome memória num xlsx grande:
  // a tabela de textos distintos do arquivo fica em memória enquanto dura a
  // leitura. Num arquivo de vários GB é o limite a observar — CSV não tem
  // esse custo, e é por isso que ele é o formato recomendado ao ente.
  const leitor = new ExcelJS.stream.xlsx.WorkbookReader(caminho, {
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    worksheets: "emit",
  });

  const escolhidas = new Map((cfg.abas ?? []).map((a) => [a.nome, a.ano]));

  for await (const aba of leitor) {
    // O `.d.ts` do exceljs não declara `name` no leitor de aba, mas ele existe
    // em execução (conferido com as planilhas reais: "2015", "2016"…). Sem o
    // nome não há como saber que ano a aba representa.
    const nome = (aba as unknown as { name?: string }).name ?? "";
    let anoDaAba: number | null = null;

    if (cfg.abasModo === "ano_no_nome") {
      const n = parseInt(nome, 10);
      if (!Number.isFinite(n)) continue; // aba que não é ano fica de fora
      anoDaAba = n;
    } else if (cfg.abasModo === "abas_escolhidas") {
      if (!escolhidas.has(nome)) continue;
      anoDaAba = escolhidas.get(nome)!;
    } else if (escolhidas.size > 0 && !escolhidas.has(nome)) {
      continue; // ano_na_coluna com lista de abas declarada
    }

    let compilado: MapaCompilado | null = null;
    for await (const linha of aba) {
      // `values` do exceljs é 1-based: a posição 0 vem vazia.
      const cels = ((linha.values as unknown[]) ?? []).slice(1);
      if (!compilado) {
        const cabecalho = cels.map((c) => String(c ?? "").trim());
        compilado = compilarMapa(tipo, cfg.mapa, cabecalho, {
          abasModo: cfg.abasModo,
          opcionais: cfg.opcionais,
        });
        compilado.faltando.forEach((f) => faltando.add(f));
        compilado.origensAusentes.forEach((o) => origensAusentes.add(o));
        continue;
      }
      if (linhaVazia(cels)) continue;
      await empurrar(traduzir(compilado, cels, anoDaAba));
    }
  }
}

// =====================================================================
// Gravação
// =====================================================================

/** Colunas gravadas por tipo, na ordem em que o COPY as espera. */
const COLUNAS: Record<TipoSada, string[]> = {
  divida_ativa: [
    "importacao_id", "cnpj_orgao", "ano", "sequencia", "sigla", "inscricao", "cnpj_cpf",
    "descricao", "fase", "mes_venc", "ano_venc", "valor", "atualizacao", "juros", "multa", "total",
  ],
  lancamentos: [
    "importacao_id", "cnpj_orgao", "ano", "sequencia", "sigla", "inscricao", "cnpj_cpf",
    "descricao", "fase", "mes_lancto", "exercicio", "valor",
  ],
  recebimentos: [
    "importacao_id", "cnpj_orgao", "ano", "sequencia", "sigla", "inscricao", "cnpj_cpf",
    "descricao", "fase", "data_contrato", "mes_venc", "ano_venc", "valor", "vlam", "vljm",
    "vlmm", "vldesc", "vlel", "totaldam", "mes_arrec", "ano_arrec",
  ],
  recebimentos_da: [
    "importacao_id", "cnpj_orgao", "ano", "sequencia", "sigla", "inscricao", "cnpj_cpf",
    "descricao", "fase", "data_contrato", "mes_venc", "ano_venc", "valor", "vlam", "vljm",
    "vlmm", "vldesc", "vlel", "totaldam", "mes_arrec", "ano_arrec",
  ],
};

/** Escapa um valor no formato TEXT do COPY (o padrão do Postgres). */
export function escapar(v: unknown): string {
  if (v === null || v === undefined) return "\\N";
  return String(v)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

/** Uma linha no formato TEXT do COPY. Exportada para o teste: e aqui que um
 *  erro de ordem de colunas ou de escape passaria despercebido. */
export function montarLinhaCopy(
  tipo: TipoSada,
  importacaoId: number,
  linha: Record<string, unknown>,
): string {
  return COLUNAS[tipo]
    .map((c) => escapar(c === "importacao_id" ? importacaoId : linha[c]))
    .join("\t");
}

export function colunasDoTipo(tipo: TipoSada): string[] {
  return COLUNAS[tipo];
}

export function temCopy(): boolean {
  return !!process.env.SADA_DB_URL;
}

/**
 * Gravador de linhas. Usa COPY quando há conexão direta ao Postgres
 * (SADA_DB_URL) e cai para a API do Supabase quando não há.
 */
export interface Gravador {
  gravar(linhas: Record<string, unknown>[]): Promise<void>;
  encerrar(): Promise<void>;
  /** Como está gravando, para a tela explicar a diferença de tempo. */
  via: "copy" | "api";
}

export async function abrirGravador(tipo: TipoSada, importacaoId: number): Promise<Gravador> {
  const tabela = TABELA_SADA[tipo];
  const colunas = COLUNAS[tipo];

  if (!temCopy()) {
    const sb = getSupabaseAdmin();
    return {
      via: "api",
      async gravar(linhas) {
        // A API tem limite de corpo; 5 mil por vez é o que a rota de lote usa.
        for (let i = 0; i < linhas.length; i += 5000) {
          const parte = linhas.slice(i, i + 5000).map((l) => ({ ...l, importacao_id: importacaoId }));
          const { error } = await sb.from(tabela).insert(parte);
          if (error) throw new Error(error.message);
        }
      },
      async encerrar() {},
    };
  }

  const cliente = new Client({
    connectionString: process.env.SADA_DB_URL,
    // O Supabase exige TLS; o certificado é da cadeia própria deles, então
    // não validamos a CA — a conexão continua cifrada.
    ssl: { rejectUnauthorized: false },
    application_name: "sada-ingestao",
  });
  await cliente.connect();

  return {
    via: "copy",
    async gravar(linhas) {
      const destino = cliente.query(
        copyFrom(`copy public.${tabela} (${colunas.join(", ")}) from stdin`),
      );
      const texto = Readable.from(
        (function* () {
          for (const l of linhas) yield montarLinhaCopy(tipo, importacaoId, l) + "\n";
        })(),
      );
      await pipeline(texto, destino);
    },
    async encerrar() {
      await cliente.end();
    },
  };
}

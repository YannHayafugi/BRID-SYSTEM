/**
 * SADA · DE/PARA — leitura da planilha de referência, fora da thread da tela.
 *
 * A tela só precisa do cabeçalho, dos nomes das abas e de umas poucas linhas
 * de exemplo. Mesmo assim a leitura custa caro: o SheetJS descompacta o .xlsx
 * inteiro antes de olhar qualquer linha — medido no export de 83 MB do
 * T-1138, são 13 segundos. Rodando na thread da interface, são 13 segundos de
 * aba congelada, sem nem conseguir pintar o "Lendo a planilha…".
 *
 * `sheetRows` corta o que é PARSEADO (e com ele a memória cai de gigabytes
 * para dezenas de MB), mas não corta a descompactação. Por isso o trabalho
 * vem para cá: a tela continua respondendo, e quem espera é um worker.
 *
 * Mesmo código do navegador e do servidor para traduzir (lib/sada/depara), de
 * propósito: o que esta tela mostra tem de ser o que a importação vai fazer.
 */
import * as XLSX from "xlsx";
import { compilarMapa, valoresDistintos, type CampoValor, type Mapa } from "@/lib/sada/depara";
import { linhaVazia, type TipoSada } from "@/lib/sada/import";

/** Linhas por aba na montagem do mapa: cabeçalho + exemplos. */
const LINHAS_PREVIEW = 200;
/**
 * Linhas por aba ao listar os valores que o ente usa.
 *
 * Sigla e fase são um punhado de valores distintos e aparecem logo nas
 * primeiras linhas; ler o arquivo todo para isso custaria minutos e gigabytes.
 * A tela diz que é amostra.
 */
const LINHAS_VALORES = 20000;

/** Só o conteúdo interessa: sem estilo, sem formatação numérica, esparso. */
const LEITURA = {
  type: "array",
  dense: true,
  cellText: false,
  cellNF: false,
  cellStyles: false,
} as const;

export type ParaPlanilhaWorker =
  | { acao: "preview"; arquivo: ArrayBuffer }
  | {
      acao: "valores";
      arquivo: ArrayBuffer;
      tipo: TipoSada;
      mapa: Mapa;
      cabecalho: string[];
      campo: CampoValor;
    };

export type DoPlanilhaWorker =
  | { tipo: "preview"; nomesAbas: string[]; abaLida: string; cabecalho: string[]; amostra: unknown[][] }
  | { tipo: "valores"; distintos: string[]; lidas: number; limitePorAba: number }
  | { tipo: "erro"; mensagem: string };

const avisar = (m: DoPlanilhaWorker) => (self as unknown as Worker).postMessage(m);

function preview(arquivo: ArrayBuffer): DoPlanilhaWorker {
  const wb = XLSX.read(arquivo, { ...LEITURA, sheetRows: LINHAS_PREVIEW });
  const abas = wb.SheetNames.map((nome) => {
    const m = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, raw: false });
    return { nome, linhas: (m as unknown[][]).filter((r) => !linhaVazia(r)) };
  }).filter((a) => a.linhas.length > 0);

  if (abas.length === 0) throw new Error("A planilha não tem nenhuma aba com dados.");

  const primeira = abas[0];
  return {
    tipo: "preview",
    nomesAbas: abas.map((a) => a.nome),
    abaLida: primeira.nome,
    cabecalho: (primeira.linhas[0] ?? []).map((c) => String(c ?? "").trim()),
    amostra: primeira.linhas.slice(1, 6),
  };
}

function valores(msg: Extract<ParaPlanilhaWorker, { acao: "valores" }>): DoPlanilhaWorker {
  const wb = XLSX.read(msg.arquivo, { ...LEITURA, sheetRows: LINHAS_VALORES });
  const comp = compilarMapa(msg.tipo, msg.mapa, msg.cabecalho);

  const registros: Record<string, unknown>[] = [];
  for (const nome of wb.SheetNames) {
    const m = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, raw: false }) as unknown[][];
    for (const l of m.slice(1)) {
      if (!linhaVazia(l)) registros.push(comp.aplicar(l));
    }
    // Solta a aba antes de ler a próxima: as duas representações convivendo é
    // que fazem a memória crescer.
    delete wb.Sheets[nome];
  }

  return {
    tipo: "valores",
    distintos: valoresDistintos(registros, msg.campo),
    lidas: registros.length,
    limitePorAba: LINHAS_VALORES,
  };
}

self.onmessage = (e: MessageEvent<ParaPlanilhaWorker>) => {
  try {
    avisar(e.data.acao === "preview" ? preview(e.data.arquivo) : valores(e.data));
  } catch (err) {
    avisar({ tipo: "erro", mensagem: (err as Error).message || "Falha ao ler a planilha." });
  }
};

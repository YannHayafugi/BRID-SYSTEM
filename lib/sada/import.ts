/**
 * Regras de conversão e mapeamento das planilhas do SADA — isomórficas
 * (usadas no navegador para parsear o .xlsx e no servidor para validar).
 * Cabeçalho por posição, idêntico em todos os anos (validado na modelagem).
 */
export type TipoSada = "divida_ativa" | "lancamentos" | "recebimentos" | "recebimentos_da";

export const TIPOS_SADA: TipoSada[] = [
  "divida_ativa",
  "lancamentos",
  "recebimentos",
  "recebimentos_da",
];

export const TABELA_SADA: Record<TipoSada, string> = {
  divida_ativa: "sada_divida_ativa",
  lancamentos: "sada_lancamentos",
  recebimentos: "sada_recebimentos",
  recebimentos_da: "sada_recebimentos_da",
};

export const ROTULO_TIPO: Record<TipoSada, string> = {
  divida_ativa: "Dívida Ativa (estoque)",
  lancamentos: "Lançamentos",
  recebimentos: "Recebimentos",
  recebimentos_da: "Recebimentos DA",
};

/** '260.01' → 260.01 ; '0.00' → 0 ; 'NULL'|''|null → null */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "" || s.toUpperCase() === "NULL") return null;
  const n = Number(s.replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}
export function int(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
}
export function txt(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s.toUpperCase() === "NULL" ? null : s;
}

export interface BaseLinha {
  cnpj_orgao: string;
  ano: number;
}

/** Mapeia uma linha (array de células, sem cabeçalho) para o registro da
 * tabela correspondente. NÃO inclui importacao_id (o servidor injeta). */
export function mapearLinha(tipo: TipoSada, r: unknown[], base: BaseLinha): Record<string, unknown> {
  switch (tipo) {
    case "divida_ativa":
      return {
        ...base, sequencia: int(r[0]), sigla: txt(r[1]), inscricao: txt(r[2]), cnpj_cpf: txt(r[3]),
        descricao: txt(r[4]), fase: txt(r[5]), mes_venc: int(r[6]), ano_venc: int(r[7]),
        valor: num(r[8]), atualizacao: num(r[9]), juros: num(r[10]), multa: num(r[11]), total: num(r[12]),
      };
    case "lancamentos":
      return {
        ...base, sequencia: int(r[0]), sigla: txt(r[1]), inscricao: txt(r[2]), cnpj_cpf: txt(r[3]),
        descricao: txt(r[4]), fase: txt(r[5]), mes_lancto: int(r[6]), exercicio: int(r[7]), valor: num(r[8]),
      };
    default: // recebimentos e recebimentos_da: 18 colunas iguais
      return {
        ...base, sequencia: int(r[0]), sigla: txt(r[1]), inscricao: txt(r[2]), cnpj_cpf: txt(r[3]),
        descricao: txt(r[4]), fase: txt(r[5]), data_contrato: txt(r[6]), mes_venc: int(r[7]),
        ano_venc: int(r[8]), valor: num(r[9]), vlam: num(r[10]), vljm: num(r[11]), vlmm: num(r[12]),
        vldesc: num(r[13]), vlel: num(r[14]), totaldam: num(r[15]), mes_arrec: int(r[16]), ano_arrec: int(r[17]),
      };
  }
}

/** Linha "vazia" (todas as células nulas/em branco) — deve ser ignorada. */
export function linhaVazia(r: unknown[]): boolean {
  return r.every((v) => v === null || v === undefined || String(v).trim() === "");
}

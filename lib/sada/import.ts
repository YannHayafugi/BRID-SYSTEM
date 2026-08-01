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

// =====================================================================
// Qualidade dos dados na origem — roda ANTES de abrir o lote de importação.
//
// `bloqueio` reprova a planilha inteira; `aviso` só informa. A calibragem
// segue o que a base real já contém (ver view sada_vw_qualidade): CNPJ/CPF
// zerado e total nulo são comuns nos arquivos do ente e NÃO podem barrar a
// carga — viram aviso. Bloqueio fica para o que quebra as junções e para
// planilha trocada (contagem de colunas), caso em que importar destruiria a
// vigência do lote anterior sem nada correto para pôr no lugar.
// =====================================================================

/** Nº de colunas de origem por tipo — usado para detectar planilha trocada. */
export const COLUNAS_ESPERADAS: Record<TipoSada, number> = {
  divida_ativa: 13,
  lancamentos: 9,
  recebimentos: 18,
  recebimentos_da: 18,
};

export type Severidade = "bloqueio" | "aviso";

export interface RegraQualidade {
  codigo: string;
  rotulo: string;
  severidade: Severidade;
  /** true quando a linha apresenta o problema. */
  falha: (r: Record<string, unknown>) => boolean;
}

const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
const naoPositivo = (v: unknown) => v === null || v === undefined || Number(v) <= 0;
const docZerado = (v: unknown) =>
  vazio(v) || /^0+$/.test(String(v).replace(/\D/g, ""));

/** Regras comuns a todas as planilhas. */
const REGRAS_COMUNS: RegraQualidade[] = [
  {
    codigo: "sequencia_nula",
    rotulo: "Sequência vazia ou não numérica (é a chave que liga as tabelas)",
    severidade: "bloqueio",
    falha: (r) => r.sequencia === null,
  },
  {
    codigo: "sigla_vazia",
    rotulo: "Sigla do tributo vazia",
    severidade: "bloqueio",
    falha: (r) => vazio(r.sigla),
  },
  {
    codigo: "cnpj_cpf_zerado",
    rotulo: "CNPJ/CPF do contribuinte zerado ou vazio",
    severidade: "aviso",
    falha: (r) => docZerado(r.cnpj_cpf),
  },
  {
    codigo: "inscricao_vazia",
    rotulo: "Inscrição vazia",
    severidade: "aviso",
    falha: (r) => vazio(r.inscricao),
  },
];

export const REGRAS_QUALIDADE: Record<TipoSada, RegraQualidade[]> = {
  divida_ativa: [
    ...REGRAS_COMUNS,
    {
      codigo: "valor_nao_positivo",
      rotulo: "Valor principal nulo ou ≤ 0",
      severidade: "aviso",
      falha: (r) => naoPositivo(r.valor),
    },
    {
      codigo: "total_nulo",
      rotulo: "Total nulo (o título fica só com o principal)",
      severidade: "aviso",
      falha: (r) => r.total === null,
    },
  ],
  lancamentos: [
    ...REGRAS_COMUNS,
    {
      codigo: "valor_nao_positivo",
      rotulo: "Valor do lançamento nulo ou ≤ 0",
      severidade: "aviso",
      falha: (r) => naoPositivo(r.valor),
    },
  ],
  recebimentos: [
    ...REGRAS_COMUNS,
    {
      codigo: "totaldam_nao_positivo",
      rotulo: "Total do DAM nulo ou ≤ 0",
      severidade: "aviso",
      falha: (r) => naoPositivo(r.totaldam),
    },
  ],
  recebimentos_da: [
    ...REGRAS_COMUNS,
    {
      codigo: "totaldam_nao_positivo",
      rotulo: "Total do DAM nulo ou ≤ 0",
      severidade: "aviso",
      falha: (r) => naoPositivo(r.totaldam),
    },
  ],
};

export interface AchadoQualidade {
  codigo: string;
  rotulo: string;
  severidade: Severidade;
  qtd: number;
  /** Até 5 localizações "ano · linha N" para o usuário achar na planilha. */
  exemplos: string[];
}

export interface RelatorioQualidade {
  totalLinhas: number;
  achados: AchadoQualidade[];
  temBloqueio: boolean;
}

const MAX_EXEMPLOS = 5;

/**
 * Analisa as abas já lidas da planilha e devolve os problemas agregados.
 * `linhas` são as linhas de dados (sem cabeçalho), na ordem original — o
 * número reportado ao usuário soma 2 (cabeçalho + índice 0).
 */
export function analisarQualidade(
  tipo: TipoSada,
  abas: { ano: number; linhas: unknown[][] }[],
): RelatorioQualidade {
  const regras = REGRAS_QUALIDADE[tipo];
  const esperado = COLUNAS_ESPERADAS[tipo];
  const acc = new Map<string, AchadoQualidade>();

  const registrar = (
    codigo: string,
    rotulo: string,
    severidade: Severidade,
    onde: string,
  ) => {
    let a = acc.get(codigo);
    if (!a) {
      a = { codigo, rotulo, severidade, qtd: 0, exemplos: [] };
      acc.set(codigo, a);
    }
    a.qtd++;
    if (a.exemplos.length < MAX_EXEMPLOS) a.exemplos.push(onde);
  };

  let totalLinhas = 0;

  for (const { ano, linhas } of abas) {
    // Estrutural: planilha trocada / colunas faltando na aba inteira.
    const largura = linhas.reduce((m, l) => Math.max(m, l.length), 0);
    if (linhas.length > 0 && largura < esperado) {
      registrar(
        "colunas_faltando",
        `Planilha com ${largura} colunas, esperado ${esperado} para "${ROTULO_TIPO[tipo]}" — confira se o tipo selecionado corresponde ao arquivo`,
        "bloqueio",
        `${ano} · aba inteira`,
      );
    }

    for (let i = 0; i < linhas.length; i++) {
      totalLinhas++;
      const reg = mapearLinha(tipo, linhas[i], { cnpj_orgao: "", ano });
      const onde = `${ano} · linha ${i + 2}`;
      for (const regra of regras) {
        if (regra.falha(reg)) registrar(regra.codigo, regra.rotulo, regra.severidade, onde);
      }
    }
  }

  const achados = Array.from(acc.values()).sort((a, b) => {
    if (a.severidade !== b.severidade) return a.severidade === "bloqueio" ? -1 : 1;
    return b.qtd - a.qtd;
  });

  return {
    totalLinhas,
    achados,
    temBloqueio: achados.some((a) => a.severidade === "bloqueio"),
  };
}

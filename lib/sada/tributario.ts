/**
 * SADA · regras tributárias do ente e validação de fórmulas.
 *
 * A conferência linha a linha roda no banco (supabase/sada-regras-tributarias.sql):
 * são centenas de milhares de linhas, e trazer isso para o Node só para somar
 * seria caro. Aqui ficam três coisas que o banco não deve carregar:
 *
 *   1. o CATÁLOGO das verificações — rótulo, explicação e fundamento legal,
 *      que a tela mostra e o xlsx exporta;
 *   2. a MESMA matemática da view, em TypeScript, para o simulador da tela
 *      ("com esta regra, o que eu esperaria desta dívida?");
 *   3. os tipos do cadastro.
 *
 * As duas implementações da fórmula precisam concordar: se mexer numa, mexa
 * na outra. scripts/sada-tributario-teste.ts compara as duas.
 */

export const TRIBUTO_TODOS = "*";

/** Teto de multa de mora que a jurisprudência admite (caráter não confiscatório). */
export const TETO_MULTA_PCT = 20;
/** Juros de mora do CTN art. 161 §1º quando a lei do ente não dispõe. */
export const TETO_JUROS_PCT_MES = 1;
/** CTN art. 174: prescrição em 5 anos, salvo interrupção. */
export const ANOS_PRESCRICAO = 5;

export type MultaTipo = "unica" | "progressiva";
export type JurosModo = "mensal" | "selic";

export interface RegraTributaria {
  id?: number;
  cnpjOrgao: string;
  /** Sigla canônica (IPTU, ISS...) ou "*" para todos os tributos do ente. */
  tributo: string;
  vigenciaInicio: string;         // AAAA-MM-DD
  vigenciaFim: string | null;
  multaTipo: MultaTipo;
  multaPct: number;
  multaTetoPct: number | null;    // só faz sentido em 'progressiva'
  jurosModo: JurosModo;
  jurosPctMes: number;
  selicMediaAA: number | null;
  correcaoIndice: string | null;
  correcaoPctAA: number | null;
  honorariosPct: number | null;
  toleranciaPct: number;
  toleranciaReais: number;
  fundamento: string | null;
  observacao: string | null;
}

export interface VerificacaoTributaria {
  codigo: string;
  rotulo: string;
  /** O que a verificação faz, em uma frase, para quem lê o relatório. */
  explicacao: string;
  /** De onde vem a exigência. Vazio quando é só consistência aritmética. */
  fundamento?: string;
  /** `erro`: está errado. `alerta`: pode estar certo, mas precisa de olho. */
  gravidade: "erro" | "alerta";
  /** Só aparece quando existe regra cadastrada para o ente. */
  dependeDeRegra: boolean;
}

/** Catálogo. Os códigos são os mesmos de sada_vw_validacao_tributaria. */
export const VERIFICACOES: VerificacaoTributaria[] = [
  {
    codigo: "trib_total_soma",
    rotulo: "Total não fecha com as parcelas",
    explicacao:
      "O total informado difere de principal + atualização + juros + multa em mais de R$ 1,00.",
    gravidade: "erro",
    dependeDeRegra: false,
  },
  {
    codigo: "trib_multa_divergente",
    rotulo: "Multa fora da regra do ente",
    explicacao:
      "A multa informada não bate com a alíquota cadastrada para o tributo na data de vencimento.",
    gravidade: "erro",
    dependeDeRegra: true,
  },
  {
    codigo: "trib_juros_divergente",
    rotulo: "Juros fora da regra do ente",
    explicacao:
      "Os juros informados não batem com a taxa cadastrada aplicada aos meses de atraso.",
    gravidade: "erro",
    dependeDeRegra: true,
  },
  {
    codigo: "trib_correcao_divergente",
    rotulo: "Correção fora da regra do ente",
    explicacao:
      "A atualização monetária informada não bate com o índice anual cadastrado para o período.",
    gravidade: "erro",
    dependeDeRegra: true,
  },
  {
    codigo: "trib_multa_teto",
    rotulo: "Multa acima de 20% do principal",
    explicacao:
      "Multa de mora acima do patamar que a jurisprudência aceita como não confiscatório.",
    fundamento: "STF, multa de mora não confiscatória (limite de 20%)",
    gravidade: "erro",
    dependeDeRegra: false,
  },
  {
    codigo: "trib_juros_teto",
    rotulo: "Juros acima de 1% ao mês",
    explicacao:
      "Juros informados acima de 1% ao mês de atraso, sem lei do ente que autorize taxa maior.",
    fundamento: "CTN art. 161 §1º",
    gravidade: "erro",
    dependeDeRegra: false,
  },
  {
    codigo: "trib_selic_e_correcao",
    rotulo: "SELIC somada à correção",
    explicacao:
      "O ente usa SELIC, que já engloba juros e correção, mas a linha traz atualização à parte — a diferença é cobrada duas vezes.",
    fundamento: "Lei 9.430/96 art. 61 §3º, por analogia",
    gravidade: "erro",
    dependeDeRegra: true,
  },
  {
    codigo: "trib_sem_regra",
    rotulo: "Encargos sem regra cadastrada",
    explicacao:
      "A linha tem multa, juros ou correção, mas não há regra vigente cadastrada para conferir. É cobertura da validação, não erro do dado.",
    gravidade: "alerta",
    dependeDeRegra: false,
  },
  {
    codigo: "trib_venc_invalido",
    rotulo: "Vencimento ausente ou impossível",
    explicacao:
      "Sem mês/ano de vencimento válido não dá para calcular atraso nem prescrição.",
    gravidade: "erro",
    dependeDeRegra: false,
  },
  {
    codigo: "trib_venc_futuro",
    rotulo: "Vencimento depois da data-base",
    explicacao:
      "O vencimento é posterior à foto do estoque: ou a dívida não deveria estar inscrita, ou a data está errada.",
    gravidade: "alerta",
    dependeDeRegra: false,
  },
  {
    codigo: "trib_prescricao",
    rotulo: "Vencida há mais de 5 anos",
    explicacao:
      "Prazo de prescrição vencido na data-base. Só é problema se não houve interrupção (parcelamento, citação, confissão).",
    fundamento: "CTN art. 174",
    gravidade: "alerta",
    dependeDeRegra: false,
  },
];

export const VERIFICACAO_POR_CODIGO = new Map(VERIFICACOES.map((v) => [v.codigo, v]));

export function ehCodigoTributario(codigo: string): boolean {
  return VERIFICACAO_POR_CODIGO.has(codigo);
}

// =====================================================================
// A mesma matemática da view, para o simulador da tela
// =====================================================================

/**
 * Meses de atraso entre o vencimento e a data-base.
 *
 * Nulo quando não há vencimento OU quando ele é posterior à data-base: nesse
 * caso não há encargo nenhum a esperar, e comparar contra zero apontaria
 * divergência em toda dívida a vencer.
 */
export function mesesAtraso(
  venc: { mes: number | null; ano: number | null },
  dataBase: Date,
): number | null {
  if (!venc.ano || !venc.mes || venc.mes < 1 || venc.mes > 12) return null;
  if (venc.ano < 1980 || venc.ano > 2100) return null;
  const dv = new Date(Date.UTC(venc.ano, venc.mes - 1, 1));
  const db = new Date(Date.UTC(dataBase.getUTCFullYear(), dataBase.getUTCMonth(), dataBase.getUTCDate()));
  if (dv > db) return null;
  const meses =
    (db.getUTCFullYear() - dv.getUTCFullYear()) * 12 + (db.getUTCMonth() - dv.getUTCMonth());
  // O `age()` do Postgres só conta o mês cheio: 01/01 a 15/01 é zero mês.
  return db.getUTCDate() >= dv.getUTCDate() ? meses : meses - 1;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

export interface EncargosEsperados {
  multa: number | null;
  juros: number | null;
  correcao: number | null;
  /** Tolerância em reais de cada comparação, já resolvida. */
  tolerancia: { multa: number; juros: number; correcao: number };
}

/** Encargos que a regra do ente prevê para um principal e um atraso. */
export function encargosEsperados(
  regra: RegraTributaria,
  principal: number,
  meses: number | null,
): EncargosEsperados {
  const semDado = meses === null || !Number.isFinite(principal);

  const multa = semDado
    ? null
    : regra.multaTipo === "progressiva"
      ? centavos(
          (principal * Math.min(regra.multaPct * (meses as number), regra.multaTetoPct ?? TETO_MULTA_PCT)) / 100,
        )
      : centavos((principal * regra.multaPct) / 100);

  const juros = semDado
    ? null
    : regra.jurosModo === "mensal"
      ? centavos((principal * regra.jurosPctMes * (meses as number)) / 100)
      : regra.selicMediaAA !== null
        ? centavos(principal * (Math.pow(1 + regra.selicMediaAA / 100, (meses as number) / 12) - 1))
        : null;

  const correcao = semDado
    ? null
    : regra.jurosModo === "selic"
      ? 0 // na SELIC não há correção à parte
      : regra.correcaoPctAA !== null
        ? centavos(principal * (Math.pow(1 + regra.correcaoPctAA / 100, (meses as number) / 12) - 1))
        : null;

  const tol = (esperado: number | null) =>
    Math.max(regra.toleranciaReais, ((esperado ?? 0) * regra.toleranciaPct) / 100);

  return {
    multa,
    juros,
    correcao,
    tolerancia: { multa: tol(multa), juros: tol(juros), correcao: tol(correcao) },
  };
}

/** Regra que vale para um tributo numa data: a específica ganha da genérica. */
export function regraAplicavel(
  regras: RegraTributaria[],
  tributo: string | null,
  data: string,
): RegraTributaria | null {
  const candidatas = regras
    .filter((r) => r.tributo === TRIBUTO_TODOS || r.tributo === tributo)
    .filter((r) => r.vigenciaInicio <= data && (!r.vigenciaFim || r.vigenciaFim >= data))
    .sort((a, b) => {
      const espec = Number(b.tributo !== TRIBUTO_TODOS) - Number(a.tributo !== TRIBUTO_TODOS);
      return espec !== 0 ? espec : b.vigenciaInicio.localeCompare(a.vigenciaInicio);
    });
  return candidatas[0] ?? null;
}

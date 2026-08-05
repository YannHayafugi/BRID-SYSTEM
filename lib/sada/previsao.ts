/**
 * SADA · Previsão orçamentária da dívida ativa.
 *
 * Modelo de equação de balanço (roll-forward) por safra de inscrição:
 *
 *     E_t = E_{t-1} + I_t + A_t − R_t − C_t
 *
 * A documentação completa — origem de cada fórmula, calibração e limites —
 * está em docs/SADA-PREVISAO-ORCAMENTARIA.md. Leia antes de mexer nos padrões.
 *
 * Funções puras de propósito: a tela recalcula a cada ajuste de parâmetro sem
 * ida ao servidor, e a matemática fica testável isoladamente
 * (scripts/sada-previsao-teste.ts).
 */

// =====================================================================
// Entradas
// =====================================================================

/** Dados calibrados na base do ente — vêm de /api/sada/previsao. */
export interface BasePrevisao {
  /** Último exercício completo; a projeção começa em anoBase + 1. */
  anoBase: number;
  /** Estoque em aberto por safra de inscrição, em PRINCIPAL (campo `valor`). */
  safras: { ano: number; principal: number }[];
  /**
   * Taxa anual de encargos implícita, estimada pela razão entre as duas únicas
   * safras com `total` preenchido. Ver `estimarEncargos`.
   */
  encargosAA: number;
  /** Idade (em anos) da safra mais recente no momento da foto. */
  idadeFoto: number;
  /** w(k): fração do total recuperado que ocorre na idade k. Soma ~1. */
  curvaW: number[];
  /** Taxa de recuperação de ciclo de vida (recuperado / (recuperado + aberto)). */
  ciclo: number;
  /** Inscrição do último exercício antes da quebra estrutural. */
  inscricaoBase: number;
  anoInscricaoBase: number;
}

export interface Parametros {
  /** Índice de correção monetária (IPCA-E, IPCA…), decimal. */
  correcao: number;
  /** Juros de mora, decimal a.a. CTN art. 161 §1º admite 0,12. */
  juros: number;
  /** Fração do inadimplido que efetivamente é inscrita em DA. */
  phi: number;
  /** Fração com prescrição interrompida (cobrança ativa). */
  theta: number;
  /** Crescimento anual das inscrições, decimal. */
  crescimento: number;
  /** Inflação projetada, para a série a preços constantes. */
  inflacao: number;
  /** Prazo de prescrição — CTN art. 174 usa 5. */
  anosPrescricao: number;
  /** Quantos anos projetar. */
  horizonte: number;
  /**
   * Multiplicador do patamar de inscrição. 1 = mantém o padrão histórico;
   * >1 assume que a mudança de política de 2025 (mais parcelas inscritas por
   * contribuinte) é permanente. Hipótese administrativa, não estatística —
   * ver §1.3 do documento.
   */
  patamar: number;
}

export const PARAMETROS_PADRAO: Parametros = {
  correcao: 0.04,
  juros: 0.12,
  phi: 0.85,
  theta: 0.7,
  crescimento: 0.185,
  inflacao: 0.04,
  anosPrescricao: 5,
  horizonte: 10,
  patamar: 1,
};

export interface AnoProjetado {
  ano: number;
  estoqueInicial: number;
  inscricoes: number;
  encargos: number;
  recuperacao: number;
  baixas: number;
  estoqueFinal: number;
  /** Recuperação deflacionada para moeda do anoBase. */
  recuperacaoReal: number;
  /** Provisão para perdas (MCASP) sobre o estoque final. */
  provisaoPerdas: number;
}

export type Cenario = "conservador" | "base" | "otimista";

// =====================================================================
// Calibração
// =====================================================================

/**
 * Estima a taxa anual de encargos a partir das DUAS safras que têm `total`
 * preenchido, pela razão entre as razões total/principal.
 *
 * Dividir uma razão pela outra cancela a data da foto, que é desconhecida.
 * Estimar por uma safra só exigiria supor a idade dela — e supor "exatamente
 * 10 anos" para a safra 2015 dá 15,5% a.a., contra os 13,9% do método aqui.
 * A diferença compõe: em 10 anos são ~15% a mais de estoque projetado.
 *
 * A estimativa se autovalida: a idade implícita da safra recente deve bater
 * com a distância entre a inscrição e a data da exportação.
 */
export function estimarEncargos(
  safraAntiga: { ano: number; principal: number; total: number },
  safraRecente: { ano: number; principal: number; total: number },
): { encargosAA: number; idadeFoto: number } {
  const rAntiga = safraAntiga.total / safraAntiga.principal;
  const rRecente = safraRecente.total / safraRecente.principal;
  const anos = safraRecente.ano - safraAntiga.ano;
  if (anos <= 0 || rRecente <= 0 || rAntiga <= 0) {
    return { encargosAA: 0, idadeFoto: 0 };
  }
  const fator = Math.pow(rAntiga / rRecente, 1 / anos);
  return {
    encargosAA: fator - 1,
    idadeFoto: Math.log(rRecente) / Math.log(fator),
  };
}

/**
 * Converte w(k) — distribuição do que foi recuperado por idade — em ρ(k),
 * a taxa sobre o saldo AINDA ABERTO naquela idade.
 *
 * Os dois são frequentemente confundidos porque ambos "parecem uma taxa de
 * recuperação". w(k) soma 1 sobre todas as idades; ρ(k) não soma nada. Usar
 * w(k) direto na equação de balanço subestima a recuperação das idades
 * avançadas, porque ignora que o saldo já encolheu.
 */
export function curvaHazard(curvaW: number[], ciclo: number, acumulacaoAA = 0): number[] {
  const rho: number[] = [];
  let saldo = 1;
  for (const w of curvaW) {
    const recuperado = ciclo * w;
    rho.push(saldo > 1e-9 ? recuperado / saldo : 0);
    // O saldo cresce com encargos entre uma idade e a seguinte. Derivar rho num
    // saldo estático e aplicá-lo depois num saldo que cresce 16% a.a. seria
    // inconsistente — superestimaria a recuperação das idades avançadas.
    saldo = (saldo - recuperado) * (1 + acumulacaoAA);
    if (saldo < 0) saldo = 0;
  }
  return rho;
}

/** Estoque com encargos de uma safra, reconstruído a partir do principal. */
export function estoqueComEncargos(
  principal: number,
  safra: number,
  anoBase: number,
  encargosAA: number,
  idadeFoto: number,
): number {
  const idade = idadeFoto + (anoBase - safra);
  return principal * Math.pow(1 + encargosAA, idade);
}

// =====================================================================
// Projeção
// =====================================================================

/**
 * Roll-forward ano a ano, mantendo o saldo de cada safra separado — é o que
 * permite aplicar ρ por idade e a prescrição no momento certo.
 *
 * Ordem dentro do exercício: encargos incidem sobre o saldo de abertura,
 * depois a recuperação, depois a prescrição, e por último a safra nova entra.
 * A safra do próprio exercício não recebe encargos nem sofre prescrição no ano
 * em que é inscrita.
 */
export function projetar(base: BasePrevisao, p: Parametros): AnoProjetado[] {
  const rho = curvaHazard(base.curvaW, base.ciclo, p.correcao + p.juros);
  const rhoEm = (k: number) => (k < 0 ? 0 : rho[Math.min(k, rho.length - 1)] ?? 0);

  // Saldo por safra, com encargos reconstruídos até o ano base.
  const saldo = new Map<number, number>();
  for (const s of base.safras) {
    saldo.set(
      s.ano,
      estoqueComEncargos(s.principal, s.ano, base.anoBase, base.encargosAA, base.idadeFoto),
    );
  }

  // Safras que já passaram do prazo antes da projeção começar: a prescrição
  // delas é evento passado, não do horizonte projetado. Aplicada uma vez aqui
  // para o estoque de abertura não carregar crédito legalmente extinto.
  for (const [v, s] of saldo) {
    if (base.anoBase - v >= p.anosPrescricao) saldo.set(v, s * p.theta);
  }

  const taxaEncargos = p.correcao + p.juros;
  const out: AnoProjetado[] = [];

  for (let n = 1; n <= p.horizonte; n++) {
    const ano = base.anoBase + n;
    let estoqueInicial = 0;
    for (const s of saldo.values()) estoqueInicial += s;

    // 1) Encargos sobre o saldo de abertura
    let encargos = 0;
    for (const [v, s] of saldo) {
      const a = s * taxaEncargos;
      encargos += a;
      saldo.set(v, s + a);
    }

    // 2) Recuperação, por idade de cada safra
    let recuperacao = 0;
    for (const [v, s] of saldo) {
      const r = s * rhoEm(ano - v);
      recuperacao += r;
      saldo.set(v, s - r);
    }

    // 3) Prescrição: incide UMA vez, no exercício em que a safra completa o
    //    prazo. Aplicar todo ano transformaria o prazo legal num decaimento
    //    geométrico, que não é o que o CTN art. 174 descreve.
    let baixas = 0;
    for (const [v, s] of saldo) {
      if (ano - v === p.anosPrescricao) {
        const b = s * (1 - p.theta);
        baixas += b;
        saldo.set(v, s - b);
      }
    }

    // 4) Inscrições novas entram como safra do próprio exercício
    const inscricoes =
      base.inscricaoBase *
      Math.pow(1 + p.crescimento, ano - base.anoInscricaoBase) *
      p.phi *
      p.patamar;
    saldo.set(ano, inscricoes);

    let estoqueFinal = 0;
    for (const s of saldo.values()) estoqueFinal += s;

    const deflator = Math.pow(1 + p.inflacao, n);
    out.push({
      ano,
      estoqueInicial,
      inscricoes,
      encargos,
      recuperacao,
      baixas,
      estoqueFinal,
      recuperacaoReal: recuperacao / deflator,
      provisaoPerdas: estoqueFinal * (1 - base.ciclo),
    });
  }

  return out;
}

/**
 * Cenários conservador/base/otimista deslocando os dois parâmetros de maior
 * alavancagem. Preferido a intervalo de confiança estatístico: com 9 a 11
 * pontos anuais a banda de 95% fica larga demais para orientar decisão, e a
 * aparência de rigor seria enganosa.
 */
export function cenarios(
  base: BasePrevisao,
  p: Parametros,
  desvio = 0.25,
): Record<Cenario, AnoProjetado[]> {
  return {
    conservador: projetar(base, {
      ...p,
      crescimento: p.crescimento * (1 - desvio),
      phi: Math.max(0, p.phi * (1 - desvio)),
    }),
    base: projetar(base, p),
    otimista: projetar(base, {
      ...p,
      crescimento: p.crescimento * (1 + desvio),
      phi: Math.min(1, p.phi * (1 + desvio)),
    }),
  };
}

/** CAGR entre dois pontos de uma série anual. */
export function cagr(inicio: number, fim: number, anos: number): number {
  if (inicio <= 0 || anos <= 0) return 0;
  return Math.pow(fim / inicio, 1 / anos) - 1;
}

/**
 * Tendência log-linear por mínimos quadrados. Devolve o crescimento anual
 * implícito. Preferido ao CAGR quando há mais de 3 pontos: o CAGR usa só os
 * extremos e ignora tudo entre eles.
 */
export function tendenciaLogLinear(pontos: { ano: number; valor: number }[]): number {
  const validos = pontos.filter((p) => p.valor > 0);
  const n = validos.length;
  if (n < 2) return 0;
  const mediaX = validos.reduce((s, p) => s + p.ano, 0) / n;
  const mediaY = validos.reduce((s, p) => s + Math.log(p.valor), 0) / n;
  let num = 0, den = 0;
  for (const p of validos) {
    num += (p.ano - mediaX) * (Math.log(p.valor) - mediaY);
    den += (p.ano - mediaX) ** 2;
  }
  return den === 0 ? 0 : Math.exp(num / den) - 1;
}

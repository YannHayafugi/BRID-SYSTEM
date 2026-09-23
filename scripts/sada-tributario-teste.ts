/**
 * Confere a matemática de lib/sada/tributario.ts contra os MESMOS casos que
 * rodaram no Postgres quando a view sada_vw_regra_linha foi criada.
 *
 * Os valores esperados abaixo não foram calculados aqui: são a saída do banco
 * para sete dívidas de teste (principal R$ 1.000, regra de multa 20%, juros 1%
 * ao mês e correção 4% a.a., data-base 31/12/2024). É isso que dá sentido ao
 * teste — se as duas implementações divergirem, o simulador da tela passa a
 * prometer um número que a validação não vai confirmar.
 *
 * Rodar:  npx tsx scripts/sada-tributario-teste.ts
 */
import { encargosEsperados, mesesAtraso, type RegraTributaria } from "../lib/sada/tributario";

const regra: RegraTributaria = {
  cnpjOrgao: "99999999000199",
  tributo: "*",
  vigenciaInicio: "2010-01-01",
  vigenciaFim: null,
  multaTipo: "unica",
  multaPct: 20,
  multaTetoPct: null,
  jurosModo: "mensal",
  jurosPctMes: 1,
  selicMediaAA: null,
  correcaoIndice: "IPCA",
  correcaoPctAA: 4,
  honorariosPct: null,
  toleranciaPct: 5,
  toleranciaReais: 1,
  fundamento: "TESTE",
  observacao: null,
};

const DATA_BASE = new Date(Date.UTC(2024, 11, 31));

interface Caso {
  nome: string;
  venc: { mes: number | null; ano: number | null };
  principal: number;
  meses: number | null;
  multa: number | null;
  juros: number | null;
  correcao: number | null;
}

// Saída do Postgres (sada_vw_regra_linha) para os mesmos dados.
const CASOS: Caso[] = [
  { nome: "venc 01/2023", venc: { mes: 1, ano: 2023 }, principal: 1000,
    meses: 23, multa: 200, juros: 230, correcao: 78.07 },
  { nome: "venc 01/2015 (prescrito)", venc: { mes: 1, ano: 2015 }, principal: 1000,
    meses: 119, multa: 200, juros: 1190, correcao: 475.41 },
  { nome: "venc 06/2025 (futuro)", venc: { mes: 6, ano: 2025 }, principal: 1000,
    meses: null, multa: null, juros: null, correcao: null },
  { nome: "sem vencimento", venc: { mes: null, ano: null }, principal: 1000,
    meses: null, multa: null, juros: null, correcao: null },
];

let falhas = 0;
const igual = (nome: string, campo: string, obtido: number | null, esperado: number | null) => {
  // Centavo de folga: o Postgres arredonda em numeric, o JS em binário.
  const ok =
    obtido === null || esperado === null
      ? obtido === esperado
      : Math.abs(obtido - esperado) <= 0.01;
  if (!ok) {
    falhas++;
    console.error(`FALHOU  ${nome} · ${campo}: obtido ${obtido}, esperado ${esperado}`);
  }
};

for (const c of CASOS) {
  const meses = mesesAtraso(c.venc, DATA_BASE);
  igual(c.nome, "meses", meses, c.meses);
  const e = encargosEsperados(regra, c.principal, meses);
  igual(c.nome, "multa", e.multa, c.multa);
  igual(c.nome, "juros", e.juros, c.juros);
  igual(c.nome, "correcao", e.correcao, c.correcao);
}

// SELIC: não há correção à parte, e sem a média anual os juros não são
// recalculados (a tela mostra "sem taxa" em vez de inventar um número).
const selic: RegraTributaria = { ...regra, jurosModo: "selic", selicMediaAA: null };
const eSelic = encargosEsperados(selic, 1000, 24);
igual("selic sem média", "juros", eSelic.juros, null);
igual("selic sem média", "correcao", eSelic.correcao, 0);

// Multa progressiva: 0,33% ao mês, teto de 20% — o teto tem de segurar.
const prog: RegraTributaria = { ...regra, multaTipo: "progressiva", multaPct: 0.33, multaTetoPct: 20 };
igual("progressiva 10 meses", "multa", encargosEsperados(prog, 1000, 10).multa, 33);
igual("progressiva 120 meses (teto)", "multa", encargosEsperados(prog, 1000, 120).multa, 200);

if (falhas > 0) {
  console.error(`\n${falhas} divergência(s).`);
  process.exit(1);
}
console.log(`OK — ${CASOS.length} casos do banco + SELIC + multa progressiva conferem.`);

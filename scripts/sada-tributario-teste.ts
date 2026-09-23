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
import {
  encargosEsperados,
  limitesVigentes,
  mesesAtraso,
  regraAplicavel,
  type RegraTributaria,
} from "../lib/sada/tributario";

const regra: RegraTributaria = {
  nivel: "municipal",
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
  tetoMultaPct: null,
  tetoJurosPctMes: null,
  anosPrescricao: null,
};

/** Lei geral como está no banco: só limites e juros supletivos, sem multa. */
const leiGeral: RegraTributaria = {
  ...regra,
  nivel: "geral",
  cnpjOrgao: null,
  tributo: "*",
  vigenciaInicio: "1966-10-25",
  multaPct: null,
  jurosPctMes: 1,
  correcaoIndice: null,
  correcaoPctAA: null,
  fundamento: "CTN arts. 161 §1º e 174",
  tetoMultaPct: 20,
  tetoJurosPctMes: 1,
  anosPrescricao: 5,
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

// Precedência e limites: os mesmos casos conferidos no Postgres quando a
// lei geral entrou (ver o commit que criou o nível 'geral').
const iptuMunicipal: RegraTributaria = { ...regra, tributo: "IPTU", multaPct: 2, jurosPctMes: 0.5 };
const todosMunicipal: RegraTributaria = { ...regra, tributo: "*", multaPct: 10 };
const todas = [leiGeral, iptuMunicipal, todosMunicipal];

const escolhida = (tributo: string, cnpj: string | null) =>
  regraAplicavel(todas, cnpj, tributo, "2023-01-01");

const conferir = (nome: string, obtido: unknown, esperado: unknown) => {
  if (obtido !== esperado) {
    falhas++;
    console.error(`FALHOU  ${nome}: obtido ${String(obtido)}, esperado ${String(esperado)}`);
  }
};

// IPTU do ente: a municipal do tributo ganha da municipal '*' e da geral.
conferir("precedência IPTU", escolhida("IPTU", regra.cnpjOrgao)?.multaPct, 2);
// ISS do mesmo ente: cai na municipal '*'.
conferir("precedência ISS", escolhida("ISS", regra.cnpjOrgao)?.multaPct, 10);
// Ente sem lei municipal: sobra a geral — sem multa a esperar, juros de 1%.
conferir("ente sem lei municipal", escolhida("IPTU", "11111111000111")?.nivel, "geral");
conferir("lei geral não fixa multa", encargosEsperados(leiGeral, 1000, 23).multa, null);
conferir("juros supletivos do CTN", encargosEsperados(leiGeral, 1000, 23).juros, 230);
// O teto vem SEMPRE da lei geral, mesmo quando a municipal manda no esperado.
conferir("teto de multa", limitesVigentes(todas, "IPTU", "2023-01-01").tetoMultaPct, 20);
conferir("teto de juros", limitesVigentes(todas, "IPTU", "2023-01-01").tetoJurosPctMes, 1);
conferir("prazo de prescrição", limitesVigentes(todas, "IPTU", "2023-01-01").anosPrescricao, 5);

if (falhas > 0) {
  console.error(`\n${falhas} divergência(s).`);
  process.exit(1);
}
console.log(
  `OK — ${CASOS.length} casos do banco + SELIC + multa progressiva + precedência ` +
    "lei geral/municipal e limites conferem.",
);

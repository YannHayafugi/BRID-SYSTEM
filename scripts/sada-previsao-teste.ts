/**
 * Confere a matematica do modelo de previsao contra propriedades que devem
 * valer sempre, e contra as ancoras medidas na base real.
 * Ver docs/SADA-PREVISAO-ORCAMENTARIA.md.
 */
import {
  BasePrevisao, PARAMETROS_PADRAO, Parametros, cagr, cenarios, curvaHazard,
  estimarEncargos, estoqueComEncargos, projetar, tendenciaLogLinear,
} from "../lib/sada/previsao";

let falhas = 0;
const ok = (nome: string, cond: boolean, extra = "") => {
  if (!cond) { falhas++; console.log(`  FALHOU  ${nome} ${extra}`); }
  else console.log(`  ok      ${nome}`);
};
const perto = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

// Ancoras medidas na base do ente (ver doc, secao 4).
const SAFRA_2015 = { ano: 2015, principal: 2014470.47, total: 8535411.35 };
const SAFRA_2025 = { ano: 2025, principal: 23600372.82, total: 27141747.99 };
const CURVA_W = [0.5885, 0.1990, 0.0830, 0.0428, 0.0319, 0.0199,
                 0.0096, 0.0087, 0.0058, 0.0051, 0.0042, 0.0015];

// ---------------------------------------------------------------------
console.log("\n1. estimarEncargos (razao das razoes cancela a data da foto)");

const e = estimarEncargos(SAFRA_2015, SAFRA_2025);
ok("encargos ~13,93% a.a.", Math.abs(e.encargosAA - 0.1393) < 0.0005,
   (e.encargosAA * 100).toFixed(2) + "%");
ok("idade implicita da safra recente ~1,07 ano",
   Math.abs(e.idadeFoto - 1.072) < 0.01, e.idadeFoto.toFixed(3));

// A validacao que importa: o mesmo par de parametros tem que reproduzir AS DUAS
// ancoras. Estimar por uma safra so (supondo idade 10) daria 15,5% e erraria.
const rec2015 = estoqueComEncargos(SAFRA_2015.principal, 2015, 2025, e.encargosAA, e.idadeFoto);
const rec2025 = estoqueComEncargos(SAFRA_2025.principal, 2025, 2025, e.encargosAA, e.idadeFoto);
ok("reconstroi o total de 2015 (erro < 1%)",
   Math.abs(rec2015 / SAFRA_2015.total - 1) < 0.01,
   `${rec2015.toFixed(0)} vs ${SAFRA_2015.total}`);
ok("reconstroi o total de 2025 (erro < 1%)",
   Math.abs(rec2025 / SAFRA_2025.total - 1) < 0.01,
   `${rec2025.toFixed(0)} vs ${SAFRA_2025.total}`);

// ---------------------------------------------------------------------
console.log("\n2. curvaHazard: w(k) -> rho(k)");

const ciclo = 0.394;
const rho = curvaHazard(CURVA_W, ciclo); // sem acumulacao: rho puro
ok("rho(0) ~23,2%", Math.abs(rho[0] - 0.232) < 0.002, (rho[0] * 100).toFixed(1) + "%");
ok("rho(1) ~10,2%", Math.abs(rho[1] - 0.102) < 0.002, (rho[1] * 100).toFixed(1) + "%");
ok("rho e decrescente", rho.every((v, i) => i === 0 || v <= rho[i - 1] + 1e-9));
ok("todo rho em [0,1]", rho.every((v) => v >= 0 && v <= 1));

// Propriedade central: aplicando rho(k) sequencialmente a uma safra de valor 1,
// o total recuperado tem que fechar com `ciclo`. E o teste que pega a confusao
// entre w(k) e rho(k) — usar w direto daria um numero diferente.
let saldo = 1, acumulado = 0;
for (const r of rho) { const pago = saldo * r; acumulado += pago; saldo -= pago; }
ok("recuperacao acumulada converge para o ciclo",
   perto(acumulado, ciclo * CURVA_W.reduce((s, w) => s + w, 0), 1e-6),
   `${acumulado.toFixed(6)} vs ${ciclo}`);

// ---------------------------------------------------------------------
console.log("\n3. projetar: identidade contabil");

const base: BasePrevisao = {
  anoBase: 2025,
  safras: [
    { ano: 2015, principal: 2014470.47 }, { ano: 2016, principal: 1558307.11 },
    { ano: 2017, principal: 1643001.85 }, { ano: 2018, principal: 5055661.22 },
    { ano: 2019, principal: 5219675.90 }, { ano: 2020, principal: 5474099.16 },
    { ano: 2021, principal: 5613674.62 }, { ano: 2022, principal: 7827912.54 },
    { ano: 2023, principal: 8934162.79 }, { ano: 2024, principal: 9254078.00 },
    { ano: 2025, principal: 23600372.82 },
  ],
  encargosAA: e.encargosAA,
  idadeFoto: e.idadeFoto,
  curvaW: CURVA_W,
  ciclo,
  inscricaoBase: 9254078.00,
  anoInscricaoBase: 2024,
};

const proj = projetar(base, PARAMETROS_PADRAO);
ok("projeta 10 exercicios", proj.length === 10, String(proj.length));
ok("comeca em 2026", proj[0].ano === 2026, String(proj[0].ano));

// E_t = E_{t-1} + I + A - R - C, exercicio a exercicio.
let identidadeOk = true, detalhe = "";
for (const a of proj) {
  const esperado = a.estoqueInicial + a.inscricoes + a.encargos - a.recuperacao - a.baixas;
  if (!perto(a.estoqueFinal, esperado, 1e-9)) {
    identidadeOk = false;
    detalhe = `${a.ano}: ${a.estoqueFinal.toFixed(2)} != ${esperado.toFixed(2)}`;
    break;
  }
}
ok("identidade de balanco fecha em todos os anos", identidadeOk, detalhe);

// Encadeamento: o final de um ano tem que ser o inicial do seguinte.
let encadeiaOk = true;
for (let i = 1; i < proj.length; i++) {
  if (!perto(proj[i].estoqueInicial, proj[i - 1].estoqueFinal, 1e-9)) { encadeiaOk = false; break; }
}
ok("estoque encadeia entre exercicios", encadeiaOk);
ok("nenhum componente negativo",
   proj.every((a) => a.estoqueFinal >= 0 && a.recuperacao >= 0 && a.baixas >= 0));

// ---------------------------------------------------------------------
console.log("\n4. sensibilidade e cenarios");

const semJuros = projetar(base, { ...PARAMETROS_PADRAO, correcao: 0, juros: 0 });
ok("sem encargos o estoque final e menor",
   semJuros[9].estoqueFinal < proj[9].estoqueFinal);

const semPrescricao = projetar(base, { ...PARAMETROS_PADRAO, theta: 1 });
ok("theta=1 (tudo interrompido) zera as baixas",
   semPrescricao.every((a) => perto(a.baixas, 0, 1e-9)));

const tudoPrescreve = projetar(base, { ...PARAMETROS_PADRAO, theta: 0 });
ok("theta=0 baixa mais que theta=0,7",
   tudoPrescreve.reduce((s, a) => s + a.baixas, 0) > proj.reduce((s, a) => s + a.baixas, 0));

const c = cenarios(base, PARAMETROS_PADRAO);
ok("otimista >= base >= conservador no estoque final",
   c.otimista[9].estoqueFinal >= c.base[9].estoqueFinal &&
   c.base[9].estoqueFinal >= c.conservador[9].estoqueFinal,
   `${c.conservador[9].estoqueFinal.toFixed(0)} / ${c.base[9].estoqueFinal.toFixed(0)} / ${c.otimista[9].estoqueFinal.toFixed(0)}`);

// Preco constante tem que ficar abaixo do corrente quando ha inflacao.
ok("recuperacao real < nominal com inflacao > 0",
   proj.every((a) => a.recuperacaoReal < a.recuperacao));

// O patamar e hipotese administrativa: dobrar tem que dobrar a inscricao nova.
const dobro = projetar(base, { ...PARAMETROS_PADRAO, patamar: 2 });
ok("patamar=2 dobra as inscricoes", perto(dobro[0].inscricoes, proj[0].inscricoes * 2, 1e-9));

// ---------------------------------------------------------------------
console.log("\n5. tendencia");

const serie = base.safras.filter((s) => s.ano <= 2024).map((s) => ({ ano: s.ano, valor: s.principal }));
const g = tendenciaLogLinear(serie);
ok("log-linear das inscricoes 2015-2024 entre 15% e 30%", g > 0.15 && g < 0.30,
   (g * 100).toFixed(1) + "%");
ok("cagr 2015->2024 ~18,5%",
   Math.abs(cagr(2014470.47, 9254078.00, 9) - 0.185) < 0.002,
   (cagr(2014470.47, 9254078.00, 9) * 100).toFixed(1) + "%");
ok("log-linear difere do cagr (usa todos os pontos)", Math.abs(g - 0.185) > 0.005);

// ---------------------------------------------------------------------
console.log(falhas === 0 ? "\nTUDO OK" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

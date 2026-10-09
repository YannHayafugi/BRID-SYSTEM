/**
 * Confere a agregação por categoria de lib/sada/categoria.ts contra a MESMA
 * massa que está no banco.
 *
 * As 34 siglas abaixo são as do lote vigente de 45.358.249/0001-01, com o
 * principal exato e a categoria que `sada_categoria_heuristica` atribuiu no
 * Postgres. Nada aqui foi calculado à mão: é a saída da consulta que validou
 * a heurística antes de ela virar migração.
 *
 * O que o teste protege: a composição da carteira — 53,4% imobiliário, 37,3%
 * mobiliário, 9,3% não estabelecido — é a primeira linha de todo gráfico do
 * documento de emissão. Se a soma no TypeScript divergir do que o banco
 * segmenta, o documento e a tela passam a contar histórias diferentes.
 *
 * Rodar:  npx tsx scripts/sada-categoria-teste.ts
 */
import {
  pendentesDeDecisao,
  somarPorCategoria,
  type Categoria,
  type SiglaCategoria,
} from "../lib/sada/categoria";

/** [sigla, categoria, títulos, principal] — direto do banco. */
const MASSA: [string, Categoria, number, number][] = [
  ["IPTU", "imobiliario", 613845, 52887883.19],
  ["ISS VARIAV GISS", "mobiliario", 12291, 12114005.86],
  ["ISSQN VARIAVEL-AÇÃO FISCAL", "mobiliario", 1380, 6767033.74],
  ["TAXA DE LICENCA PARA FUNCIONAMENTO", "mobiliario", 103208, 6554100.07],
  ["INFRACAO MOBILIARIA", "mobiliario", 480, 6366300.34],
  ["MULTA PUNITIVA CONTRATUAL", "nao_estabelecido", 31, 5850873.7],
  ["NFSE - ISS PRESTADOR", "mobiliario", 1643, 2547592.05],
  ["INFRACAO IMOBILIARIA", "imobiliario", 928, 2381758.13],
  ["RESSARCIMENTO", "nao_estabelecido", 125, 1949954.68],
  ["ISSQN VARIAVEL - MULTA PUNITIV", "mobiliario", 57, 1742129.22],
  ["ISSQN FIXO", "mobiliario", 11904, 1340494.87],
  ["CONTRIBUICAO DE MELHORIA", "imobiliario", 65, 932671.46],
  ["TOMAD/O.PUB GIS", "nao_estabelecido", 3653, 896366.82],
  ["ISSQN CONSTRUCAO CIVIL", "mobiliario", 446, 750516.85],
  ["SERVIÇOS DE CEMITÉRIO", "nao_estabelecido", 393, 552089.99],
  ["MULTA PUNITIVA VISAM", "mobiliario", 178, 482846.41],
  ["ISSQN - MEI", "mobiliario", 53324, 265047.15],
  ["ALIENAÇÃO IMOVEIS", "nao_estabelecido", 22, 222565.03],
  ["GER. PATIO MUNICIPAL", "nao_estabelecido", 142, 140983.61],
  ["ISS CON CIV GIS", "mobiliario", 423, 140914.34],
  ["INFRACAO TRANSITO", "nao_estabelecido", 34, 134410.37],
  ["NFSE - ISS TOMADOR", "mobiliario", 1000, 128277.35],
  ["RETIFICACAO SIMPLES NACIONAL", "nao_estabelecido", 131, 68078.38],
  ["ISS ESTI GISS", "mobiliario", 494, 33833.14],
  ["LICENCA VISAM", "mobiliario", 199, 18232.03],
  ["PRECO PUBLICO", "nao_estabelecido", 10, 9129.03],
  ["RENOVACAO VISAM", "mobiliario", 105, 6582.1],
  ["LAUDO TECNICO - VISAM", "mobiliario", 22, 5869.57],
  ["ISSQN VARIAVEL", "mobiliario", 4, 1919.93],
  ["TAXA LIXO PRIVADO/ENTULHO", "nao_estabelecido", 5, 1611.95],
  ["RESPON TECNICA VISAM", "mobiliario", 14, 1300.76],
  ["NFSE - NOTA AVULSA", "mobiliario", 5, 276.42],
  ["JUROS ESTATICO JUDICIAL", "nao_estabelecido", 1, 188.35],
  ["LICENCIAMENTO AMBIENTAL", "mobiliario", 1, 131.39],
];

/**
 * IPTU, ISS e contribuição de melhoria entram classificados pela migração
 * (nível global); o resto chega como chute da heurística. É esta a mistura
 * que a tela recebe no primeiro acesso de um ente novo.
 */
const CLASSIFICADAS_NA_MIGRACAO = new Set(["IPTU", "CONTRIBUICAO DE MELHORIA"]);

const siglas: SiglaCategoria[] = MASSA.map(([sigla, categoria, titulos, principal]) => ({
  cnpjOrgao: "45358249000101",
  sigla,
  categoria,
  origem: CLASSIFICADAS_NA_MIGRACAO.has(sigla) ? "global" : "heuristica",
  titulosDa: titulos,
  principalDa: principal,
  titulosLanc: 0,
  titulosRec: 0,
}));

let falhas = 0;
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  const ok = Object.is(obtido, esperado);
  if (!ok) {
    falhas++;
    console.error(`FALHOU  ${nome}: obtido ${obtido}, esperado ${esperado}`);
  }
}

const porCategoria = somarPorCategoria(siglas);
const acha = (c: Categoria) => porCategoria.find((x) => x.categoria === c)!;
const pct1 = (c: Categoria) => Math.round(acha(c).pct * 10) / 10;

// Composição medida no Postgres sobre as mesmas 806.563 linhas.
conferir("imobiliário %", pct1("imobiliario"), 53.4);
conferir("mobiliário %", pct1("mobiliario"), 37.3);
conferir("não estabelecido %", pct1("nao_estabelecido"), 9.3);

conferir("imobiliário: siglas", acha("imobiliario").siglas, 3);
conferir("mobiliário: siglas", acha("mobiliario").siglas, 20);
conferir("não estabelecido: siglas", acha("nao_estabelecido").siglas, 11);
conferir("soma das siglas", porCategoria.reduce((s, c) => s + c.siglas, 0), MASSA.length);

// Os percentuais têm de fechar em 100: uma categoria esquecida no map sumiria
// sem erro nenhum, só com a barra da tela um pouco mais curta.
const somaPct = porCategoria.reduce((s, c) => s + c.pct, 0);
conferir("percentuais fecham em 100", Math.round(somaPct * 1e6) / 1e6, 100);

// A ordem vem de CATEGORIAS, não da massa: a barra e a legenda da tela são
// lidas lado a lado e trocar a ordem entre as duas confunde quem compara.
conferir("ordem estável", porCategoria.map((c) => c.categoria).join(","),
  "imobiliario,mobiliario,nao_estabelecido");

// Categoria sem nenhuma sigla ainda precisa aparecer, zerada — senão a
// legenda muda de tamanho conforme o ente e parece defeito.
const soIptu = somarPorCategoria([siglas[0]]);
conferir("categoria vazia continua na lista", soIptu.length, 3);
conferir("categoria vazia não vira NaN", acha("imobiliario") && soIptu[1].pct, 0);

// Pendentes: o corte é em REAIS, não em quantidade de títulos. ISSQN - MEI
// tem 53 mil títulos e R$ 265 mil — entra; TAXA LIXO, com 5 títulos e R$ 1,6
// mil, não.
//
// A mais pesada é "ISS VARIAV GISS", com R$ 12,1 milhões, e isso diz algo
// sobre o desenho: a migração só classifica as siglas exatas 'ISS' e 'ISSQN',
// que não casam com os nomes compostos que os entes realmente usam. Quem
// acerta esses é a heurística — e ela é chute, então eles aparecem aqui para
// alguém confirmar. É o comportamento desejado, não uma lacuna.
const pendentes = pendentesDeDecisao(siglas);
conferir("pendente mais pesada", pendentes[0]?.sigla, "ISS VARIAV GISS");
conferir("pendentes acima de R$ 100 mil", pendentes.length, 20);
conferir("já classificada fica de fora", pendentes.some((p) => p.sigla === "IPTU"), false);
conferir("miúda fica de fora", pendentes.some((p) => p.sigla === "TAXA LIXO PRIVADO/ENTULHO"), false);
conferir("ordem por peso", pendentes.every((p, i) =>
  i === 0 || pendentes[i - 1].principalDa >= p.principalDa), true);

if (falhas > 0) {
  console.error(`\n${falhas} divergência(s).`);
  process.exit(1);
}
console.log(
  `OK — ${MASSA.length} siglas da base de produção: composição, ordem e ` +
    "corte dos pendentes conferem com o Postgres.",
);

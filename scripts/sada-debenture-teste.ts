/**
 * Confere o catálogo e a montagem do documento de debênture.
 *
 * A asserção que dá sentido ao resto: com TODOS os tópicos selecionados, o
 * sumário tem de dar exatamente **20 páginas** — que é o tamanho do
 * documento-modelo (20251216_SDA001). Se alguém acrescentar um tópico sem
 * conferir as páginas, ou esquecer uma divisória, a conta deixa de fechar e
 * o teste avisa antes de o documento sair torto.
 *
 * Rodar:  npx tsx scripts/sada-debenture-teste.ts
 */
import {
  OBRIGATORIOS,
  SECOES,
  SELECAO_PADRAO,
  TOPICOS,
  TOPICO_POR_SLUG,
  contarPaginas,
  montarSumario,
  normalizarSelecao,
  topicosSemDado,
} from "../lib/sada/debenture";

let falhas = 0;
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (!Object.is(obtido, esperado)) {
    falhas++;
    console.error(`FALHOU  ${nome}: obtido ${obtido}, esperado ${esperado}`);
  }
}

// ---------------------------------------------------------------- catálogo
conferir("tópicos no catálogo", TOPICOS.length, 15);
conferir("slugs únicos", new Set(TOPICOS.map((t) => t.slug)).size, TOPICOS.length);
conferir("obrigatórios", OBRIGATORIOS.join(","), "capa,disclaimer");
conferir(
  "toda seção do catálogo existe em SECOES",
  TOPICOS.every((t) => SECOES.some((s) => s.id === t.secao)),
  true,
);
conferir(
  "nenhuma página repetida entre tópicos",
  new Set(TOPICOS.flatMap((t) => t.paginas)).size,
  TOPICOS.reduce((s, t) => s + t.paginas.length, 0),
);

// ------------------------------------------------- o documento inteiro: 20
const sumarioCheio = montarSumario(SELECAO_PADRAO);
conferir("páginas com tudo marcado", contarPaginas(SELECAO_PADRAO), 20);
conferir("divisórias com tudo marcado",
  sumarioCheio.filter((i) => i.tipo === "divisoria").length, 4);
conferir("itens do sumário", sumarioCheio.length, TOPICOS.length + 4);
conferir("começa pela capa", sumarioCheio[0]?.slug, "capa");
conferir("termina no disclaimer", sumarioCheio[sumarioCheio.length - 1]?.slug, "disclaimer");

// A ordem das seções é fixa, não importa a ordem em que os slugs chegaram.
const embaralhado = [...SELECAO_PADRAO].reverse();
conferir("ordem das seções é fixa",
  montarSumario(normalizarSelecao(embaralhado)).map((i) => i.secao).join(",") ===
    sumarioCheio.map((i) => i.secao).join(","),
  true);

// ------------------------------------------------------------- normalizar
conferir("slug inventado sai",
  normalizarSelecao(["capa", "tributo_fantasma", "disclaimer"]).join(","),
  "capa,disclaimer");
conferir("repetido sai", normalizarSelecao(["capa", "capa", "disclaimer"]).length, 2);
conferir("obrigatório volta sozinho",
  normalizarSelecao(["estoque"]).includes("disclaimer"), true);
conferir("seleção vazia vira só os obrigatórios",
  normalizarSelecao([]).join(","), "capa,disclaimer");
conferir("lixo no lugar do array não quebra",
  normalizarSelecao(null).join(","), "capa,disclaimer");
conferir("obrigatório não duplica quando já veio",
  normalizarSelecao(["capa", "disclaimer", "capa"]).length, 2);

// --------------------------------------------------- seção vazia, divisória
// Só capa e disclaimer: nenhuma das duas seções tem divisória, então o
// sumário fica com dois itens e nenhuma página de abertura solta.
const minimo = normalizarSelecao([]);
conferir("mínimo não traz divisória",
  montarSumario(minimo).some((i) => i.tipo === "divisoria"), false);
conferir("mínimo tem 2 páginas", contarPaginas(minimo), 2);

// Com um tópico da análise retrospectiva, a divisória dela aparece — e só ela.
const comEstoque = normalizarSelecao(["estoque"]);
const sumEstoque = montarSumario(comEstoque);
conferir("divisória aparece com a seção",
  sumEstoque.filter((i) => i.tipo === "divisoria").map((i) => i.titulo).join(","),
  "ANÁLISE RETROSPECTIVA");
conferir("divisória conta como página", contarPaginas(comEstoque), 4);
conferir("divisória vem antes do tópico",
  sumEstoque.findIndex((i) => i.tipo === "divisoria") <
    sumEstoque.findIndex((i) => i.slug === "estoque"),
  true);

// ------------------------------------------- ordem dentro da seção é de quem monta
const trocado = normalizarSelecao([
  "capa", "curvas_recuperacao", "estoque", "disclaimer",
]);
conferir("ordem dentro da seção é respeitada",
  montarSumario(trocado).filter((i) => i.tipo === "topico").map((i) => i.slug).join(","),
  "capa,curvas_recuperacao,estoque,disclaimer");

// ------------------------------------------------------------- sem dado
// Estado real medido na base em 08/10/2026: estoque e lançamentos importados,
// as duas tabelas de recebimento vazias.
const PRONTOS_HOJE = new Set(["estoque", "lancamentos"]);
// Seis: adimplência (falta o pago), recuperação histórica, curvas, as duas
// projeções e os fluxos da classe sênior — todos encostados nos recebimentos.
const semDado = topicosSemDado(SELECAO_PADRAO, PRONTOS_HOJE);
conferir("tópicos sem dado hoje", semDado.length, 6);
conferir("fluxos da sênior entram",
  semDado.some((t) => t.slug === "fluxos_amortizacao"), true);
conferir("estoque não entra", semDado.some((t) => t.slug === "estoque"), false);
conferir("adimplência entra (falta o pago)",
  semDado.some((t) => t.slug === "adimplencia"), true);
conferir("curvas entram", semDado.some((t) => t.slug === "curvas_recuperacao"), true);
// Texto institucional e campo manual não dependem de importação nenhuma.
conferir("term-sheet não depende de importação",
  semDado.some((t) => t.slug === "term_sheet"), false);
conferir("disclaimer não depende de importação",
  semDado.some((t) => t.slug === "disclaimer"), false);
// Com tudo importado, nada fica pendente.
conferir("nada pendente com a base completa",
  topicosSemDado(SELECAO_PADRAO,
    new Set(["estoque", "lancamentos", "recebimentos", "recebimentos_da"])).length,
  0);

// Todo código em `exige` tem de ser um dos que sada_vw_deb_prontidao devolve;
// um código digitado errado viraria um "sem dado" que nunca se resolve.
const CODIGOS_DA_PRONTIDAO = new Set([
  "estoque", "lancamentos", "recebimentos", "recebimentos_da",
  "categoria", "coluna_constante",
]);
conferir("exigências batem com a view",
  TOPICOS.flatMap((t) => t.exige ?? []).every((e) => CODIGOS_DA_PRONTIDAO.has(e)),
  true);

conferir("mapa por slug cobre o catálogo", TOPICO_POR_SLUG.size, TOPICOS.length);

if (falhas > 0) {
  console.error(`\n${falhas} divergência(s).`);
  process.exit(1);
}
console.log(
  `OK — ${TOPICOS.length} tópicos em ${SECOES.length} seções, 20 páginas com tudo ` +
    "marcado: divisórias, ordem e exigências conferem.",
);

/**
 * SADA · Debênture — catálogo de tópicos do documento.
 *
 * O catálogo mora NO CÓDIGO, e não no banco, de propósito: ele descreve a
 * estrutura do documento, e cada tópico só existe de verdade quando houver um
 * componente que saiba desenhá-lo. Uma linha de tabela prometendo um tópico
 * que ninguém renderiza vira página em branco no material do investidor.
 *
 * O que vai para o banco é só a ESCOLHA — quais tópicos, em que ordem, para
 * qual ente. Ver supabase/sada-deb-modelo.sql.
 *
 * Os números de página são os do documento-modelo (20251216_SDA001), para
 * quem conferir um contra o outro.
 */

export type SecaoId =
  | "capa"
  | "sumario_executivo"
  | "analise_retrospectiva"
  | "fluxo_projetado"
  | "term_sheet"
  | "encerramento";

export interface Secao {
  id: SecaoId;
  titulo: string;
  /** Texto da página divisória; nulo onde a seção não tem uma. */
  divisoria: string | null;
}

/**
 * As divisórias são páginas inteiras de cor sólida no documento-modelo, e
 * NÃO são tópicos selecionáveis: elas aparecem sozinhas quando a seção tem
 * ao menos um tópico escolhido, e somem junto com ela. Deixá-las na lista
 * permitiria montar um documento com a capa de uma seção vazia.
 */
export const SECOES: Secao[] = [
  { id: "capa", titulo: "Abertura", divisoria: null },
  { id: "sumario_executivo", titulo: "Sumário executivo", divisoria: "SUMÁRIO EXECUTIVO" },
  { id: "analise_retrospectiva", titulo: "Análise retrospectiva", divisoria: "ANÁLISE RETROSPECTIVA" },
  { id: "fluxo_projetado", titulo: "Fluxo de recuperação projetado", divisoria: "FLUXO DE RECUPERAÇÃO PROJETADO" },
  { id: "term_sheet", titulo: "Term-sheet", divisoria: "TERM-SHEET" },
  { id: "encerramento", titulo: "Encerramento", divisoria: null },
];

/**
 * De onde sai o conteúdo de cada tópico. Muda o que a tela cobra de quem
 * monta: dado de ente que falta se pede ao ente; campo manual se digita.
 */
export type Fonte =
  /** Sai pronto da base importada do ente. */
  | "banco"
  /** Sai da base, mas passa por premissa que alguém escolhe (onda 2). */
  | "banco_premissa"
  /** Digitado: term-sheet, pipeline, indicadores da estrutura. */
  | "manual"
  /** Texto institucional reaproveitado entre operações. */
  | "catalogo"
  /** Montado pelo sistema a partir do que foi selecionado. */
  | "automatico";

export const ROTULO_FONTE: Record<Fonte, string> = {
  banco: "dados do ente",
  banco_premissa: "dados do ente + premissa",
  manual: "preenchido à mão",
  catalogo: "texto institucional",
  automatico: "montado pelo sistema",
};

export interface Topico {
  slug: string;
  titulo: string;
  secao: SecaoId;
  /** Páginas correspondentes no documento-modelo. */
  paginas: number[];
  fonte: Fonte;
  /**
   * Não pode ser desmarcado. Capa e disclaimer: um material de investidor sem
   * identificação da operação ou sem aviso legal não deveria sair da máquina.
   */
  obrigatorio?: boolean;
  /**
   * Códigos de `sada_vw_deb_prontidao` de que este tópico depende. A tela usa
   * para avisar que o tópico sairia vazio — e para não marcá-lo sozinho.
   */
  exige?: string[];
  descricao: string;
}

export const TOPICOS: Topico[] = [
  {
    slug: "capa",
    titulo: "Capa",
    secao: "capa",
    paginas: [1],
    fonte: "automatico",
    obrigatorio: true,
    descricao:
      "Ente, objeto da operação e mês de referência. Monta-se do cadastro do cliente.",
  },
  {
    slug: "entendimento",
    titulo: "Entendimento inicial e perspectivas",
    secao: "sumario_executivo",
    paginas: [3, 4],
    fonte: "catalogo",
    descricao:
      "O modelo de negócios, a LC 208/2024 e o escopo do trabalho. Duas páginas de texto que mudam pouco entre operações.",
  },
  {
    slug: "operacoes_similares",
    titulo: "Operações similares e classificação de risco",
    secao: "sumario_executivo",
    paginas: [5],
    fonte: "catalogo",
    descricao:
      "Linha do tempo com CPSEC, Contagem Sec, PBH Ativos, CADIP, MGI e COPISEC, com valor emitido e rating de cada uma.",
  },
  {
    slug: "estrutura_operacao",
    titulo: "Estrutura da operação",
    secao: "sumario_executivo",
    paginas: [6],
    fonte: "catalogo",
    descricao:
      "Diagrama da cessão: fundo especial, securitizadora, classes de debênture e as contas de recuperação e resultado.",
  },
  {
    slug: "termos_referencia",
    titulo: "Termos e condições de uma operação de referência",
    secao: "sumario_executivo",
    paginas: [7],
    fonte: "catalogo",
    descricao:
      "Quadro de termos de uma emissão já feita, para comparação. No modelo é a COPISEC, do Estado do Piauí.",
  },
  {
    slug: "adimplencia",
    titulo: "Lançamentos, adimplência e inscrição em dívida ativa",
    secao: "analise_retrospectiva",
    paginas: [9],
    fonte: "banco",
    exige: ["lancamentos", "recebimentos"],
    descricao:
      "Tributos cobrados e pagos por exercício e categoria, e a taxa de inadimplência que resulta deles.",
  },
  {
    slug: "estoque",
    titulo: "Estoque da dívida ativa",
    secao: "analise_retrospectiva",
    paginas: [10],
    fonte: "banco",
    exige: ["estoque"],
    descricao:
      "Quadro resumo (valor, devedores, ticket médio, concentração) e o estoque aberto por safra, por categoria e por designação.",
  },
  {
    slug: "recuperacao_historica",
    titulo: "Histórico de recuperação",
    secao: "analise_retrospectiva",
    paginas: [11],
    fonte: "banco",
    exige: ["recebimentos_da"],
    descricao:
      "Valor recuperado por safra, por tipo e por categoria, ano a ano.",
  },
  {
    slug: "curvas_recuperacao",
    titulo: "Curvas de recuperação",
    secao: "analise_retrospectiva",
    paginas: [12],
    fonte: "banco",
    exige: ["recebimentos_da"],
    descricao:
      "Matriz safra × ano com a recuperação acumulada, separada entre imobiliário e mobiliário. É a base das projeções.",
  },
  {
    slug: "projecao_agente",
    titulo: "Recuperação estimada pelo agente de cobrança",
    secao: "fluxo_projetado",
    paginas: [14],
    fonte: "banco_premissa",
    exige: ["recebimentos_da"],
    descricao:
      "Projeção a partir da recuperação potencial informada pelo agente de cobrança, descontado o já recuperado.",
  },
  {
    slug: "projecao_ponderada",
    titulo: "Recuperação estimada ponderada",
    secao: "fluxo_projetado",
    paginas: [15],
    fonte: "banco_premissa",
    exige: ["recebimentos_da"],
    descricao:
      "Mesma projeção, com a recuperação potencial ponderada entre a curva histórica do ente e a expectativa do agente.",
  },
  {
    slug: "term_sheet",
    titulo: "Term-sheet",
    secao: "term_sheet",
    paginas: [17],
    fonte: "manual",
    descricao:
      "Instrumento, lastro, garantias, classes e remuneração, prazo e cascata de pagamento.",
  },
  {
    slug: "fluxos_amortizacao",
    titulo: "Fluxos projetados e amortização",
    secao: "term_sheet",
    paginas: [18],
    fonte: "manual",
    exige: ["recebimentos_da"],
    descricao:
      "Fluxo contra as obrigações da classe sênior, com cash sweep, subordinação, duration e razão de garantia.",
  },
  {
    slug: "pipeline",
    titulo: "Pipeline",
    secao: "term_sheet",
    paginas: [19],
    fonte: "manual",
    descricao:
      "Carteira de operações em contratação e em execução, com emissão sênior estimada por ente.",
  },
  {
    slug: "disclaimer",
    titulo: "Disclaimer",
    secao: "encerramento",
    paginas: [20],
    fonte: "catalogo",
    obrigatorio: true,
    descricao:
      "Aviso legal: natureza informativa, declarações prospectivas, riscos e confidencialidade.",
  },
];

export const TOPICO_POR_SLUG = new Map(TOPICOS.map((t) => [t.slug, t]));

/** Slugs que não podem ficar de fora, na ordem do catálogo. */
export const OBRIGATORIOS = TOPICOS.filter((t) => t.obrigatorio).map((t) => t.slug);

/** Seleção inicial: tudo, na ordem do documento-modelo. */
export const SELECAO_PADRAO = TOPICOS.map((t) => t.slug);

/**
 * Limpa uma seleção vinda do banco ou da tela.
 *
 * Tira slug desconhecido (tópico removido do catálogo depois do modelo ter
 * sido salvo), tira repetido e devolve os obrigatórios que faltarem. Sem
 * isso, um modelo salvo há meses derrubaria a montagem ao ser aberto.
 */
export function normalizarSelecao(slugs: unknown): string[] {
  const bruta = Array.isArray(slugs) ? slugs : [];
  const vistos = new Set<string>();
  const limpa: string[] = [];
  for (const s of bruta) {
    const slug = String(s);
    if (!TOPICO_POR_SLUG.has(slug) || vistos.has(slug)) continue;
    vistos.add(slug);
    limpa.push(slug);
  }
  for (const slug of OBRIGATORIOS) {
    if (!vistos.has(slug)) limpa.push(slug);
  }
  // A ordem dentro da seção é de quem montou; a ORDEM DAS SEÇÕES não é
  // negociável — sumário executivo antes da análise, term-sheet depois dela.
  // Um documento com o disclaimer no meio não seria um documento.
  return limpa.sort((a, b) => indiceSecao(a) - indiceSecao(b));
}

function indiceSecao(slug: string): number {
  const t = TOPICO_POR_SLUG.get(slug);
  return t ? SECOES.findIndex((s) => s.id === t.secao) : SECOES.length;
}

export interface ItemMontado {
  tipo: "divisoria" | "topico";
  /** Da divisória, o texto; do tópico, o título. */
  titulo: string;
  secao: SecaoId;
  slug?: string;
  paginas: number;
}

/**
 * Monta o sumário do documento a partir da seleção: insere a divisória de
 * cada seção que tiver ao menos um tópico e conta as páginas.
 *
 * É o que a tela mostra como pré-visualização — e, na onda 5, a mesma função
 * dita a ordem de render. Uma só, para a prévia não poder mentir.
 */
export function montarSumario(selecao: string[]): ItemMontado[] {
  const escolhidos = new Set(selecao);
  const itens: ItemMontado[] = [];
  for (const secao of SECOES) {
    const daSecao = TOPICOS.filter((t) => t.secao === secao.id && escolhidos.has(t.slug));
    if (daSecao.length === 0) continue;
    if (secao.divisoria) {
      itens.push({ tipo: "divisoria", titulo: secao.divisoria, secao: secao.id, paginas: 1 });
    }
    // A ordem dentro da seção vem da seleção, não do catálogo: é ela que o
    // usuário reordena com as setas.
    const ordem = selecao.filter((s) => daSecao.some((t) => t.slug === s));
    for (const slug of ordem) {
      const t = TOPICO_POR_SLUG.get(slug)!;
      itens.push({
        tipo: "topico",
        titulo: t.titulo,
        secao: t.secao,
        slug: t.slug,
        paginas: t.paginas.length,
      });
    }
  }
  return itens;
}

export function contarPaginas(selecao: string[]): number {
  return montarSumario(selecao).reduce((s, i) => s + i.paginas, 0);
}

/**
 * Tópicos escolhidos cujo dado o ente ainda não mandou.
 *
 * `prontos` são os códigos atendidos em `sada_vw_deb_prontidao`. Tópico sem
 * `exige` nunca entra aqui: texto institucional e campo manual não dependem
 * de importação.
 */
export function topicosSemDado(selecao: string[], prontos: Set<string>): Topico[] {
  return selecao
    .map((s) => TOPICO_POR_SLUG.get(s))
    .filter((t): t is Topico => !!t?.exige?.some((e) => !prontos.has(e)));
}

/** Um modelo de documento salvo — a seleção, com nome. */
export interface ModeloDocumento {
  id: number;
  cnpjOrgao: string | null;
  nome: string;
  topicos: string[];
  padrao: boolean;
  atualizadoEm: string | null;
}

/**
 * SADA · categoria do tributo e prontidão dos dados para o InfoPack.
 *
 * O documento de emissão de debênture segmenta a carteira inteira em três
 * categorias — é o eixo de quase todo gráfico dele. O SADA só conhece a sigla
 * que o ente mandou ("ISS VARIAV GISS", "TOMAD/O.PUB GIS"), então a categoria
 * é uma camada de classificação por cima, parte chutada e parte decidida.
 *
 * Ver supabase/sada-deb-categoria-e-coortes.sql para o lado do banco.
 */

export type Categoria = "imobiliario" | "mobiliario" | "nao_estabelecido";

/**
 * De onde veio a classificação de uma sigla, da mais forte para a mais fraca.
 * A tela mostra isto porque "heuristica" é chute e as outras duas são decisão
 * de alguém — e só o chute precisa ser revisado antes de virar documento.
 */
export type OrigemCategoria = "ente" | "global" | "heuristica";

export const CATEGORIAS: { valor: Categoria; rotulo: string; descricao: string }[] = [
  {
    valor: "imobiliario",
    rotulo: "Imobiliário",
    descricao: "IPTU, ITBI, contribuição de melhoria — o que incide sobre o imóvel.",
  },
  {
    valor: "mobiliario",
    rotulo: "Mobiliário",
    descricao: "ISS, taxas de licença e alvará, vigilância sanitária — o que incide sobre a atividade.",
  },
  {
    valor: "nao_estabelecido",
    rotulo: "Não estabelecido",
    descricao: "Demais receitas: multas contratuais, ressarcimentos, preços públicos.",
  },
];

export const ROTULO_CATEGORIA: Record<Categoria, string> = {
  imobiliario: "Imobiliário",
  mobiliario: "Mobiliário",
  nao_estabelecido: "Não estabelecido",
};

export const ROTULO_ORIGEM: Record<OrigemCategoria, string> = {
  ente: "definida para este ente",
  global: "definida para todos os entes",
  heuristica: "chute pelo nome",
};

/**
 * Cores dos gráficos por categoria, na paleta da marca: dourado, preto quente
 * e cinza — as mesmas três de `--primaria`, `--escuro` e `--cinza` do
 * globals.css. Valores fixos, e não variáveis CSS, porque o documento é
 * impresso e exportado: ali não há tema claro nem escuro para seguir.
 */
export const COR_CATEGORIA: Record<Categoria, string> = {
  imobiliario: "#c9a227",
  mobiliario: "#14120d",
  nao_estabelecido: "#667085",
};

export function ehCategoria(v: unknown): v is Categoria {
  return v === "imobiliario" || v === "mobiliario" || v === "nao_estabelecido";
}

/** Uma sigla do lote vigente, com a categoria já resolvida pelo banco. */
export interface SiglaCategoria {
  cnpjOrgao: string;
  sigla: string;
  categoria: Categoria;
  origem: OrigemCategoria;
  /** Títulos e principal em dívida ativa — o peso da decisão, em reais. */
  titulosDa: number;
  principalDa: number;
  titulosLanc: number;
  titulosRec: number;
}

/**
 * Uma exigência de dado do documento e se ela está atendida.
 *
 * Existe para a tela dizer "peça o arquivo X ao ente" em vez de desenhar um
 * gráfico vazio — que, num material de investidor, se lê como "esta carteira
 * nunca recuperou nada".
 */
export interface Exigencia {
  codigo: string;
  pronto: boolean;
  exigencia: string;
  detalhe: string;
}

/** Quadro resumo do estoque: os números do alto da página de carteira. */
export interface ResumoEstoque {
  cnpjOrgao: string;
  titulos: number;
  principal: number;
  correcao: number;
  juros: number;
  multa: number;
  total: number;
  safraMin: number | null;
  safraMax: number | null;
  devedores: number;
  ticketMedio: number | null;
  ticketMedioSemTop10: number | null;
  concentracaoTop10: number | null;
}

/**
 * Soma o estoque por categoria, juntando o inventário de siglas com a
 * classificação. Fica no cliente e não no banco de propósito: a categoria é
 * editável, e materializá-la obrigaria a um refresh de ~20 s por clique.
 */
export function somarPorCategoria(
  siglas: SiglaCategoria[],
): { categoria: Categoria; siglas: number; titulos: number; principal: number; pct: number }[] {
  const mapa = new Map<Categoria, { siglas: number; titulos: number; principal: number }>();
  for (const s of siglas) {
    const cur = mapa.get(s.categoria) ?? { siglas: 0, titulos: 0, principal: 0 };
    cur.siglas += 1;
    cur.titulos += s.titulosDa;
    cur.principal += s.principalDa;
    mapa.set(s.categoria, cur);
  }
  const total = [...mapa.values()].reduce((s, v) => s + v.principal, 0);
  return CATEGORIAS.map(({ valor }) => {
    const v = mapa.get(valor) ?? { siglas: 0, titulos: 0, principal: 0 };
    return {
      categoria: valor,
      ...v,
      pct: total > 0 ? (100 * v.principal) / total : 0,
    };
  });
}

/**
 * Siglas que ainda estão no chute e pesam o bastante para mudar o documento.
 *
 * O corte em reais — e não em quantidade — é o que importa: 50 mil títulos de
 * R$ 5 mexem menos na segmentação do que um único de R$ 6 milhões.
 */
export function pendentesDeDecisao(
  siglas: SiglaCategoria[],
  minimoReais = 100_000,
): SiglaCategoria[] {
  return siglas
    .filter((s) => s.origem === "heuristica" && s.principalDa >= minimoReais)
    .sort((a, b) => b.principalDa - a.principalDa);
}

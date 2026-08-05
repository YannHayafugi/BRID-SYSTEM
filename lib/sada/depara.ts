/**
 * SADA · DE/PARA — tradução entre a planilha que o ente manda e as colunas
 * das tabelas sada_*. Isomórfico: o navegador usa para converter a planilha,
 * o servidor para validar o mapa antes de gravar.
 *
 * O importador antigo lia por posição fixa (`mapearLinha` em ./import). Aqui
 * a leitura passa a ser declarada: o mapa diz, para cada campo de destino, de
 * onde o valor sai. Sem mapa cadastrado o importador usa MAPA_PADRAO, que
 * reproduz exatamente o layout posicional histórico — ente antigo não quebra.
 */
import { TipoSada } from "./import";

// =====================================================================
// Tipos
// =====================================================================

/** Tipo natural do campo de destino — define a conversão quando o mapa não
 *  declara um `transform` explícito. */
export type TipoDado = "texto" | "int" | "num" | "data";

/**
 * Conversões disponíveis. `data_mes` e `data_ano` existem porque vários entes
 * mandam uma única coluna de data onde o destino tem mes_/ano_ separados —
 * duas regras apontam para a MESMA coluna de origem com transforms diferentes.
 *
 * Novos transforms entram aqui e em `converter()` sem migração de banco: o
 * mapa guarda o nome como string.
 */
export type Transform = "texto" | "int" | "num" | "data" | "data_mes" | "data_ano";

/** De onde sai o valor de um campo de destino. */
export type RegraMapa =
  | { origem: string | number; transform?: Transform }
  | { constante: string | number | null };

/** campo de destino -> regra. Campo ausente do mapa entra como null. */
export type Mapa = Record<string, RegraMapa>;

export type AbasModo = "ano_no_nome" | "abas_escolhidas";

export interface AbaEscolhida {
  nome: string;
  ano: number;
}

export interface DeParaSalvo {
  cnpj_orgao: string;
  tipo: TipoSada;
  abas_modo: AbasModo;
  abas: AbaEscolhida[] | null;
  mapa: Mapa;
  observacao?: string | null;
}

export function ehConstante(r: RegraMapa): r is { constante: string | number | null } {
  return Object.prototype.hasOwnProperty.call(r, "constante");
}

// =====================================================================
// Catálogo de campos de destino
//
// `sinonimos` alimenta a auto-detecção pelo cabeçalho. São palpites: até
// termos planilhas reais de clientes diferentes, a lista tende a errar e o
// usuário corrige na tela. Ampliar aqui é o ajuste mais barato do módulo.
// =====================================================================

export interface CampoDestino {
  campo: string;
  rotulo: string;
  tipo: TipoDado;
  /** Sem ele a importação não faz sentido — bloqueia o salvamento do mapa. */
  obrigatorio?: boolean;
  /** Não bloqueia, mas a tela avisa quando fica sem origem. */
  recomendado?: boolean;
  sinonimos: string[];
}

const CHAVE: CampoDestino = {
  campo: "sequencia",
  rotulo: "Sequência (chave que liga as tabelas)",
  tipo: "int",
  recomendado: true,
  sinonimos: ["sequencia", "seq", "nrsequencia", "numsequencia", "idtitulo", "codigo", "nrtitulo"],
};

const IDENTIFICACAO: CampoDestino[] = [
  CHAVE,
  {
    campo: "sigla",
    rotulo: "Sigla do tributo",
    tipo: "texto",
    obrigatorio: true,
    sinonimos: ["sigla", "tributo", "codtributo", "receita", "codreceita", "especie", "abreviatura"],
  },
  {
    campo: "inscricao",
    rotulo: "Inscrição",
    tipo: "texto",
    sinonimos: ["inscricao", "inscricaoimobiliaria", "inscricaocadastral", "cadastro", "matricula", "imovel"],
  },
  {
    campo: "cnpj_cpf",
    rotulo: "CNPJ/CPF do contribuinte",
    tipo: "texto",
    sinonimos: ["cnpjcpf", "cpfcnpj", "cnpj", "cpf", "documento", "doc", "contribuinte", "nrdocumento"],
  },
  {
    campo: "descricao",
    rotulo: "Descrição",
    tipo: "texto",
    sinonimos: ["descricao", "historico", "complemento", "observacao", "nome", "razaosocial"],
  },
  {
    campo: "fase",
    rotulo: "Fase / situação",
    tipo: "texto",
    sinonimos: ["fase", "situacao", "status", "estagio", "etapa"],
  },
];

const VENCIMENTO: CampoDestino[] = [
  {
    campo: "mes_venc",
    rotulo: "Mês de vencimento",
    tipo: "int",
    sinonimos: ["mesvenc", "mesvencimento", "mesven", "mesvcto"],
  },
  {
    campo: "ano_venc",
    rotulo: "Ano de vencimento",
    tipo: "int",
    sinonimos: ["anovenc", "anovencimento", "anoven", "anovcto", "exerciciovenc"],
  },
];

const VALORES_RECEBIMENTO: CampoDestino[] = [
  { campo: "valor", rotulo: "Valor principal", tipo: "num", sinonimos: ["valor", "vlprincipal", "principal", "vloriginal", "vlr"] },
  { campo: "vlam", rotulo: "Atualização monetária (VLAM)", tipo: "num", sinonimos: ["vlam", "atualizacao", "correcao", "atualizacaomonetaria"] },
  { campo: "vljm", rotulo: "Juros de mora (VLJM)", tipo: "num", sinonimos: ["vljm", "juros", "jurosmora"] },
  { campo: "vlmm", rotulo: "Multa de mora (VLMM)", tipo: "num", sinonimos: ["vlmm", "multa", "multamora"] },
  { campo: "vldesc", rotulo: "Desconto", tipo: "num", sinonimos: ["vldesc", "desconto", "vldesconto"] },
  { campo: "vlel", rotulo: "VLEL", tipo: "num", sinonimos: ["vlel"] },
  {
    campo: "totaldam",
    rotulo: "Total do DAM",
    tipo: "num",
    obrigatorio: true,
    sinonimos: ["totaldam", "total", "vltotal", "valortotal", "vlpago", "totalpago"],
  },
  { campo: "mes_arrec", rotulo: "Mês da arrecadação", tipo: "int", sinonimos: ["mesarrec", "mesarrecadacao", "mespagto", "mespagamento"] },
  { campo: "ano_arrec", rotulo: "Ano da arrecadação", tipo: "int", sinonimos: ["anoarrec", "anoarrecadacao", "anopagto", "anopagamento", "exercicioarrec"] },
];

export const CAMPOS_DESTINO: Record<TipoSada, CampoDestino[]> = {
  divida_ativa: [
    ...IDENTIFICACAO,
    ...VENCIMENTO,
    { campo: "valor", rotulo: "Valor principal", tipo: "num", obrigatorio: true, sinonimos: ["valor", "vlprincipal", "principal", "vloriginal", "vlr"] },
    { campo: "atualizacao", rotulo: "Atualização monetária", tipo: "num", sinonimos: ["atualizacao", "correcao", "vlam", "atualizacaomonetaria"] },
    { campo: "juros", rotulo: "Juros", tipo: "num", sinonimos: ["juros", "vljm", "jurosmora"] },
    { campo: "multa", rotulo: "Multa", tipo: "num", sinonimos: ["multa", "vlmm", "multamora"] },
    { campo: "total", rotulo: "Total", tipo: "num", sinonimos: ["total", "vltotal", "valortotal", "totalgeral"] },
  ],
  lancamentos: [
    ...IDENTIFICACAO,
    { campo: "mes_lancto", rotulo: "Mês do lançamento", tipo: "int", sinonimos: ["meslancto", "meslancamento", "mes"] },
    { campo: "exercicio", rotulo: "Exercício", tipo: "int", sinonimos: ["exercicio", "anoexercicio", "ano", "competencia"] },
    { campo: "valor", rotulo: "Valor do lançamento", tipo: "num", obrigatorio: true, sinonimos: ["valor", "vlr", "vllancado", "vllancamento"] },
  ],
  recebimentos: [
    ...IDENTIFICACAO,
    { campo: "data_contrato", rotulo: "Data do contrato", tipo: "texto", sinonimos: ["datacontrato", "dtcontrato", "contrato"] },
    ...VENCIMENTO,
    ...VALORES_RECEBIMENTO,
  ],
  recebimentos_da: [
    ...IDENTIFICACAO,
    { campo: "data_contrato", rotulo: "Data do contrato", tipo: "texto", sinonimos: ["datacontrato", "dtcontrato", "contrato"] },
    ...VENCIMENTO,
    ...VALORES_RECEBIMENTO,
  ],
};

// =====================================================================
// Conversões
// =====================================================================

/** Marcas de acento decompostas pelo NFD (U+0300–U+036F). */
const ACENTOS = new RegExp("[\u0300-\u036f]", "g");

/** Normaliza cabeçalho para comparação: minúsculo, sem acento, só alfanumérico. */
export function normalizar(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(ACENTOS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Chave de comparação do DE/PARA de valores: sem acento, maiúsculo, sem pontuação. */
export function chaveValor(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(ACENTOS, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

const NULOS = new Set(["", "NULL", "N/A", "-", "--"]);

export function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return NULOS.has(s.toUpperCase()) ? null : s;
}

/**
 * Número tolerante ao formato de origem. Aceita "260.01" (o formato que os
 * arquivos atuais usam), "1.234,56" (pt-BR), "1234,56" e "(1.234,56)" como
 * negativo contábil. A detecção é por conteúdo, então o usuário não precisa
 * declarar o formato no mapa.
 */
export function numero(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (NULOS.has(s.toUpperCase())) return null;

  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/\s/g, "").replace(/r\$/i, "");
  if (s.startsWith("-")) {
    negativo = true;
    s = s.slice(1);
  }

  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  if (temVirgula && temPonto) {
    // o separador decimal é o que aparece por último
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (temVirgula) {
    s = s.replace(",", ".");
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

export function inteiro(v: unknown): number | null {
  const n = numero(v);
  return n === null ? null : Math.trunc(n);
}

export interface DataPartes {
  ano: number;
  mes: number;
  dia: number;
}

/** Serial do Excel: dias desde 1899-12-30 (o "bug" de 1900 já embutido). */
function serialExcel(n: number): DataPartes | null {
  if (n < 1 || n > 60000) return null;
  const ms = Math.round((n - 25569) * 86400000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
}

/** Aceita aaaa-mm-dd, dd/mm/aaaa, dd-mm-aa e serial do Excel. */
export function parseData(v: unknown): DataPartes | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return serialExcel(v);

  const s = String(v).trim();
  if (NULOS.has(s.toUpperCase())) return null;

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return { ano: +m[1], mes: +m[2], dia: +m[3] };

  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s);
  if (m) {
    let ano = +m[3];
    if (ano < 100) ano += ano < 50 ? 2000 : 1900;
    return { ano, mes: +m[2], dia: +m[1] };
  }

  // planilha pode trazer só o serial como string
  if (/^\d+(\.\d+)?$/.test(s)) return serialExcel(Number(s));
  return null;
}

function iso(d: DataPartes): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.ano}-${p(d.mes)}-${p(d.dia)}`;
}

/** Aplica o transform. `data` devolve ISO (aaaa-mm-dd), que o Postgres aceita
 *  sem depender do DateStyle da sessão. */
export function converter(v: unknown, t: Transform): unknown {
  switch (t) {
    case "int": return inteiro(v);
    case "num": return numero(v);
    case "data": { const d = parseData(v); return d ? iso(d) : null; }
    case "data_mes": { const d = parseData(v); return d ? d.mes : null; }
    case "data_ano": { const d = parseData(v); return d ? d.ano : null; }
    default: return texto(v);
  }
}

const TRANSFORM_PADRAO: Record<TipoDado, Transform> = {
  texto: "texto",
  int: "int",
  num: "num",
  data: "data",
};

// =====================================================================
// Mapa padrão (layout posicional histórico)
//
// Reproduz `mapearLinha` de ./import campo a campo, inclusive tratando
// data_contrato como texto puro. É o fallback de quem nunca cadastrou
// DE/PARA — trocar o comportamento aqui altera importações que hoje funcionam.
// =====================================================================

function posicional(campos: string[]): Mapa {
  const m: Mapa = {};
  campos.forEach((c, i) => { m[c] = { origem: i }; });
  return m;
}

const COLUNAS_RECEBIMENTO = [
  "sequencia", "sigla", "inscricao", "cnpj_cpf", "descricao", "fase", "data_contrato",
  "mes_venc", "ano_venc", "valor", "vlam", "vljm", "vlmm", "vldesc", "vlel",
  "totaldam", "mes_arrec", "ano_arrec",
];

export const MAPA_PADRAO: Record<TipoSada, Mapa> = {
  divida_ativa: posicional([
    "sequencia", "sigla", "inscricao", "cnpj_cpf", "descricao", "fase",
    "mes_venc", "ano_venc", "valor", "atualizacao", "juros", "multa", "total",
  ]),
  lancamentos: posicional([
    "sequencia", "sigla", "inscricao", "cnpj_cpf", "descricao", "fase",
    "mes_lancto", "exercicio", "valor",
  ]),
  recebimentos: posicional(COLUNAS_RECEBIMENTO),
  recebimentos_da: posicional(COLUNAS_RECEBIMENTO),
};

// =====================================================================
// Compilação — o mapa vira uma função por linha
//
// A planilha pode ter centenas de milhares de linhas, então a resolução
// origem->índice acontece UMA vez, aqui, e não a cada célula.
// =====================================================================

export interface MapaCompilado {
  aplicar(linha: unknown[]): Record<string, unknown>;
  /** Campos obrigatórios cuja origem não existe no cabeçalho. */
  faltando: string[];
  /** Origens declaradas no mapa que não foram achadas na planilha. */
  origensAusentes: string[];
  /** Campos recomendados sem origem (ex.: sequencia) — só avisa. */
  semRecomendado: string[];
}

/** nome normalizado da coluna -> índice. Primeira ocorrência vence. */
export function indexarCabecalho(cabecalho: unknown[]): Map<string, number> {
  const idx = new Map<string, number>();
  cabecalho.forEach((c, i) => {
    const k = normalizar(c);
    if (k && !idx.has(k)) idx.set(k, i);
  });
  return idx;
}

export function compilarMapa(
  tipo: TipoSada,
  mapa: Mapa,
  cabecalho: unknown[],
): MapaCompilado {
  const idx = indexarCabecalho(cabecalho);
  const campos = CAMPOS_DESTINO[tipo];
  const porNome = new Map(campos.map((c) => [c.campo, c]));

  type Passo = { campo: string; ler: (l: unknown[]) => unknown };
  const passos: Passo[] = [];
  const faltando: string[] = [];
  const origensAusentes: string[] = [];
  const semRecomendado: string[] = [];

  for (const def of campos) {
    const regra = mapa[def.campo];
    if (!regra) {
      if (def.obrigatorio) faltando.push(def.campo);
      else if (def.recomendado) semRecomendado.push(def.campo);
      continue;
    }

    if (ehConstante(regra)) {
      const t = TRANSFORM_PADRAO[def.tipo];
      const valor = converter(regra.constante, t);
      passos.push({ campo: def.campo, ler: () => valor });
      continue;
    }

    const pos = typeof regra.origem === "number"
      ? regra.origem
      : idx.get(normalizar(regra.origem)) ?? -1;

    if (pos < 0) {
      origensAusentes.push(String(regra.origem));
      if (def.obrigatorio) faltando.push(def.campo);
      else if (def.recomendado) semRecomendado.push(def.campo);
      continue;
    }

    const t = regra.transform ?? TRANSFORM_PADRAO[def.tipo];
    passos.push({ campo: def.campo, ler: (l) => converter(l[pos], t) });
  }

  // Campos do mapa que não pertencem ao tipo — ignorados, mas vale sinalizar.
  for (const campo of Object.keys(mapa)) {
    if (!porNome.has(campo)) origensAusentes.push(`campo desconhecido: ${campo}`);
  }

  return {
    faltando,
    origensAusentes,
    semRecomendado,
    aplicar(linha: unknown[]) {
      const out: Record<string, unknown> = {};
      for (const p of passos) out[p.campo] = p.ler(linha);
      return out;
    },
  };
}

// =====================================================================
// DE/PARA de valores (sigla, fase)
// =====================================================================

export type CampoValor = "sigla" | "fase";

export interface ParValor {
  campo: CampoValor;
  valor_origem: string;
  valor_canonico: string;
}

export interface TabelaValores {
  aplicar(campo: CampoValor, valor: unknown): unknown;
}

/** Indexa os pares por (campo, valor normalizado). Valor sem par passa direto. */
export function compilarValores(pares: ParValor[]): TabelaValores {
  const idx = new Map<string, string>();
  for (const p of pares) idx.set(`${p.campo}\u0000${chaveValor(p.valor_origem)}`, p.valor_canonico);
  return {
    aplicar(campo, valor) {
      if (valor === null || valor === undefined) return valor;
      return idx.get(`${campo}\u0000${chaveValor(valor)}`) ?? valor;
    },
  };
}

/** Valores distintos encontrados na planilha para um campo — alimenta a tela
 *  de DE/PARA de valores, que precisa listar o que o ente realmente usa. */
export function valoresDistintos(
  registros: Record<string, unknown>[],
  campo: CampoValor,
  limite = 200,
): string[] {
  const vistos = new Set<string>();
  for (const r of registros) {
    const v = r[campo];
    if (v === null || v === undefined || String(v).trim() === "") continue;
    vistos.add(String(v).trim());
    if (vistos.size >= limite) break;
  }
  return Array.from(vistos).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// =====================================================================
// Auto-detecção
// =====================================================================

/** Coeficiente de Dice sobre bigramas — 1 = idêntico. */
function similaridade(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigramas = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const ma = bigramas(a), mb = bigramas(b);
  let comuns = 0;
  for (const [g, n] of ma) comuns += Math.min(n, mb.get(g) ?? 0);
  return (2 * comuns) / (a.length - 1 + b.length - 1);
}

const LIMIAR = 0.72;

/**
 * Sugere um mapa a partir do cabeçalho da planilha. Casa por sinônimo exato
 * primeiro; sobrando campo e coluna, tenta similaridade. Cada coluna é usada
 * no máximo uma vez, EXCETO quando dois campos mes_/ano_ apontam para a mesma
 * coluna de data — caso em que os transforms data_mes/data_ano são aplicados.
 *
 * É um chute assistido: a tela existe para o usuário revisar antes de salvar.
 */
export function sugerirMapa(tipo: TipoSada, cabecalho: unknown[]): Mapa {
  const campos = CAMPOS_DESTINO[tipo];
  const colunas = cabecalho.map((c, i) => ({ i, bruto: String(c ?? "").trim(), norm: normalizar(c) }))
    .filter((c) => c.norm !== "");
  const usadas = new Set<number>();
  const mapa: Mapa = {};

  // 1) sinônimo exato
  for (const def of campos) {
    const alvo = new Set([normalizar(def.campo), ...def.sinonimos.map(normalizar)]);
    const achou = colunas.find((c) => !usadas.has(c.i) && alvo.has(c.norm));
    if (achou) {
      mapa[def.campo] = { origem: achou.bruto };
      usadas.add(achou.i);
    }
  }

  // 2) par mes_/ano_ alimentado por UMA coluna de data.
  //
  // Roda ANTES da similaridade de propósito: "Data Vencimento" normaliza para
  // "datavencimento", que é parecido demais com o sinônimo "mesvencimento" —
  // a similaridade consumia a coluna para mes_venc e deixava ano_venc órfão,
  // sem transform nenhum. Resolvendo o par primeiro, a coluna de data já sai
  // daqui marcada como usada e com os dois transforms corretos.
  const PARES: [string, string, string[]][] = [
    ["mes_venc", "ano_venc", ["datavencimento", "dtvencimento", "vencimento", "dtvenc", "datavenc"]],
    ["mes_arrec", "ano_arrec", ["dataarrecadacao", "dtarrecadacao", "arrecadacao", "datapagamento", "dtpagto", "datapagto"]],
    ["mes_lancto", "exercicio", ["datalancamento", "dtlancamento", "lancamento", "datalancto"]],
  ];
  for (const [campoMes, campoAno, pistas] of PARES) {
    const temMes = campos.some((c) => c.campo === campoMes);
    const temAno = campos.some((c) => c.campo === campoAno);
    if (!temMes || !temAno) continue;
    if (mapa[campoMes] && mapa[campoAno]) continue;

    const col = colunas.find((c) => !usadas.has(c.i) &&
      (pistas.includes(c.norm) || pistas.some((p) => similaridade(p, c.norm) >= LIMIAR)));
    if (!col) continue;

    if (!mapa[campoMes]) mapa[campoMes] = { origem: col.bruto, transform: "data_mes" };
    if (!mapa[campoAno]) mapa[campoAno] = { origem: col.bruto, transform: "data_ano" };
    usadas.add(col.i);
  }

  // 3) similaridade, para o que sobrou
  for (const def of campos) {
    if (mapa[def.campo]) continue;
    const alvos = [normalizar(def.campo), ...def.sinonimos.map(normalizar)];
    let melhor: { i: number; bruto: string; score: number } | null = null;
    for (const c of colunas) {
      if (usadas.has(c.i)) continue;
      const score = Math.max(...alvos.map((a) => similaridade(a, c.norm)));
      if (score >= LIMIAR && (!melhor || score > melhor.score)) {
        melhor = { i: c.i, bruto: c.bruto, score };
      }
    }
    if (melhor) {
      mapa[def.campo] = { origem: melhor.bruto };
      usadas.add(melhor.i);
    }
  }

  return mapa;
}

// =====================================================================
// Validação (usada na tela e de novo no servidor, antes de gravar)
// =====================================================================

export interface ValidacaoMapa {
  ok: boolean;
  erros: string[];
  avisos: string[];
}

export function validarMapa(tipo: TipoSada, mapa: Mapa): ValidacaoMapa {
  const campos = CAMPOS_DESTINO[tipo];
  const porNome = new Map(campos.map((c) => [c.campo, c]));
  const erros: string[] = [];
  const avisos: string[] = [];

  for (const def of campos) {
    const r = mapa[def.campo];
    if (!r) {
      if (def.obrigatorio) erros.push(`"${def.rotulo}" é obrigatório e está sem origem.`);
      else if (def.recomendado) avisos.push(`"${def.rotulo}" ficou sem origem.`);
      continue;
    }
    if (!ehConstante(r)) {
      if (typeof r.origem === "string" && r.origem.trim() === "") {
        erros.push(`"${def.rotulo}" tem origem vazia.`);
      }
      if (typeof r.origem === "number" && (!Number.isInteger(r.origem) || r.origem < 0)) {
        erros.push(`"${def.rotulo}" tem índice de coluna inválido.`);
      }
    }
  }

  for (const campo of Object.keys(mapa)) {
    if (!porNome.has(campo)) erros.push(`Campo "${campo}" não existe em ${tipo}.`);
  }

  if (!mapa.sequencia) {
    avisos.push(
      "Sem a coluna de sequência os dados importam normalmente, mas a análise " +
      "de recuperação por título fica indisponível para este ente.",
    );
  }

  return { ok: erros.length === 0, erros, avisos };
}

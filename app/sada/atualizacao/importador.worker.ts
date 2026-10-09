/// <reference lib="webworker" />

/**
 * SADA · leitura e envio da planilha, FORA da thread da interface.
 *
 * Por que existe: `XLSX.read` é síncrono e pesado. Medido com as planilhas
 * reais de São Vicente, na mesma máquina:
 *
 *   DÍVIDA ATIVA  10,6 MB · 175 mil linhas → 19,4 s travado, ~500 MB
 *   LANÇAMENTOS   22,0 MB · 486 mil linhas → 42,7 s travado, ~750 MB
 *
 * Como o navegador tem uma thread só para JavaScript e desenho, esse tempo
 * inteiro a aba ficava congelada: sem barra de progresso, sem o texto de
 * status (que é definido antes da leitura e só aparecia no fim) e sem
 * resposta a cliques — o Chrome chegava a oferecer "fechar a página".
 *
 * Aqui dentro o tempo de processamento é o mesmo, mas a aba continua viva.
 *
 * O worker também ENVIA os lotes. Assim as linhas convertidas não precisam
 * atravessar de volta para a thread principal (serializar meio milhão de
 * objetos custaria segundos e dobraria a memória): quem sai daqui é só
 * progresso e o relatório de qualidade.
 */

import * as XLSX from "xlsx";
import {
  analisarQualidade,
  linhaVazia,
  type RelatorioQualidade,
  type TipoSada,
} from "@/lib/sada/import";
import {
  compilarMapa,
  compilarValores,
  type AbaEscolhida,
  type AbasModo,
  type Mapa,
  type MapaCompilado,
} from "@/lib/sada/depara";

export interface ConfigWorker {
  mapa: Mapa;
  abasModo: AbasModo;
  abas: AbaEscolhida[] | null;
  /** Campos obrigatórios dispensados neste mapa (sada_depara.campos_opcionais). */
  opcionais: string[];
  pares: { campo: "sigla" | "fase"; valor_origem: string; valor_canonico: string }[];
}

/** Mensagens que a tela manda. */
export type ParaWorker =
  | { acao: "analisar"; arquivo: ArrayBuffer; tipo: TipoSada; cnpj: string; cfg: ConfigWorker }
  | { acao: "enviar"; importacaoId: number; lote: number }
  | { acao: "cancelar" };

/** Mensagens que o worker devolve. */
export type DoWorker =
  | { tipo: "status"; texto: string }
  | { tipo: "progresso"; pct: number }
  | { tipo: "analise"; relatorio: RelatorioQualidade; anos: number[]; totalLinhas: number }
  | { tipo: "enviado"; total: number }
  | { tipo: "erro"; mensagem: string };

interface AbaLida {
  /** Ano da aba. Em "ano_na_coluna" é nulo: o ano vem de cada linha. */
  ano: number | null;
  nome: string;
  linhas: unknown[][];
  compilado: MapaCompilado;
}

// Estado entre as duas fases (analisar → enviar). Fica no worker de propósito:
// é o que evita devolver as linhas para a tela e trazê-las de volta.
let abas: AbaLida[] = [];
let tipoAtual: TipoSada = "divida_ativa";
let cnpjAtual = "";
let modoAtual: AbasModo = "ano_no_nome";
let valores = compilarValores([]);
let cancelado = false;

const avisar = (m: DoWorker) => (self as unknown as Worker).postMessage(m);

/** Linha crua → registro do banco, com o DE/PARA de valores aplicado. */
function traduzir(aba: AbaLida, linha: unknown[]): Record<string, unknown> {
  const reg = aba.compilado.aplicar(linha);
  if ("sigla" in reg) reg.sigla = valores.aplicar("sigla", reg.sigla);
  if ("fase" in reg) reg.fase = valores.aplicar("fase", reg.fase);
  reg.cnpj_orgao = cnpjAtual;
  // Em "ano_na_coluna" o ano ja veio do mapa, linha a linha: sobrescrever aqui
  // era justamente o que obrigava todo arquivo a ser organizado por ano.
  if (aba.ano !== null) reg.ano = aba.ano;
  return reg;
}

function analisar(msg: Extract<ParaWorker, { acao: "analisar" }>) {
  cancelado = false;
  tipoAtual = msg.tipo;
  cnpjAtual = msg.cnpj;
  modoAtual = msg.cfg.abasModo;
  valores = compilarValores(msg.cfg.pares);

  avisar({ tipo: "status", texto: "Abrindo a planilha…" });

  // `dense` guarda cada linha como array em vez de um objeto por célula: a
  // conversão para linhas cai de ~1,4 s para ~0,2 s. `cellText`/`cellNF`
  // desligam a formatação de texto que não usamos — juntos derrubam a
  // leitura da dívida ativa de 14,5 s para 10,8 s. Conferido que as linhas
  // convertidas saem IDÊNTICAS às das opções antigas (mesmo hash, nos dois
  // tipos de planilha, inclusive com datas).
  const wb = XLSX.read(msg.arquivo, {
    type: "array",
    dense: true,
    cellText: false,
    cellNF: false,
    cellStyles: false,
  });

  // Quais abas entram, e de onde sai o ano de cada uma.
  const escolhidas: { nome: string; ano: number | null }[] =
    msg.cfg.abasModo === "abas_escolhidas"
      ? (msg.cfg.abas ?? []).filter((a) => wb.SheetNames.includes(a.nome))
      : msg.cfg.abasModo === "ano_na_coluna"
        // Sem lista cadastrada entram todas: neste modo a aba nao precisa
        // significar nada, entao nao ha o que filtrar.
        ? (msg.cfg.abas && msg.cfg.abas.length > 0
            ? msg.cfg.abas
                .filter((a) => wb.SheetNames.includes(a.nome))
                .map((a) => ({ nome: a.nome, ano: null }))
            : wb.SheetNames.map((nome) => ({ nome, ano: null })))
        : wb.SheetNames
            .map((nome) => ({ nome, ano: parseInt(nome, 10) }))
            .filter((a) => Number.isFinite(a.ano));

  if (escolhidas.length === 0) {
    throw new Error(
      msg.cfg.abasModo === "ano_no_nome"
        ? "Nenhuma aba com nome de ano. Se este ente usa outro formato, configure em DE/PARA."
        : "Nenhuma das abas configuradas no DE/PARA existe neste arquivo.",
    );
  }

  abas = [];
  const faltando: string[] = [];
  const origensAusentes: string[] = [];

  escolhidas.forEach(({ nome, ano }, i) => {
    avisar({ tipo: "status", texto: `Lendo a aba ${nome}…` });
    avisar({ tipo: "progresso", pct: Math.round((i / escolhidas.length) * 100) });

    const m = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], {
      header: 1,
      raw: false,
    }) as unknown[][];
    const cabecalho = (m[0] ?? []).map((v) => String(v ?? "").trim());
    const compilado = compilarMapa(msg.tipo, msg.cfg.mapa, cabecalho, {
      abasModo: msg.cfg.abasModo,
      opcionais: msg.cfg.opcionais ?? [],
    });
    faltando.push(...compilado.faltando);
    origensAusentes.push(...compilado.origensAusentes);

    abas.push({ ano, nome, compilado, linhas: m.slice(1).filter((r) => !linhaVazia(r)) });
    // A aba já virou linhas: solta a planilha crua dela antes de ler a
    // próxima, senão as duas representações convivem na memória.
    delete wb.Sheets[nome];
  });

  const totalLinhas = abas.reduce((s, a) => s + a.linhas.length, 0);
  if (totalLinhas === 0) throw new Error("A planilha não tem linhas de dados.");

  avisar({ tipo: "status", texto: "Verificando os dados…" });
  const unicos = (xs: string[]) => Array.from(new Set(xs));
  // Quando o ano vem de coluna, quais anos o arquivo cobre so se sabe depois de
  // ler as linhas — e e essa lista que a importacao usa para aposentar os lotes
  // certos. Coletada de carona na verificacao, que ja percorre tudo.
  const anosVistos = new Set<number>();
  const relatorio = analisarQualidade(
    msg.tipo,
    abas.map((a) => ({
      // O relatorio usa isto so para localizar a linha ("2024 - linha 57").
      ano: a.ano ?? 0,
      // Gerador: traduz sob demanda, sem materializar o arquivo convertido.
      registros: (function* () {
        for (const l of a.linhas) {
          const reg = traduzir(a, l);
          if (typeof reg.ano === "number" && Number.isInteger(reg.ano)) anosVistos.add(reg.ano);
          yield reg;
        }
      })(),
    })),
    {
      faltando: unicos(faltando),
      origensAusentes: unicos(origensAusentes),
      // Interseção, não união: só é julgado o campo que TODAS as abas
      // preenchem. Se uma aba não traz a coluna, julgar as linhas dela
      // renderia um aviso por linha — o ruído que esta lista existe para
      // evitar. A falta em si já aparece como origem ausente.
      camposMapeados: abas.length
        ? abas
            .map((a) => a.compilado.cobertos)
            .reduce((acc, c) => acc.filter((campo) => c.includes(campo)))
        : [],
    },
  );

  const anos = Array.from(anosVistos).sort((a, b) => a - b);
  if (anos.length === 0 && !relatorio.temBloqueio) {
    throw new Error(
      modoAtual === "ano_na_coluna"
        ? "Nenhuma linha trouxe ano valido na coluna mapeada. Confira o DE/PARA."
        : "Nao foi possivel determinar o ano das abas.",
    );
  }

  avisar({ tipo: "progresso", pct: 100 });
  avisar({ tipo: "analise", relatorio, totalLinhas, anos });
}

/**
 * Quantos lotes ficam no ar ao mesmo tempo.
 *
 * O envio era estritamente sequencial: um arquivo de 350 mil linhas virava 350
 * requisições uma depois da outra, e o tempo total era a soma de todas as idas
 * e voltas — com a máquina e o banco ociosos entre elas. Três é o suficiente
 * para cobrir a latência sem transformar a importação numa enxurrada sobre o
 * banco (cada lote é um INSERT de milhares de linhas).
 */
const CONCORRENTES = 3;

async function enviar(msg: Extract<ParaWorker, { acao: "enviar" }>) {
  const totalLinhas = abas.reduce((s, a) => s + a.linhas.length, 0);

  // Os lotes são só índices: as linhas já estão em memória, e fatiá-las na
  // hora do envio evita manter uma segunda cópia traduzida do arquivo todo.
  const lotes: { aba: number; de: number; ate: number }[] = [];
  abas.forEach((aba, i) => {
    for (let ini = 0; ini < aba.linhas.length; ini += msg.lote) {
      lotes.push({ aba: i, de: ini, ate: Math.min(ini + msg.lote, aba.linhas.length) });
    }
  });

  let enviadas = 0;
  let proximo = 0;
  /** Primeira falha vista. Faz os outros trabalhadores pararem no lote atual,
   *  em vez de continuarem gravando num lote que já vai ser descartado. */
  let falha: Error | null = null;

  async function trabalhador() {
    for (;;) {
      if (falha) return;
      if (cancelado) throw new Error("Importação cancelada.");
      const meu = proximo++;
      if (meu >= lotes.length) return;

      const { aba, de, ate } = lotes[meu];
      const linhas = abas[aba].linhas.slice(de, ate).map((l) => traduzir(abas[aba], l));

      const r = await fetch("/api/sada/importar/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // O worker é da mesma origem, então o cookie de sessão vai junto —
        // é o que faz a rota reconhecer o usuário como na tela.
        credentials: "same-origin",
        body: JSON.stringify({ importacaoId: msg.importacaoId, tipo: tipoAtual, linhas }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || `Erro ${r.status} ao enviar o lote`);

      enviadas += linhas.length;
      avisar({ tipo: "progresso", pct: Math.round((enviadas / totalLinhas) * 100) });
      avisar({
        tipo: "status",
        texto: `Enviando: ${enviadas.toLocaleString("pt-BR")} de ${totalLinhas.toLocaleString("pt-BR")} linhas`,
      });
    }
  }

  const equipe = Array.from({ length: Math.min(CONCORRENTES, lotes.length) }, () =>
    trabalhador().catch((e: unknown) => {
      falha = falha ?? (e as Error);
    }),
  );
  await Promise.all(equipe);
  if (falha) throw falha;

  avisar({ tipo: "enviado", total: enviadas });
}

self.onmessage = async (e: MessageEvent<ParaWorker>) => {
  try {
    if (e.data.acao === "cancelar") {
      cancelado = true;
      return;
    }
    if (e.data.acao === "analisar") {
      analisar(e.data);
      return;
    }
    await enviar(e.data);
  } catch (err) {
    avisar({ tipo: "erro", mensagem: (err as Error).message || "Falha ao processar a planilha." });
  }
};

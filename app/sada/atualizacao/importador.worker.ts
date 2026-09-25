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
  ano: number;
  linhas: unknown[][];
  compilado: MapaCompilado;
}

// Estado entre as duas fases (analisar → enviar). Fica no worker de propósito:
// é o que evita devolver as linhas para a tela e trazê-las de volta.
let abas: AbaLida[] = [];
let tipoAtual: TipoSada = "divida_ativa";
let cnpjAtual = "";
let valores = compilarValores([]);
let cancelado = false;

const avisar = (m: DoWorker) => (self as unknown as Worker).postMessage(m);

/** Linha crua → registro do banco, com o DE/PARA de valores aplicado. */
function traduzir(aba: AbaLida, linha: unknown[]): Record<string, unknown> {
  const reg = aba.compilado.aplicar(linha);
  if ("sigla" in reg) reg.sigla = valores.aplicar("sigla", reg.sigla);
  if ("fase" in reg) reg.fase = valores.aplicar("fase", reg.fase);
  reg.cnpj_orgao = cnpjAtual;
  reg.ano = aba.ano;
  return reg;
}

function analisar(msg: Extract<ParaWorker, { acao: "analisar" }>) {
  cancelado = false;
  tipoAtual = msg.tipo;
  cnpjAtual = msg.cnpj;
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

  const escolhidas: { nome: string; ano: number }[] =
    msg.cfg.abasModo === "abas_escolhidas"
      ? (msg.cfg.abas ?? []).filter((a) => wb.SheetNames.includes(a.nome))
      : wb.SheetNames
          .map((nome) => ({ nome, ano: parseInt(nome, 10) }))
          .filter((a) => Number.isFinite(a.ano));

  if (escolhidas.length === 0) {
    throw new Error(
      msg.cfg.abasModo === "abas_escolhidas"
        ? "Nenhuma das abas configuradas no DE/PARA existe neste arquivo."
        : "Nenhuma aba com nome de ano. Se este ente usa outro formato, configure em DE/PARA.",
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
    const compilado = compilarMapa(msg.tipo, msg.cfg.mapa, cabecalho);
    faltando.push(...compilado.faltando);
    origensAusentes.push(...compilado.origensAusentes);

    abas.push({ ano, compilado, linhas: m.slice(1).filter((r) => !linhaVazia(r)) });
    // A aba já virou linhas: solta a planilha crua dela antes de ler a
    // próxima, senão as duas representações convivem na memória.
    delete wb.Sheets[nome];
  });

  const totalLinhas = abas.reduce((s, a) => s + a.linhas.length, 0);
  if (totalLinhas === 0) throw new Error("A planilha não tem linhas de dados.");

  avisar({ tipo: "status", texto: "Verificando os dados…" });
  const unicos = (xs: string[]) => Array.from(new Set(xs));
  const relatorio = analisarQualidade(
    msg.tipo,
    abas.map((a) => ({
      ano: a.ano,
      // Gerador: traduz sob demanda, sem materializar o arquivo convertido.
      registros: (function* () {
        for (const l of a.linhas) yield traduzir(a, l);
      })(),
    })),
    { faltando: unicos(faltando), origensAusentes: unicos(origensAusentes) },
  );

  avisar({ tipo: "progresso", pct: 100 });
  avisar({ tipo: "analise", relatorio, totalLinhas, anos: abas.map((a) => a.ano) });
}

async function enviar(msg: Extract<ParaWorker, { acao: "enviar" }>) {
  const totalLinhas = abas.reduce((s, a) => s + a.linhas.length, 0);
  let enviadas = 0;
  let buffer: Record<string, unknown>[] = [];

  const flush = async () => {
    if (!buffer.length) return;
    const r = await fetch("/api/sada/importar/lote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // O worker é da mesma origem, então o cookie de sessão vai junto —
      // é o que faz a rota reconhecer o usuário como na tela.
      credentials: "same-origin",
      body: JSON.stringify({ importacaoId: msg.importacaoId, tipo: tipoAtual, linhas: buffer }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || `Erro ${r.status} ao enviar o lote`);
    enviadas += buffer.length;
    buffer = [];
    avisar({ tipo: "progresso", pct: Math.round((enviadas / totalLinhas) * 100) });
  };

  for (const aba of abas) {
    avisar({ tipo: "status", texto: `Enviando ${aba.ano}…` });
    for (const l of aba.linhas) {
      if (cancelado) throw new Error("Importação cancelada.");
      buffer.push(traduzir(aba, l));
      if (buffer.length >= msg.lote) await flush();
    }
  }
  await flush();
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

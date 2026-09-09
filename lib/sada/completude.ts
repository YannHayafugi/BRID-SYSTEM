/**
 * SADA · completude do INFO REQUEST LIST.
 *
 * Mede quanto de cada envio do ente foi efetivamente preenchido, contra a
 * especificação versionada no banco (sada_spec_campo) — e NÃO contra a aba
 * LEIA do arquivo recebido, que o próprio ente poderia ter alterado.
 *
 * Isomórfico e puro: o navegador lê o .xlsx e chama `analisarCompletude`, o
 * servidor pode recalcular o mesmo resultado a partir dos mesmos dados. Sem
 * I/O aqui dentro, o que torna o cálculo testável sem banco nem planilha.
 */

export type Criticidade = "Essencial" | "Importante" | "Complementar";

/** Um campo esperado, como está em sada_spec_campo. */
export interface CampoSpec {
  aba: string;
  campo: string;
  ordem: number;
  criticidade: Criticidade;
}

/** Uma aba do arquivo recebido, já lida pelo SheetJS. */
export interface AbaRecebida {
  nome: string;
  /** Linha de cabeçalho, na ordem em que veio. */
  cabecalho: string[];
  /** Só as linhas de dados reais — exemplos e marcadores já removidos. */
  linhas: unknown[][];
  /** Quantas linhas de exemplo sobraram no arquivo (deveriam ter sido apagadas). */
  exemplosRestantes: number;
}

export interface ResultadoCampo {
  aba: string;
  campo: string;
  criticidade: Criticidade;
  /** A coluna existe no arquivo recebido? */
  presente: boolean;
  total: number;
  preenchidas: number;
  /** 0–100. Coluna ausente conta como 0: o dado não veio. */
  pct: number;
}

export interface Achado {
  severidade: "erro" | "aviso";
  aba?: string;
  detalhe: string;
}

export interface ResumoCriticidade {
  criticidade: Criticidade;
  campos: number;
  celulasEsperadas: number;
  celulasPreenchidas: number;
  pct: number;
}

export interface ResumoAba {
  aba: string;
  presente: boolean;
  linhas: number;
  camposEsperados: number;
  camposAusentes: number;
  pctEssencial: number;
  pctGeral: number;
}

export interface Relatorio {
  indiceCompletude: number;
  porCriticidade: ResumoCriticidade[];
  porAba: ResumoAba[];
  porCampo: ResultadoCampo[];
  estruturais: Achado[];
}

/**
 * Peso de cada criticidade no índice. A definição vem da própria aba LEIA:
 * sem um Essencial o estudo não se conclui, um Importante reduz a precisão e
 * um Complementar é desejável. O índice reflete essa hierarquia em vez de
 * tratar 103 campos como iguais — senão preencher 40 complementares
 * compensaria, no número, a ausência de um campo que inviabiliza o trabalho.
 */
export const PESOS: Record<Criticidade, number> = {
  Essencial: 5,
  Importante: 2,
  Complementar: 1,
};

/** Igual ao `normalizar` do DE/PARA: compara nome de aba e de coluna sem
 *  depender de acento, caixa ou pontuação. */
export function normalizar(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function celulaVazia(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

/**
 * Compara o arquivo recebido com a especificação vigente.
 *
 * Regras que valem a pena explicitar, porque decidem o número final:
 *
 * - Aba ou coluna ausente conta como 0% preenchido, não como "não se aplica".
 *   O ente não mandou o dado; o relatório existe para dizer isso.
 * - Aba sem nenhuma linha real também dá 0%, mesmo com todas as colunas no
 *   lugar. Cabeçalho não é dado.
 * - Coluna que veio no arquivo e não está na especificação vira aviso, nunca
 *   entra no índice: medir contra régua que não é a nossa distorceria tudo.
 */
export function analisarCompletude(spec: CampoSpec[], recebidas: AbaRecebida[]): Relatorio {
  const estruturais: Achado[] = [];
  const porIndice = new Map(recebidas.map((a) => [normalizar(a.nome), a]));

  const abasSpec = Array.from(new Set(spec.map((s) => s.aba)));
  const porCampo: ResultadoCampo[] = [];

  for (const aba of abasSpec) {
    const recebida = porIndice.get(normalizar(aba)) ?? null;
    const camposDaAba = spec.filter((s) => s.aba === aba).sort((a, b) => a.ordem - b.ordem);

    if (!recebida) {
      estruturais.push({ severidade: "erro", aba, detalhe: `Aba "${aba}" não veio no arquivo.` });
      for (const c of camposDaAba) {
        porCampo.push({ ...c, presente: false, total: 0, preenchidas: 0, pct: 0 });
      }
      continue;
    }

    if (recebida.exemplosRestantes > 0) {
      estruturais.push({
        severidade: "aviso",
        aba,
        detalhe:
          `${recebida.exemplosRestantes} linha(s) de exemplo continuam na aba — ` +
          "elas deveriam ter sido apagadas e não entram nas contagens.",
      });
    }
    if (recebida.linhas.length === 0) {
      estruturais.push({ severidade: "erro", aba, detalhe: `Aba "${aba}" veio sem nenhuma linha de dados.` });
    }

    // Índice da coluna no arquivo, por nome normalizado. Primeira ocorrência
    // vence, como no DE/PARA: cabeçalho repetido é problema do arquivo.
    const idx = new Map<string, number>();
    recebida.cabecalho.forEach((c, i) => {
      const k = normalizar(c);
      if (k && !idx.has(k)) idx.set(k, i);
    });

    for (const c of camposDaAba) {
      const pos = idx.get(normalizar(c.campo));
      if (pos === undefined) {
        estruturais.push({
          severidade: c.criticidade === "Essencial" ? "erro" : "aviso",
          aba,
          detalhe: `Coluna "${c.campo}" (${c.criticidade}) não existe no arquivo.`,
        });
        porCampo.push({ ...c, presente: false, total: recebida.linhas.length, preenchidas: 0, pct: 0 });
        continue;
      }
      const preenchidas = recebida.linhas.reduce((s, l) => s + (celulaVazia(l[pos]) ? 0 : 1), 0);
      const total = recebida.linhas.length;
      porCampo.push({
        ...c,
        presente: true,
        total,
        preenchidas,
        pct: total > 0 ? (100 * preenchidas) / total : 0,
      });
    }

    // Colunas fora da especificação: sinaliza, não pontua.
    const esperados = new Set(camposDaAba.map((c) => normalizar(c.campo)));
    for (const col of recebida.cabecalho) {
      const k = normalizar(col);
      if (k && !esperados.has(k)) {
        estruturais.push({
          severidade: "aviso",
          aba,
          detalhe: `Coluna "${col}" não faz parte da especificação e foi ignorada no cálculo.`,
        });
      }
    }
  }

  for (const r of recebidas) {
    if (!abasSpec.some((a) => normalizar(a) === normalizar(r.nome))) {
      estruturais.push({
        severidade: "aviso",
        aba: r.nome,
        detalhe: `Aba "${r.nome}" não faz parte da especificação e foi ignorada.`,
      });
    }
  }

  return { ...agregar(porCampo, recebidas, porIndice), porCampo, estruturais };
}

/** Agregações do relatório. Separada de `analisarCompletude` só para manter
 *  cada função legível — não tem uso fora daqui. */
function agregar(
  porCampo: ResultadoCampo[],
  recebidas: AbaRecebida[],
  porIndice: Map<string, AbaRecebida>,
): Pick<Relatorio, "indiceCompletude" | "porCriticidade" | "porAba"> {
  const CRITS: Criticidade[] = ["Essencial", "Importante", "Complementar"];

  // Por criticidade a conta é em CÉLULAS, não em campos: um campo essencial
  // preenchido em 3 de 10 mil linhas não vale o mesmo que um preenchido
  // inteiro, e contar campos apagaria essa diferença.
  const porCriticidade: ResumoCriticidade[] = CRITS.map((crit) => {
    const campos = porCampo.filter((c) => c.criticidade === crit);
    const esperadas = campos.reduce((s, c) => s + c.total, 0);
    const preenchidas = campos.reduce((s, c) => s + c.preenchidas, 0);
    return {
      criticidade: crit,
      campos: campos.length,
      celulasEsperadas: esperadas,
      celulasPreenchidas: preenchidas,
      pct: esperadas > 0 ? (100 * preenchidas) / esperadas : 0,
    };
  });

  const abas = Array.from(new Set(porCampo.map((c) => c.aba)));
  const porAba: ResumoAba[] = abas.map((aba) => {
    const doAba = porCampo.filter((c) => c.aba === aba);
    const ess = doAba.filter((c) => c.criticidade === "Essencial");
    const recebida = porIndice.get(normalizar(aba)) ?? null;
    const media = (lista: ResultadoCampo[]) =>
      lista.length ? lista.reduce((s, c) => s + c.pct, 0) / lista.length : 0;
    return {
      aba,
      presente: !!recebida,
      linhas: recebida ? recebida.linhas.length : 0,
      camposEsperados: doAba.length,
      camposAusentes: doAba.filter((c) => !c.presente).length,
      pctEssencial: media(ess),
      pctGeral: media(doAba),
    };
  });

  // Índice: média das porcentagens de campo ponderada pelo peso da
  // criticidade. Por campo (e não por célula) de propósito — assim uma aba com
  // 40 mil linhas não domina o número de um envio que também precisa dos 15
  // campos de METADADOS, que ocupam uma linha só.
  const somaPeso = porCampo.reduce((s, c) => s + PESOS[c.criticidade], 0);
  const somaPond = porCampo.reduce((s, c) => s + PESOS[c.criticidade] * c.pct, 0);

  return {
    indiceCompletude: somaPeso > 0 ? somaPond / somaPeso : 0,
    porCriticidade,
    porAba,
  };
}

/**
 * Separa, numa aba lida crua (header + tudo), o cabeçalho e as linhas reais.
 *
 * O modelo enviado ao ente traz dois marcadores na coluna A: um antes das
 * linhas de exemplo e outro antes da área de preenchimento. Os exemplos são
 * dados plausíveis — se entrarem na conta, um arquivo em branco aparece como
 * parcialmente preenchido, que é exatamente o erro que este relatório existe
 * para não cometer.
 */
export function separarAba(nome: string, grade: unknown[][]): AbaRecebida {
  const temConteudo = (r: unknown[]) => r.some((c) => !celulaVazia(c));
  const texto = (r: unknown[]) => String(r?.[0] ?? "");

  const iCabecalho = grade.findIndex((r) => temConteudo(r) && !/^BLOCO/i.test(texto(r)));
  const cabecalho = (grade[iCabecalho] ?? []).map((c) => (celulaVazia(c) ? "" : String(c).trim()));

  const iExemplo = grade.findIndex((r) => /LINHAS DE EXEMPLO/i.test(texto(r)));
  const iReal = grade.findIndex((r) => /PREENCHA OS DADOS REAIS/i.test(texto(r)));

  // Sem o marcador de área real, tudo depois do cabeçalho é dado — é o caso de
  // um ente que apagou os avisos junto com os exemplos, como pedido.
  const inicio = iReal >= 0 ? iReal + 1 : iCabecalho + 1;
  const linhas = grade.slice(inicio).filter(temConteudo);

  const exemplosRestantes =
    iExemplo >= 0 && iReal > iExemplo
      ? grade.slice(iExemplo + 1, iReal).filter(temConteudo).length
      : 0;

  return { nome, cabecalho, linhas, exemplosRestantes };
}

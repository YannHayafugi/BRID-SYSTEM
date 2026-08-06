import Anthropic from "@anthropic-ai/sdk";
import { OBJETO_ELEMENTOS_ESPERADOS, getEtapasReferenciaTexto } from "./tr/referenciaSecuritizacao";
import { ResultadoAnaliseTR } from "./tr/types";

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (anthropicClient) return anthropicClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY não configurada.");
  }
  anthropicClient = new Anthropic({ apiKey });
  return anthropicClient;
}

const MODELO_ANALISE = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

/** Conteúdo de referência (objeto "Securitização de Dívida Ativa"), cacheado
 * no prompt por raramente mudar — ver docs/ESPECIFICAÇÃO FUNCIONAL DO SISTEMA
 * - v1.1.docx. Compartilhado entre o modo de análise por texto e o modo de
 * leitura direta de imagem (fallback para TR escaneado, ver analisarTRViaPDF). */
const CONTEUDO_REFERENCIA = `Você é um analista técnico-jurídico especializado em licitações públicas e em contratos de securitização de créditos públicos municipais/estaduais, revisando um Termo de Referência (TR) emitido por um ente público (Município ou Estado) que deseja contratar uma instituição para prestação de serviços de assessoria técnica em uma operação de securitização de dívida ativa.

=== REGRA CRÍTICA — NUNCA INVENTE CONTEÚDO ===
Você deve basear TODA a sua análise exclusivamente no conteúdo real e efetivamente presente no documento fornecido. É ESTRITAMENTE PROIBIDO presumir, inferir a partir de "padrões típicos de mercado" ou preencher qualquer campo com um valor plausível que não esteja de fato escrito no documento. Se o documento estiver vazio, ilegível, corrompido, não for um Termo de Referência, ou não contiver texto suficiente para realizar a análise, você NÃO deve preencher os itens de análise — em vez disso, defina "documentoValido": false e explique o motivo em "motivoInvalido". Nesse caso, todos os demais campos do JSON devem ser preenchidos com valores neutros (strings vazias, false, listas vazias), pois eles serão ignorados pelo sistema. Preferir declarar "documentoValido": false a arriscar qualquer alucinação.

Quando o documento for válido, ainda assim: se uma informação específica não estiver presente no texto, diga isso explicitamente (ex.: "Não localizado no TR.") em vez de sugerir um valor comum ou típico.

Sua tarefa, quando o documento for válido, é ler o TR e produzir uma análise semântica estruturada, respondendo exatamente às 8 verificações abaixo. A análise deve reconhecer equivalência de sentido mesmo quando o TR usa vocabulário, estrutura ou ordem diferentes — não é uma busca por palavras-chave exatas, mas também não é uma adivinhação: cada achado deve ser rastreável a um trecho real do documento.

=== 1. OBJETO / CONDIÇÕES GERAIS DE CONTRATAÇÃO ===
Verifique se a descrição do objeto da contratação no TR está alinhada ao escopo esperado abaixo, de forma direta ou equivalente:
${OBJETO_ELEMENTOS_ESPERADOS}
Se houver diferença substancial entre o objeto do TR e esse escopo esperado, marque alinhado=false e descreva os achados. Se estiver alinhado, marque alinhado=true.

=== 2. PRAZO DE VIGÊNCIA ===
Localize o prazo de vigência do contrato (duração, período de execução, vigência contratual etc., qualquer que seja o termo usado) e transcreva/resuma-o. Localize também qualquer previsão sobre possibilidade de prorrogação do contrato e descreva-a (ou indique que não há previsão).

=== 3. FUNDAMENTAÇÃO E DESCRIÇÃO DA NECESSIDADE DE CONTRATAÇÃO ===
Verifique dois aspectos no trecho do TR que trata da justificativa/fundamentação da contratação:
(a) se o conteúdo é condizente com o objeto esperado (justifica adequadamente uma contratação de assessoria para securitização de dívida ativa);
(b) se há referência à Lei Complementar nº 208/2024 e ao art. 75, inciso XV, da Lei Federal nº 14.133/2021. Para o aspecto (b), classifique como:
- "literal": o TR cita literalmente o número da lei e do artigo/inciso (ex.: "LC nº 208/2024", "art. 75, XV, da Lei nº 14.133/2021");
- "equivalente": o TR faz referência inequívoca ao mesmo conteúdo legal (ex.: menciona o marco legal da securitização e/ou a dispensa de licitação para esse tipo de serviço), mas sem citar o número da lei/artigo de forma literal;
- "ausente": nenhuma referência, literal ou equivalente, foi identificada.

=== 4. ETAPAS DA PRESTAÇÃO DOS SERVIÇOS ===
Compare as etapas de prestação de serviços descritas no TR com as 3 etapas de referência abaixo, verificando divergências de conteúdo e de ordem em cada uma:
${getEtapasReferenciaTexto()}
Nota: nas etapas de referência acima usa-se o termo genérico "contratante"/"ente"; no TR analisado esse termo pode aparecer substituído por algo como "do Estado de São Paulo" ou "do Município de Jundiaí" — isso é apenas uma especificação do ente, não uma divergência.

=== 5. ORDEM DE SERVIÇO ===
Identifique se o TR trata da emissão de Ordem de Serviço para início dos trabalhos, incluindo o prazo para sua emissão pelo contratante e o prazo para início dos trabalhos pela contratada após o recebimento (ou indique que não foi especificado). Identifique também, separadamente, se o TR exige que a contratada aguarde a emissão de uma NOVA ordem de serviço para avançar de uma etapa para a seguinte, condicionada à aprovação formal da etapa anterior pela contratante — isso é um ponto de risco relevante para a contratada.

=== 6. GARANTIA CONTRATUAL ===
Verifique se o TR exige da contratada a prestação de garantia contratual (caução/garantia de execução) como condição para assinatura do contrato.

=== 7. CONDIÇÕES DE FATURAMENTO E PAGAMENTO ===
Quatro verificações:
a) Condição para emissão de nota fiscal e prazo de pagamento após a emissão.
b) Mecanismo de atualização monetária/correção financeira em caso de atraso no pagamento pela contratante — sempre relate o que encontrou, mesmo que seja "não previsto".
c) Regra que imponha condições ou custos à contratada relacionados à conta bancária usada para recebimento dos pagamentos (ex.: contratada arca com custo de transferência se não usar conta em banco específico).
d) Metodologia ou critério de medição/avaliação dos serviços prestados antes do pagamento.

=== 8. PENALIDADES E BLOQUEIO DE PAGAMENTO ===
Identifique TODAS as cláusulas do TR que tratem de penalidades, sanções ou restrições aplicáveis à contratada: multas por atraso, impedimento de avanço de etapa por não aprovação da entrega anterior, suspensão/bloqueio de pagamento vinculado a desempenho, e quaisquer outras sanções contratuais. Liste cada uma separadamente, transcrevendo ou resumindo fielmente o texto real (lista vazia se nenhuma for encontrada — NÃO invente penalidades típicas de mercado).

Responda SOMENTE com um JSON compacto (sem markdown, sem texto antes ou depois), seguindo EXATAMENTE este formato:

{
  "documentoValido": true,
  "motivoInvalido": null,
  "item1_objeto": {"alinhado": true, "achados": null},
  "item2_prazo": {"prazoTexto": "...", "prorrogacaoPrevista": true, "prorrogacaoDetalhe": "..."},
  "item3_fundamentacao": {"aspectoACondizente": true, "aspectoADetalhe": "...", "referenciaLegal": "literal", "referenciaLegalDetalhe": "..."},
  "item4_etapas": [{"etapa": 1, "divergencia": false, "resumo": null}, {"etapa": 2, "divergencia": false, "resumo": null}, {"etapa": 3, "divergencia": false, "resumo": null}],
  "item5_ordemServico": {"presente": true, "prazoEmissao": "...", "prazoInicio": "...", "exigeNovaOsPorEtapa": false, "detalheRisco": null},
  "item6_garantia": {"exigida": false, "detalhe": null},
  "item7_pagamento": {"condicaoNf": "...", "atualizacaoMonetaria": "...", "regraBanco": {"identificado": false, "detalhe": null}, "metodologiaMedicao": {"identificado": false, "detalhe": null}},
  "item8_penalidades": [{"descricao": "..."}]
}

Regras de preenchimento: "achados", "detalhe", "resumo" e "detalheRisco" devem ser null quando o campo booleano correspondente for false/não aplicável. Textos devem ser objetivos (no máximo 2-3 frases cada, exceto quando for necessário transcrever um trecho específico). Não inclua nenhum campo além dos especificados. item4_etapas deve conter exatamente 3 objetos, um por etapa, na ordem 1, 2, 3.`;

function montarSystemBlock(): Anthropic.TextBlockParam[] {
  return [
    {
      type: "text",
      text: CONTEUDO_REFERENCIA,
      // Conteúdo de referência raramente muda: cacheado para reduzir custo/latência.
      cache_control: { type: "ephemeral" },
    },
  ];
}

/**
 * Modo principal: análise a partir do texto já extraído localmente do PDF
 * (nenhum binário é enviado à API). Usado sempre que a extração local
 * conseguir capturar texto suficiente do TR.
 */
export async function analisarTR(textoTrRecebido: string): Promise<ResultadoAnaliseTR> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: MODELO_ANALISE,
    max_tokens: 6000,
    system: montarSystemBlock(),
    messages: [
      {
        role: "user",
        content: `TR A SER ANALISADO:\n\n${textoTrRecebido}`,
      },
    ],
  });

  return parseRespostaIA(extrairTexto(response));
}

/**
 * Modo de fallback: usado quando a extração local de texto não retorna
 * conteúdo suficiente (ex.: TR escaneado, salvo como imagem). Nesse caso, o
 * PDF é enviado diretamente à API do Claude, que consegue ler o documento via
 * visão computacional. Custa mais tokens que o modo por texto — só é usado
 * quando não há alternativa.
 */
export async function analisarTRViaPDF(pdfBuffer: Buffer, nomeArquivo: string): Promise<ResultadoAnaliseTR> {
  const client = getAnthropicClient();
  const base64 = pdfBuffer.toString("base64");

  const response = await client.messages.create({
    model: MODELO_ANALISE,
    max_tokens: 6000,
    system: montarSystemBlock(),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            title: nomeArquivo,
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          },
          {
            type: "text",
            text: "O TR está anexado acima como PDF (não foi possível extrair texto localmente — provavelmente um documento escaneado). Leia o conteúdo do documento e realize a análise.",
          },
        ],
      },
    ],
  });

  return parseRespostaIA(extrairTexto(response));
}

function extrairTexto(response: Anthropic.Message): string {
  return response.content
    .filter((bloco): bloco is Anthropic.TextBlock => bloco.type === "text")
    .map((bloco) => bloco.text)
    .join("");
}

function parseRespostaIA(texto: string): ResultadoAnaliseTR {
  const limpo = texto.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(limpo);
  } catch {
    throw new Error("Resposta da IA não é um JSON válido: " + limpo.slice(0, 500));
  }

  const r = parsed as Partial<ResultadoAnaliseTR>;

  if (typeof r.documentoValido !== "boolean") {
    throw new Error('Resposta da IA incompleta: campo "documentoValido" ausente.');
  }

  // Quando o documento é inválido/ilegível, não exigimos os demais campos —
  // é justamente o caso em que a IA não deve ter inventado nada para eles.
  if (!r.documentoValido) {
    return {
      documentoValido: false,
      motivoInvalido: r.motivoInvalido || "Não foi possível analisar o documento enviado.",
      item1_objeto: { alinhado: true, achados: null },
      item2_prazo: { prazoTexto: "", prorrogacaoPrevista: false, prorrogacaoDetalhe: "" },
      item3_fundamentacao: {
        aspectoACondizente: true,
        aspectoADetalhe: "",
        referenciaLegal: "ausente",
        referenciaLegalDetalhe: "",
      },
      item4_etapas: [
        { etapa: 1, divergencia: false, resumo: null },
        { etapa: 2, divergencia: false, resumo: null },
        { etapa: 3, divergencia: false, resumo: null },
      ],
      item5_ordemServico: {
        presente: false,
        prazoEmissao: "",
        prazoInicio: "",
        exigeNovaOsPorEtapa: false,
        detalheRisco: null,
      },
      item6_garantia: { exigida: false, detalhe: null },
      item7_pagamento: {
        condicaoNf: "",
        atualizacaoMonetaria: "",
        regraBanco: { identificado: false, detalhe: null },
        metodologiaMedicao: { identificado: false, detalhe: null },
      },
      item8_penalidades: [],
    };
  }

  const camposEsperados: (keyof ResultadoAnaliseTR)[] = [
    "item1_objeto",
    "item2_prazo",
    "item3_fundamentacao",
    "item4_etapas",
    "item5_ordemServico",
    "item6_garantia",
    "item7_pagamento",
    "item8_penalidades",
  ];
  for (const campo of camposEsperados) {
    if (!(campo in r)) {
      throw new Error(`Resposta da IA incompleta: campo "${campo}" ausente.`);
    }
  }
  if (!Array.isArray(r.item4_etapas) || r.item4_etapas.length !== 3) {
    throw new Error("Resposta da IA inválida: item4_etapas deve ter exatamente 3 etapas.");
  }
  if (!Array.isArray(r.item8_penalidades)) {
    throw new Error("Resposta da IA inválida: item8_penalidades deve ser uma lista.");
  }

  return { ...r, motivoInvalido: null } as ResultadoAnaliseTR;
}

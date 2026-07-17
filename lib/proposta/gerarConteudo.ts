/**
 * Geração do conteúdo da proposta via API do Claude (D7 — parte "IA" do híbrido).
 *
 * Portado do backend Python (generator.py + prompts.py). Uma única chamada por
 * TR, retornando JSON compacto (economia de tokens — a formatação fica no DOCX).
 * Suporta TR em texto extraído localmente ou, para PDF escaneado, leitura
 * nativa do PDF pela IA (mesmo padrão de lib/claudeAnalysis.ts).
 */
import Anthropic from "@anthropic-ai/sdk";
import { ConteudoProposta } from "./tipos";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
  client = new Anthropic({ apiKey });
  return client;
}

const MODELO = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

const SYSTEM =
  "Você é um especialista em elaboração de propostas técnicas e comerciais " +
  "em resposta a Termos de Referência (TR) de contratações públicas e privadas no Brasil. " +
  "Responda SOMENTE com JSON válido, sem markdown, sem texto fora do JSON.";

function montarPrompt(trTexto: string, contextoAchados?: string): string {
  const blocoAchados = contextoAchados
    ? `\n\nANÁLISE CRÍTICA PRÉVIA DO TR (achados registrados e comentários do analista — considere-os ao redigir, especialmente em requisitos_atendidos, premissas e riscos):\n---\n${contextoAchados}\n---`
    : "";

  return `Leia o Termo de Referência abaixo e gere o conteúdo de uma proposta.

Retorne JSON exatamente com esta estrutura:
{
  "titulo": "título da proposta",
  "orgao_cliente": "órgão ou empresa contratante identificado no TR",
  "objeto": "descrição do objeto da contratação (1 parágrafo)",
  "contexto": "contexto e justificativa (1-2 parágrafos)",
  "escopo": ["item de escopo 1", "item 2"],
  "metodologia": "abordagem metodológica proposta (2-3 parágrafos)",
  "etapas": [{"nome": "Etapa", "descricao": "o que será feito", "prazo": "duração estimada"}],
  "equipe": [{"perfil": "cargo/função", "atribuicoes": "responsabilidades", "quantidade": 1}],
  "prazo_total": "prazo total de execução",
  "criterios_pagamento": "condições de pagamento/medição conforme o TR",
  "requisitos_atendidos": ["requisito relevante do TR e como será atendido"],
  "premissas": ["premissa 1"],
  "riscos": [{"risco": "descrição", "mitigacao": "como mitigar"}],
  "resumo": {
    "objeto": "objeto em 1 frase",
    "cliente": "contratante",
    "prazo": "prazo total",
    "valor_referencia": "valor estimado no TR, se houver, ou 'não informado'",
    "escopo_resumido": ["3 a 5 itens principais"],
    "destaques": ["2 a 4 diferenciais/pontos de atenção da proposta"],
    "proximos_passos": ["passos sugeridos"]
  }
}

Regras:
- Baseie-se apenas no TR; não invente valores ou prazos não mencionados (use "a definir").
- Português do Brasil, tom profissional.
- Seja objetivo: strings concisas, sem repetir o TR literalmente.${blocoAchados}

TERMO DE REFERÊNCIA:
---
${trTexto}
---`;
}

function extrairJson(texto: string): ConteudoProposta {
  let t = texto.trim();
  if (t.startsWith("```")) {
    t = t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1);
  }
  return JSON.parse(t) as ConteudoProposta;
}

/** Gera o conteúdo a partir do texto extraído do TR. */
export async function gerarConteudoProposta(
  trTexto: string,
  contextoAchados?: string
): Promise<ConteudoProposta> {
  const resposta = await getClient().messages.create({
    model: MODELO,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: "user", content: montarPrompt(trTexto, contextoAchados) }],
  });
  const bloco = resposta.content[0];
  if (bloco.type !== "text") throw new Error("Resposta inesperada da IA.");
  return extrairJson(bloco.text);
}

/** Fallback para PDF escaneado: a IA lê o PDF nativamente (OCR). */
export async function gerarConteudoPropostaViaPDF(
  pdf: Buffer,
  contextoAchados?: string
): Promise<ConteudoProposta> {
  const resposta = await getClient().messages.create({
    model: MODELO,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") },
          },
          {
            type: "text",
            text: montarPrompt(
              "(o TR está no documento PDF anexado — leia-o integralmente)",
              contextoAchados
            ),
          },
        ],
      },
    ],
  });
  const bloco = resposta.content[0];
  if (bloco.type !== "text") throw new Error("Resposta inesperada da IA.");
  return extrairJson(bloco.text);
}

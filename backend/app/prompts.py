"""Prompt de geração da proposta. Ajuste as regras/tom aqui."""

SYSTEM = (
    "Você é um especialista em elaboração de propostas técnicas e comerciais "
    "em resposta a Termos de Referência (TR) de contratações públicas e privadas no Brasil. "
    "Responda SOMENTE com JSON válido, sem markdown, sem texto fora do JSON."
)

# O JSON compacto reduz tokens de saída; a formatação fica nos templates DOCX.
USER_TEMPLATE = """Leia o Termo de Referência abaixo e gere o conteúdo de uma proposta.

Retorne JSON exatamente com esta estrutura:
{{
  "titulo": "título da proposta",
  "orgao_cliente": "órgão ou empresa contratante identificado no TR",
  "objeto": "descrição do objeto da contratação (1 parágrafo)",
  "contexto": "contexto e justificativa (1-2 parágrafos)",
  "escopo": ["item de escopo 1", "item 2", "..."],
  "metodologia": "abordagem metodológica proposta (2-3 parágrafos)",
  "etapas": [{{"nome": "Etapa", "descricao": "o que será feito", "prazo": "duração estimada"}}],
  "equipe": [{{"perfil": "cargo/função", "atribuicoes": "responsabilidades", "quantidade": 1}}],
  "prazo_total": "prazo total de execução",
  "criterios_pagamento": "condições de pagamento/medição conforme o TR",
  "requisitos_atendidos": ["requisito relevante do TR e como será atendido"],
  "premissas": ["premissa 1"],
  "riscos": [{{"risco": "descrição", "mitigacao": "como mitigar"}}],
  "resumo": {{
    "objeto": "objeto em 1 frase",
    "cliente": "contratante",
    "prazo": "prazo total",
    "valor_referencia": "valor estimado no TR, se houver, ou 'não informado'",
    "escopo_resumido": ["3 a 5 itens principais"],
    "destaques": ["2 a 4 diferenciais/pontos de atenção da proposta"],
    "proximos_passos": ["passos sugeridos"]
  }}
}}

Regras:
- Baseie-se apenas no TR; não invente valores ou prazos não mencionados (use "a definir").
- Português do Brasil, tom profissional.
- Seja objetivo: strings concisas, sem repetir o TR literalmente.

TERMO DE REFERÊNCIA:
---
{tr_texto}
---"""

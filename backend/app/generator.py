"""Geração híbrida: 1 chamada à API do Claude retornando JSON estruturado."""
import json
import os

from anthropic import Anthropic

from . import prompts

_client: Anthropic | None = None


def _get_client() -> Anthropic:
    global _client
    if _client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("Defina ANTHROPIC_API_KEY no arquivo backend/.env")
        _client = Anthropic(api_key=api_key)
    return _client


def gerar_conteudo(tr_texto: str) -> dict:
    """Envia o texto do TR e retorna o dict com o conteúdo da proposta e do resumo."""
    modelo = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5")
    resposta = _get_client().messages.create(
        model=modelo,
        max_tokens=8000,
        system=prompts.SYSTEM,
        messages=[{"role": "user", "content": prompts.USER_TEMPLATE.format(tr_texto=tr_texto)}],
    )
    texto = resposta.content[0].text.strip()
    # tolera cercas de código caso o modelo as inclua
    if texto.startswith("```"):
        texto = texto.strip("`")
        texto = texto[texto.index("{"):texto.rindex("}") + 1]
    dados = json.loads(texto)
    dados["_uso_tokens"] = {
        "entrada": resposta.usage.input_tokens,
        "saida": resposta.usage.output_tokens,
    }
    return dados

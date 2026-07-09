"""Geração híbrida: 1 chamada à API do Claude (Anthropic) retornando JSON estruturado."""
import base64
import json
import os
import time
from pathlib import Path

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
    conteudo = prompts.USER_TEMPLATE.format(tr_texto=tr_texto)
    return _gerar([{"role": "user", "content": conteudo}])


def gerar_conteudo_pdf(caminho_pdf) -> dict:
    """PDF digitalizado: envia o arquivo direto ao Claude, que lê as páginas nativamente.

    Usado somente quando não há texto extraível — economia de tokens.
    """
    dados_b64 = base64.standard_b64encode(Path(caminho_pdf).read_bytes()).decode()
    conteudo = [
        {
            "type": "document",
            "source": {"type": "base64", "media_type": "application/pdf", "data": dados_b64},
        },
        {"type": "text", "text": prompts.USER_TEMPLATE_PDF},
    ]
    return _gerar([{"role": "user", "content": conteudo}])


def _chamar(messages, modelo: str):
    return _get_client().messages.create(
        model=modelo,
        max_tokens=8000,
        system=prompts.SYSTEM,
        messages=messages,
    )


_ERROS_TEMPORARIOS = ("429", "500", "529", "overloaded", "rate_limit", "api_error", "timeout")


def _gerar(messages) -> dict:
    modelo = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5")
    fallback = os.getenv("ANTHROPIC_MODEL_FALLBACK", "claude-haiku-4-5")
    resposta = None
    ultimo_erro = None
    # 3 tentativas com espera progressiva; erros de sobrecarga/limite são temporários
    for espera in (0, 5, 15):
        if espera:
            time.sleep(espera)
        try:
            resposta = _chamar(messages, modelo)
            break
        except Exception as e:  # noqa: BLE001
            ultimo_erro = e
            if not any(cod in str(e).lower() for cod in _ERROS_TEMPORARIOS):
                raise
    if resposta is None and fallback and fallback != modelo:
        try:
            resposta = _chamar(messages, fallback)
        except Exception:  # noqa: BLE001
            raise ultimo_erro
    if resposta is None:
        raise ultimo_erro

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

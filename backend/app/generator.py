"""Geração híbrida: 1 chamada à API do Gemini retornando JSON estruturado."""
import json
import os

from google import genai
from google.genai import types

from . import prompts

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("Defina GEMINI_API_KEY no arquivo backend/.env")
        _client = genai.Client(api_key=api_key)
    return _client


def gerar_conteudo(tr_texto: str) -> dict:
    """Envia o texto do TR e retorna o dict com o conteúdo da proposta e do resumo."""
    return _gerar(prompts.USER_TEMPLATE.format(tr_texto=tr_texto))


def gerar_conteudo_pdf(caminho_pdf) -> dict:
    """PDF digitalizado: envia o arquivo direto ao Gemini, que faz o OCR nativamente.

    Custa ~258 tokens/página — usado somente quando não há texto extraível.
    """
    from pathlib import Path

    parte_pdf = types.Part.from_bytes(
        data=Path(caminho_pdf).read_bytes(), mime_type="application/pdf"
    )
    return _gerar([parte_pdf, prompts.USER_TEMPLATE_PDF])


def _chamar(contents, modelo: str):
    return _get_client().models.generate_content(
        model=modelo,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=prompts.SYSTEM,
            max_output_tokens=16384,
            response_mime_type="application/json",
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )


def _gerar(contents) -> dict:
    import time

    modelo = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    fallback = os.getenv("GEMINI_MODEL_FALLBACK", "gemini-2.0-flash")
    resposta = None
    ultimo_erro = None
    # 3 tentativas com espera progressiva; erros 503/429 são temporários
    for tentativa, espera in enumerate((0, 5, 15)):
        if espera:
            time.sleep(espera)
        try:
            resposta = _chamar(contents, modelo)
            break
        except Exception as e:  # noqa: BLE001
            ultimo_erro = e
            if not any(cod in str(e) for cod in ("503", "429", "UNAVAILABLE", "RESOURCE_EXHAUSTED")):
                raise
    if resposta is None and fallback and fallback != modelo:
        try:
            resposta = _chamar(contents, fallback)
        except Exception:  # noqa: BLE001
            raise ultimo_erro
    if resposta is None:
        raise ultimo_erro
    texto = (resposta.text or "").strip()
    # tolera cercas de código caso o modelo as inclua
    if texto.startswith("```"):
        texto = texto.strip("`")
        texto = texto[texto.index("{"):texto.rindex("}") + 1]
    dados = json.loads(texto)
    uso = resposta.usage_metadata
    dados["_uso_tokens"] = {
        "entrada": uso.prompt_token_count if uso else 0,
        "saida": uso.candidates_token_count if uso else 0,
    }
    return dados

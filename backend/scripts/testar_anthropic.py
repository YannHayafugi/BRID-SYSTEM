"""Teste rápido de conexão com a API da Anthropic (Claude).

Uso:  python backend/scripts/testar_anthropic.py
Lê ANTHROPIC_API_KEY e ANTHROPIC_MODEL do backend/.env.
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

api_key = os.getenv("ANTHROPIC_API_KEY")
modelo = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5")

if not api_key:
    sys.exit("ERRO: ANTHROPIC_API_KEY não encontrada no backend/.env")

print(f"Chave encontrada (final ...{api_key[-4:]})")
print(f"Modelo: {modelo}")

try:
    from anthropic import Anthropic
except ImportError:
    sys.exit("ERRO: SDK não instalado. Rode: python -m pip install anthropic")

try:
    client = Anthropic(api_key=api_key)
    resp = client.messages.create(
        model=modelo, max_tokens=20,
        messages=[{"role": "user", "content": "Responda apenas: OK"}],
    )
    print(f"Resposta da API: {resp.content[0].text.strip()}")
    print("✅ Conexão com a Anthropic funcionando!")
except Exception as e:  # noqa: BLE001
    print(f"❌ Falha na conexão: {e}")
    sys.exit(1)

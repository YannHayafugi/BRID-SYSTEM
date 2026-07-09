"""Teste rápido de conexão com a API do Gemini.

Uso:  python backend/scripts/testar_gemini.py
Lê GEMINI_API_KEY e GEMINI_MODEL do backend/.env.
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

api_key = os.getenv("GEMINI_API_KEY")
modelo = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

if not api_key:
    sys.exit("ERRO: GEMINI_API_KEY não encontrada no backend/.env")

print(f"Chave encontrada (final ...{api_key[-4:]})")
print(f"Modelo: {modelo}")

try:
    from google import genai
except ImportError:
    sys.exit("ERRO: SDK não instalado. Rode: python -m pip install google-genai")

try:
    client = genai.Client(api_key=api_key)
    resp = client.models.generate_content(model=modelo, contents="Responda apenas: OK")
    print(f"Resposta da API: {resp.text.strip()}")
    print("✅ Conexão com o Gemini funcionando!")
except Exception as e:  # noqa: BLE001
    print(f"❌ Falha na conexão: {e}")
    sys.exit(1)

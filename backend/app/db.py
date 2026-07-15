"""Persistência no Supabase: tabela gp_propostas + bucket gp-arquivos.

Variáveis de ambiente necessárias:
  SUPABASE_URL                ex.: https://xyngrzennrozwcpgxmmm.supabase.co
  SUPABASE_SERVICE_ROLE_KEY   chave service_role (Settings → API Keys)
"""
import os

from supabase import create_client

TABELA = "gp_propostas"
BUCKET = "gp-arquivos"

_client = None


def _cli():
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError(
                "Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente."
            )
        _client = create_client(url, key)
    return _client


# ---------- tabela ----------

def salvar_proposta(registro: dict):
    _cli().table(TABELA).insert(registro).execute()


def listar_propostas() -> list[dict]:
    return _cli().table(TABELA).select("*").order("data", desc=True).execute().data


def obter_proposta(job_id: str) -> dict | None:
    rows = _cli().table(TABELA).select("*").eq("job_id", job_id).execute().data
    return rows[0] if rows else None


def atualizar_proposta(job_id: str, campos: dict):
    _cli().table(TABELA).update(campos).eq("job_id", job_id).execute()


# ---------- storage ----------

def upload_arquivo(caminho: str, conteudo: bytes, content_type: str = "application/octet-stream"):
    _cli().storage.from_(BUCKET).upload(
        caminho, conteudo, {"content-type": content_type, "upsert": "true"}
    )


def baixar_arquivo(caminho: str) -> bytes:
    return _cli().storage.from_(BUCKET).download(caminho)

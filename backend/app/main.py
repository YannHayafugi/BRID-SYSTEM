"""API REST: upload do TR → geração → download da Proposta e do Resumo."""
import os
import shutil
import tempfile
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import extractor, generator, renderer

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

app = FastAPI(title="Gerador de Propostas")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "output"


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/gerar")
async def gerar(arquivo: UploadFile, senha: str = Form("")):
    senha_esperada = os.getenv("APP_SENHA", "")
    if senha_esperada and senha != senha_esperada:
        raise HTTPException(401, "Senha de acesso incorreta.")

    ext = Path(arquivo.filename or "tr.pdf").suffix.lower()
    if ext not in (".pdf", ".docx", ".txt", ".md"):
        raise HTTPException(400, "Envie um TR em PDF, DOCX ou TXT.")

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        shutil.copyfileobj(arquivo.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        texto = extractor.extrair_texto(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)

    if len(texto.strip()) < 100:
        raise HTTPException(422, "Não foi possível extrair texto suficiente do arquivo "
                                 "(PDF escaneado? Considere aplicar OCR antes).")

    max_chars = int(os.getenv("MAX_TR_CHARS", "60000"))
    texto = extractor.limpar_texto(texto, max_chars)

    try:
        dados = generator.gerar_conteudo(texto)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Falha na geração via IA: {e}") from e

    job_id = uuid.uuid4().hex[:12]
    docs = renderer.gerar_documentos(dados, OUTPUT_DIR / job_id)

    return {
        "job_id": job_id,
        "titulo": dados.get("titulo"),
        "resumo": dados.get("resumo"),
        "uso_tokens": dados.get("_uso_tokens"),
        "downloads": {nome: f"/api/download/{job_id}/{nome}" for nome in docs},
    }


@app.get("/api/download/{job_id}/{doc}")
def download(job_id: str, doc: str):
    nomes = {"proposta": "Proposta.docx", "resumo": "Resumo.docx"}
    if doc not in nomes or not job_id.isalnum():
        raise HTTPException(404, "Documento não encontrado.")
    caminho = OUTPUT_DIR / job_id / nomes[doc]
    if not caminho.exists():
        raise HTTPException(404, "Documento não encontrado.")
    return FileResponse(
        caminho,
        filename=nomes[doc],
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


# Em produção, o FastAPI serve o frontend buildado (mesma origem, sem CORS).
_front_dist = Path(os.getenv("FRONT_DIST", Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"))
if _front_dist.exists():
    app.mount("/", StaticFiles(directory=str(_front_dist), html=True), name="site")

"""API REST: login, upload do TR, geração, histórico e downloads."""
import json
import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import extractor, generator, renderer

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

app = FastAPI(title="Gerador de Propostas")
# Módulo de ofícios (isolado): se falhar ao carregar, o resto do app segue no ar.
try:
    from .oficio import router as oficio_router
    app.include_router(oficio_router)
except Exception as _e:  # noqa: BLE001
    print(f"[aviso] módulo de ofícios não carregado: {_e}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", str(Path(__file__).resolve().parent.parent / "output")))
DOCS = {"proposta": "Proposta.docx", "resumo": "Resumo.docx"}


def _senha_ok(senha: str) -> bool:
    esperada = os.getenv("APP_SENHA", "")
    return not esperada or senha == esperada


def _exigir_senha(x_senha: str | None):
    if not _senha_ok(x_senha or ""):
        raise HTTPException(401, "Não autorizado. Faça login novamente.")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/login")
def login(senha: str = Form("")):
    if not _senha_ok(senha):
        raise HTTPException(401, "Senha incorreta.")
    return {"ok": True}


@app.post("/api/gerar")
async def gerar(arquivo: UploadFile, senha: str = Form("")):
    _exigir_senha(senha)

    nome_original = arquivo.filename or "tr.pdf"
    ext = Path(nome_original).suffix.lower()
    if ext not in (".pdf", ".docx", ".txt", ".md"):
        raise HTTPException(400, "Envie um TR em PDF, DOCX ou TXT.")

    job_id = uuid.uuid4().hex[:12]
    pasta = OUTPUT_DIR / job_id
    pasta.mkdir(parents=True, exist_ok=True)

    # guarda o TR enviado (aba "Arquivos Enviados")
    tr_path = pasta / f"TR{ext}"
    with tr_path.open("wb") as destino:
        shutil.copyfileobj(arquivo.file, destino)

    # Decide automaticamente: texto extraível → extração local (0 tokens extras);
    # PDF digitalizado → envia o PDF ao Gemini, que faz OCR (~258 tokens/página).
    usar_pdf_nativo = False
    if ext == ".pdf":
        info = extractor.analisar_pdf(tr_path)
        texto = info["texto"]
        if extractor.precisa_ocr(info):
            max_paginas = int(os.getenv("MAX_PDF_PAGINAS", "100"))
            if info["total_paginas"] > max_paginas:
                shutil.rmtree(pasta, ignore_errors=True)
                raise HTTPException(422, f"PDF digitalizado com {info['total_paginas']} páginas "
                                         f"excede o limite de {max_paginas}. Divida o arquivo.")
            usar_pdf_nativo = True
    else:
        texto = extractor.extrair_texto(tr_path)

    if not usar_pdf_nativo:
        if len(texto.strip()) < 100:
            shutil.rmtree(pasta, ignore_errors=True)
            raise HTTPException(422, "Não foi possível extrair texto suficiente do arquivo.")
        max_chars = int(os.getenv("MAX_TR_CHARS", "60000"))
        texto = extractor.limpar_texto(texto, max_chars)

    try:
        if usar_pdf_nativo:
            dados = generator.gerar_conteudo_pdf(tr_path)
        else:
            dados = generator.gerar_conteudo(texto)
    except Exception as e:  # noqa: BLE001
        shutil.rmtree(pasta, ignore_errors=True)
        raise HTTPException(502, f"Falha na geração via IA: {e}") from e

    renderer.gerar_documentos(dados, pasta)

    meta = {
        "job_id": job_id,
        "titulo": dados.get("titulo") or "Proposta sem título",
        "cliente": (dados.get("resumo") or {}).get("cliente", ""),
        "data": datetime.now().isoformat(timespec="seconds"),
        "tr_nome": nome_original,
        "tr_arquivo": tr_path.name,
    }
    (pasta / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")

    return {
        "job_id": job_id,
        "titulo": meta["titulo"],
        "resumo": dados.get("resumo"),
        "uso_tokens": dados.get("_uso_tokens"),
        "downloads": {nome: f"/api/download/{job_id}/{nome}" for nome in DOCS},
    }


@app.get("/api/propostas")
def listar_propostas(x_senha: str | None = Header(default=None)):
    _exigir_senha(x_senha)
    itens = []
    if OUTPUT_DIR.exists():
        for pasta in OUTPUT_DIR.iterdir():
            meta_path = pasta / "meta.json"
            if not meta_path.exists():
                continue
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            job_id = meta["job_id"]
            itens.append({
                **meta,
                "tr_url": f"/api/download-tr/{job_id}",
                "downloads": {nome: f"/api/download/{job_id}/{nome}"
                              for nome in DOCS if (pasta / DOCS[nome]).exists()},
            })
    itens.sort(key=lambda i: i["data"], reverse=True)
    return {"propostas": itens}


@app.get("/api/download/{job_id}/{doc}")
def download(job_id: str, doc: str):
    if doc not in DOCS or not job_id.isalnum():
        raise HTTPException(404, "Documento não encontrado.")
    caminho = OUTPUT_DIR / job_id / DOCS[doc]
    if not caminho.exists():
        raise HTTPException(404, "Documento não encontrado.")
    meta = json.loads((OUTPUT_DIR / job_id / "meta.json").read_text(encoding="utf-8"))
    prefixo = "Proposta" if doc == "proposta" else "Resumo"
    return FileResponse(
        caminho,
        filename=f"{prefixo} - {meta.get('titulo', job_id)[:60]}.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@app.get("/api/download-tr/{job_id}")
def download_tr(job_id: str):
    if not job_id.isalnum():
        raise HTTPException(404, "Arquivo não encontrado.")
    pasta = OUTPUT_DIR / job_id
    meta_path = pasta / "meta.json"
    if not meta_path.exists():
        raise HTTPException(404, "Arquivo não encontrado.")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    caminho = pasta / meta["tr_arquivo"]
    if not caminho.exists():
        raise HTTPException(404, "Arquivo não encontrado.")
    return FileResponse(caminho, filename=meta["tr_nome"])


# Em produção, o FastAPI serve o frontend buildado (mesma origem, sem CORS).
_front_dist = Path(os.getenv("FRONT_DIST", Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"))
if _front_dist.exists():
    app.mount("/", StaticFiles(directory=str(_front_dist), html=True), name="site")

"""API REST: login, upload do TR, geração, histórico e downloads.

Persistência no Supabase (tabela gp_propostas + bucket gp-arquivos):
sobrevive a deploys e funciona em serverless (Vercel) e em servidor (Render).
"""
import os
import shutil
import tempfile
import unicodedata
import uuid
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from . import db, extractor, generator, renderer

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

DOCS = {"proposta": "Proposta.docx", "resumo": "Resumo.docx"}
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

# Macrofases do fluxo de projetos públicos (Fluxograma Macro)
# tipo "auto": etapa coberta pela automação de documentos do sistema
# tipo "manual": etapa conduzida fora do sistema (contrato, execução, faturamento)
ETAPAS_FLUXO = [
    {"nome": "Abertura do processo (Ofício)", "tipo": "auto"},
    {"nome": "TR/ETP recebido e validado", "tipo": "auto"},
    {"nome": "Proposta (elaboração e envio)", "tipo": "auto"},
    {"nome": "Contrato assinado", "tipo": "manual"},
    {"nome": "Kick-off realizado", "tipo": "manual"},
    {"nome": "Em execução (dados e serviços)", "tipo": "manual"},
    {"nome": "Relatório em validação", "tipo": "manual"},
    {"nome": "Aprovado / Faturamento", "tipo": "manual"},
]

# Documentos essenciais do follow-up anexáveis manualmente
DOCS_FOLLOWUP = ("oficio",)


def _senha_ok(senha: str) -> bool:
    esperada = os.getenv("APP_SENHA", "")
    return not esperada or senha == esperada


def _exigir_senha(x_senha: str | None):
    if not _senha_ok(x_senha or ""):
        raise HTTPException(401, "Não autorizado. Faça login novamente.")


def _nome_download(nome: str) -> str:
    """Remove acentos/caracteres inválidos para o cabeçalho Content-Disposition."""
    ascii_ = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    return ascii_.replace('"', "").strip() or "documento"


def _obter_ou_404(job_id: str) -> dict:
    if not job_id.isalnum():
        raise HTTPException(404, "Proposta não encontrada.")
    registro = db.obter_proposta(job_id)
    if registro is None:
        raise HTTPException(404, "Proposta não encontrada.")
    return registro


@app.exception_handler(Exception)
async def _erro_nao_tratado(request, exc):
    """Garante resposta JSON mesmo em erros inesperados (o frontend espera JSON)."""
    return JSONResponse(status_code=500, content={"detail": f"Erro interno: {exc}"})


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/login")
def login(senha: str = Form("")):
    if not _senha_ok(senha):
        raise HTTPException(401, "Senha incorreta.")
    return {"ok": True}


def _analisar_tr(tr_path: Path, ext: str) -> dict:
    """Motor de geração: extrai o texto do TR (ou usa OCR nativo) e chama a IA.

    Reutilizado pelo Gerador de Proposta e pelo botão 'Gerar Proposta' do Follow-up.
    """
    # Decide automaticamente: texto extraível → extração local (0 tokens extras);
    # PDF digitalizado → envia o PDF à IA, que lê as páginas nativamente (OCR).
    usar_pdf_nativo = False
    if ext == ".pdf":
        try:
            info = extractor.analisar_pdf(tr_path)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(422, f"Não foi possível ler o PDF: {e}") from e
        texto = info["texto"]
        if extractor.precisa_ocr(info):
            max_paginas = int(os.getenv("MAX_PDF_PAGINAS", "100"))
            if info["total_paginas"] > max_paginas:
                raise HTTPException(422, f"PDF digitalizado com {info['total_paginas']} páginas "
                                         f"excede o limite de {max_paginas}. Divida o arquivo.")
            usar_pdf_nativo = True
    else:
        texto = extractor.extrair_texto(tr_path)

    if not usar_pdf_nativo:
        if len(texto.strip()) < 100:
            raise HTTPException(422, "Não foi possível extrair texto suficiente do arquivo.")
        max_chars = int(os.getenv("MAX_TR_CHARS", "60000"))
        texto = extractor.limpar_texto(texto, max_chars)

    try:
        if usar_pdf_nativo:
            return generator.gerar_conteudo_pdf(tr_path)
        return generator.gerar_conteudo(texto)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Falha na geração via IA: {e}") from e


@app.post("/api/gerar")
async def gerar(arquivo: UploadFile, senha: str = Form("")):
    _exigir_senha(senha)

    nome_original = arquivo.filename or "tr.pdf"
    ext = Path(nome_original).suffix.lower()
    if ext not in (".pdf", ".docx", ".txt", ".md"):
        raise HTTPException(400, "Envie um TR em PDF, DOCX ou TXT.")

    job_id = uuid.uuid4().hex[:12]

    with tempfile.TemporaryDirectory() as tmp:
        pasta = Path(tmp)
        tr_path = pasta / f"TR{ext}"
        with tr_path.open("wb") as destino:
            shutil.copyfileobj(arquivo.file, destino)

        dados = _analisar_tr(tr_path, ext)

        try:
            docs = renderer.gerar_documentos(dados, pasta)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(500, f"Falha ao montar os documentos DOCX: {e}") from e

        # Sobe tudo para o Supabase Storage (persistente entre deploys)
        try:
            arquivos = {"tr": f"{job_id}/TR{ext}"}
            db.upload_arquivo(arquivos["tr"], tr_path.read_bytes(), "application/pdf" if ext == ".pdf" else "application/octet-stream")
            for nome, caminho in docs.items():
                arquivos[nome] = f"{job_id}/{DOCS[nome]}"
                db.upload_arquivo(arquivos[nome], Path(caminho).read_bytes(), DOCX_MIME)

            registro = {
                "job_id": job_id,
                "titulo": dados.get("titulo") or "Proposta sem título",
                "cliente": (dados.get("resumo") or {}).get("cliente", ""),
                "data": datetime.now().isoformat(timespec="seconds"),
                "tr_nome": nome_original,
                "etapa": 2,
                "documentos": {},
                "arquivos": arquivos,
            }
            db.salvar_proposta(registro)
        except HTTPException:
            raise
        except Exception as e:  # noqa: BLE001
            raise HTTPException(500, f"Falha ao salvar no banco/storage: {e}") from e

    return {
        "job_id": job_id,
        "titulo": registro["titulo"],
        "resumo": dados.get("resumo"),
        "uso_tokens": dados.get("_uso_tokens"),
        "downloads": {nome: f"/api/download/{job_id}/{nome}" for nome in DOCS},
    }


@app.post("/api/projetos")
async def criar_projeto(titulo: str = Form(...), cliente: str = Form(""),
                        senha: str = Form(""), oficio_id: str = Form(""),
                        arquivo: UploadFile | None = File(None)):
    """Abre um processo no Follow-up a partir do Ofício, antes de existir TR/proposta."""
    _exigir_senha(senha)
    if not titulo.strip():
        raise HTTPException(400, "Informe o título do processo.")

    job_id = uuid.uuid4().hex[:12]
    documentos = {}
    if oficio_id.strip():
        # vincula um ofício já gerado pelo sistema (drop do Follow-up)
        reg_oficio = db.obter_oficio(oficio_id.strip())
        if reg_oficio is None:
            raise HTTPException(404, "Ofício selecionado não encontrado.")
        documentos["oficio"] = {
            "nome": Path(reg_oficio["arquivo"]).name,
            "arquivo": reg_oficio["arquivo"],
            "data": reg_oficio["data"],
        }
    elif arquivo and arquivo.filename:
        ext = Path(arquivo.filename).suffix.lower()
        if ext not in (".pdf", ".docx", ".doc", ".txt", ".png", ".jpg", ".jpeg"):
            raise HTTPException(400, "Formato do ofício não suportado.")
        caminho = f"{job_id}/DOC_oficio{ext}"
        db.upload_arquivo(caminho, await arquivo.read())
        documentos["oficio"] = {"nome": arquivo.filename, "arquivo": caminho,
                                "data": datetime.now().isoformat(timespec="seconds")}

    db.salvar_proposta({
        "job_id": job_id,
        "titulo": titulo.strip(),
        "cliente": cliente.strip(),
        "data": datetime.now().isoformat(timespec="seconds"),
        "tr_nome": None,
        "etapa": 0,
        "documentos": documentos,
        "arquivos": {},
    })
    if oficio_id.strip():
        try:
            db.atualizar_oficio(oficio_id.strip(), {"job_id": job_id})  # some do drop
        except Exception as e:  # noqa: BLE001
            print(f"[aviso] não foi possível vincular o ofício: {e}")
    return {"ok": True, "job_id": job_id, "etapa": 0, "nome": ETAPAS_FLUXO[0]["nome"]}


@app.delete("/api/projetos/{job_id}")
def excluir_projeto(job_id: str, x_senha: str | None = Header(default=None)):
    """Exclui o processo, seus arquivos gerados e anexos exclusivos.

    Ofícios do catálogo (gp_oficios, caminhos 'oficios/...') são compartilhados
    e permanecem disponíveis para outros processos.
    """
    _exigir_senha(x_senha)
    registro = _obter_ou_404(job_id)

    caminhos = list((registro.get("arquivos") or {}).values())
    for info in (registro.get("documentos") or {}).values():
        caminho = info.get("arquivo", "")
        if caminho.startswith(f"{job_id}/"):
            caminhos.append(caminho)
    try:
        db.remover_arquivos(caminhos)
    except Exception as e:  # noqa: BLE001
        print(f"[aviso] arquivos do processo {job_id} não removidos do storage: {e}")

    try:
        db.desvincular_oficios(job_id)  # ofício volta ao drop do Follow-up
    except Exception as e:  # noqa: BLE001
        print(f"[aviso] ofícios do processo {job_id} não desvinculados: {e}")

    db.deletar_proposta(job_id)
    return {"ok": True}


@app.get("/api/propostas")
def listar_propostas(x_senha: str | None = Header(default=None)):
    _exigir_senha(x_senha)
    itens = []
    for r in db.listar_propostas():
        job_id = r["job_id"]
        arquivos = r.get("arquivos") or {}
        itens.append({
            "job_id": job_id,
            "titulo": r["titulo"],
            "cliente": r.get("cliente", ""),
            "data": r["data"],
            "tr_nome": r.get("tr_nome") or "",
            "followup": {"etapa": r.get("etapa", 2), "documentos": r.get("documentos") or {}},
            "tr_url": f"/api/download-tr/{job_id}" if arquivos.get("tr") else None,
            "downloads": {nome: f"/api/download/{job_id}/{nome}"
                          for nome in DOCS if arquivos.get(nome)},
        })
    return {"propostas": itens, "etapas": ETAPAS_FLUXO}


@app.get("/api/download/{job_id}/{doc}")
def download(job_id: str, doc: str):
    if doc not in DOCS:
        raise HTTPException(404, "Documento não encontrado.")
    registro = _obter_ou_404(job_id)
    caminho = (registro.get("arquivos") or {}).get(doc)
    if not caminho:
        raise HTTPException(404, "Documento não encontrado.")
    conteudo = db.baixar_arquivo(caminho)
    prefixo = "Proposta" if doc == "proposta" else "Resumo"
    nome = _nome_download(f"{prefixo} - {registro.get('titulo', job_id)[:60]}.docx")
    return Response(conteudo, media_type=DOCX_MIME,
                    headers={"Content-Disposition": f'attachment; filename="{nome}"'})


@app.get("/api/download-tr/{job_id}")
def download_tr(job_id: str):
    registro = _obter_ou_404(job_id)
    caminho = (registro.get("arquivos") or {}).get("tr")
    if not caminho:
        raise HTTPException(404, "Arquivo não encontrado.")
    conteudo = db.baixar_arquivo(caminho)
    nome = _nome_download(registro.get("tr_nome") or "TR.pdf")
    return Response(conteudo, media_type="application/octet-stream",
                    headers={"Content-Disposition": f'attachment; filename="{nome}"'})


@app.post("/api/followup/{job_id}/tr")
async def enviar_tr(job_id: str, arquivo: UploadFile, senha: str = Form("")):
    """Anexa o TR ao processo existente (status 'pendente' → 'enviado')."""
    _exigir_senha(senha)
    registro = _obter_ou_404(job_id)

    nome_original = arquivo.filename or "tr.pdf"
    ext = Path(nome_original).suffix.lower()
    if ext not in (".pdf", ".docx", ".txt", ".md"):
        raise HTTPException(400, "Envie um TR em PDF, DOCX ou TXT.")

    caminho = f"{job_id}/TR{ext}"
    db.upload_arquivo(caminho, await arquivo.read(),
                      "application/pdf" if ext == ".pdf" else "application/octet-stream")

    arquivos = registro.get("arquivos") or {}
    arquivos["tr"] = caminho
    campos = {"arquivos": arquivos, "tr_nome": nome_original}
    if registro.get("etapa", 0) < 1:
        campos["etapa"] = 1  # avança para "TR/ETP recebido e validado"
    db.atualizar_proposta(job_id, campos)
    return {"ok": True, "tr_url": f"/api/download-tr/{job_id}"}


@app.post("/api/followup/{job_id}/gerar")
async def gerar_no_processo(job_id: str, senha: str = Form("")):
    """Gera Proposta e Resumo dentro do processo, usando o TR já enviado.

    Mantém o título e o cliente do processo (identidade vem do ofício).
    """
    _exigir_senha(senha)
    registro = _obter_ou_404(job_id)
    arquivos = registro.get("arquivos") or {}
    caminho_tr = arquivos.get("tr")
    if not caminho_tr:
        raise HTTPException(400, "Envie o TR do processo antes de gerar a proposta.")

    ext = Path(caminho_tr).suffix.lower()
    with tempfile.TemporaryDirectory() as tmp:
        pasta = Path(tmp)
        tr_path = pasta / f"TR{ext}"
        tr_path.write_bytes(db.baixar_arquivo(caminho_tr))

        dados = _analisar_tr(tr_path, ext)

        try:
            docs = renderer.gerar_documentos(dados, pasta)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(500, f"Falha ao montar os documentos DOCX: {e}") from e

        try:
            for nome, caminho in docs.items():
                arquivos[nome] = f"{job_id}/{DOCS[nome]}"
                db.upload_arquivo(arquivos[nome], Path(caminho).read_bytes(), DOCX_MIME)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(500, f"Falha ao salvar no storage: {e}") from e

    campos = {"arquivos": arquivos}
    if registro.get("etapa", 0) < 2:
        campos["etapa"] = 2  # avança para "Proposta em elaboração"
    if not registro.get("cliente"):
        campos["cliente"] = (dados.get("resumo") or {}).get("cliente", "")
    db.atualizar_proposta(job_id, campos)

    return {
        "ok": True,
        "resumo": dados.get("resumo"),
        "uso_tokens": dados.get("_uso_tokens"),
        "downloads": {nome: f"/api/download/{job_id}/{nome}" for nome in DOCS},
    }


@app.post("/api/followup/{job_id}/etapa")
def atualizar_etapa(job_id: str, etapa: int = Form(...), senha: str = Form("")):
    _exigir_senha(senha)
    _obter_ou_404(job_id)
    if not 0 <= etapa < len(ETAPAS_FLUXO):
        raise HTTPException(400, "Etapa inválida.")
    db.atualizar_proposta(job_id, {"etapa": etapa})
    return {"ok": True, "etapa": etapa, "nome": ETAPAS_FLUXO[etapa]["nome"]}


@app.post("/api/followup/{job_id}/documento")
async def anexar_documento(job_id: str, arquivo: UploadFile,
                           tipo: str = Form(...), senha: str = Form("")):
    _exigir_senha(senha)
    if tipo not in DOCS_FOLLOWUP:
        raise HTTPException(400, f"Tipo inválido. Use: {', '.join(DOCS_FOLLOWUP)}.")
    registro = _obter_ou_404(job_id)

    nome_original = arquivo.filename or f"{tipo}.pdf"
    ext = Path(nome_original).suffix.lower()
    if ext not in (".pdf", ".docx", ".doc", ".txt", ".png", ".jpg", ".jpeg"):
        raise HTTPException(400, "Formato não suportado.")

    caminho = f"{job_id}/DOC_{tipo}{ext}"
    db.upload_arquivo(caminho, await arquivo.read())

    documentos = registro.get("documentos") or {}
    documentos[tipo] = {"nome": nome_original, "arquivo": caminho,
                        "data": datetime.now().isoformat(timespec="seconds")}
    db.atualizar_proposta(job_id, {"documentos": documentos})
    return {"ok": True, "url": f"/api/download-doc/{job_id}/{tipo}"}


@app.get("/api/download-doc/{job_id}/{tipo}")
def download_doc(job_id: str, tipo: str):
    if tipo not in DOCS_FOLLOWUP:
        raise HTTPException(404, "Documento não encontrado.")
    registro = _obter_ou_404(job_id)
    info = (registro.get("documentos") or {}).get(tipo)
    if not info:
        raise HTTPException(404, "Documento não encontrado.")
    conteudo = db.baixar_arquivo(info["arquivo"])
    nome = _nome_download(info["nome"])
    return Response(conteudo, media_type="application/octet-stream",
                    headers={"Content-Disposition": f'attachment; filename="{nome}"'})


# Em produção, o FastAPI serve o frontend buildado (mesma origem, sem CORS).
_front_dist = Path(os.getenv("FRONT_DIST", Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"))
if _front_dist.exists():
    app.mount("/", StaticFiles(directory=str(_front_dist), html=True), name="site")

"""Renderização local dos DOCX a partir dos templates (docxtpl)."""
from datetime import date
from pathlib import Path

from docxtpl import DocxTemplate

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"


def _render(template: str, contexto: dict, destino: Path) -> Path:
    doc = DocxTemplate(str(TEMPLATES_DIR / template))
    doc.render(contexto)
    destino.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(destino))
    return destino


def gerar_documentos(dados: dict, pasta_saida: Path) -> dict[str, Path]:
    contexto = {**dados, "data_emissao": date.today().strftime("%d/%m/%Y")}
    proposta = _render("proposta.docx", contexto, pasta_saida / "Proposta.docx")
    resumo_ctx = {**dados.get("resumo", {}), "titulo": dados.get("titulo", ""),
                  "data_emissao": contexto["data_emissao"]}
    resumo = _render("resumo.docx", resumo_ctx, pasta_saida / "Resumo.docx")
    return {"proposta": proposta, "resumo": resumo}

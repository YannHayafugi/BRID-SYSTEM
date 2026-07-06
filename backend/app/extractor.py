"""Extração local de texto do Termo de Referência (PDF, DOCX ou TXT)."""
from pathlib import Path


def extrair_texto(caminho: str | Path) -> str:
    caminho = Path(caminho)
    ext = caminho.suffix.lower()
    if ext == ".pdf":
        return _extrair_pdf(caminho)
    if ext == ".docx":
        return _extrair_docx(caminho)
    if ext in (".txt", ".md"):
        return caminho.read_text(encoding="utf-8", errors="replace")
    raise ValueError(f"Formato não suportado: {ext}. Use PDF, DOCX ou TXT.")


def _extrair_pdf(caminho: Path) -> str:
    import pdfplumber

    partes = []
    with pdfplumber.open(caminho) as pdf:
        for pagina in pdf.pages:
            texto = pagina.extract_text() or ""
            if texto.strip():
                partes.append(texto)
    return "\n\n".join(partes)


def _extrair_docx(caminho: Path) -> str:
    import docx

    doc = docx.Document(str(caminho))
    partes = [p.text for p in doc.paragraphs if p.text.strip()]
    for tabela in doc.tables:
        for linha in tabela.rows:
            celulas = [c.text.strip() for c in linha.cells if c.text.strip()]
            if celulas:
                partes.append(" | ".join(celulas))
    return "\n".join(partes)


def limpar_texto(texto: str, max_chars: int = 60000) -> str:
    """Remove linhas repetidas/vazias e trunca para economizar tokens."""
    linhas, anteriores = [], set()
    for linha in texto.splitlines():
        linha = linha.strip()
        if not linha:
            continue
        # remove cabeçalhos/rodapés repetidos (aparecem em toda página)
        if linha in anteriores and len(linha) < 80:
            continue
        anteriores.add(linha)
        linhas.append(linha)
    resultado = "\n".join(linhas)
    return resultado[:max_chars]

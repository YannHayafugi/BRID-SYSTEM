# Gerador de Propostas

Sistema que recebe um **Termo de Referência (TR)** e gera automaticamente uma **Proposta** e um **Resumo Executivo** em DOCX.

Abordagem **híbrida**: a IA (API do Claude) extrai e redige o conteúdo em JSON estruturado (economia de tokens), e os documentos finais são montados localmente a partir de templates Word — sem gastar tokens com formatação.

## Arquitetura

```
gerador-propostas/
├── backend/            # Python (FastAPI)
│   ├── app/
│   │   ├── main.py         # API REST
│   │   ├── extractor.py    # PDF/DOCX/TXT → texto
│   │   ├── generator.py    # Chamada à API do Claude (1 chamada por TR)
│   │   ├── renderer.py     # JSON → DOCX via templates (docxtpl)
│   │   └── prompts.py      # Prompt de geração
│   ├── templates/          # proposta.docx e resumo.docx (editáveis no Word)
│   ├── scripts/build_templates.py
│   └── requirements.txt
└── frontend/           # Node (Vite, vanilla JS)
    ├── index.html
    └── main.js
```

## Como rodar

### 1. Backend (Python 3.10+)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
copy .env.example .env        # e preencha ANTHROPIC_API_KEY
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend (Node 18+)

```bash
cd frontend
npm install
npm run dev
```

Acesse http://localhost:5173, envie o TR (PDF, DOCX ou TXT) e baixe a proposta e o resumo.

## Personalização

- **Templates**: edite `backend/templates/proposta.docx` e `resumo.docx` no Word. As variáveis usam sintaxe Jinja: `{{ objeto }}`, `{% for e in etapas %}` etc.
- **Prompt**: ajuste `backend/app/prompts.py` para mudar tom, seções ou regras da proposta.
- **Modelo de IA**: variável `ANTHROPIC_MODEL` no `.env`.

## Economia de tokens

- Texto do TR é extraído localmente (nada de enviar arquivo binário).
- Uma única chamada à API por TR, retornando JSON compacto.
- Formatação/layout ficam nos templates DOCX, fora da IA.

## Deploy (Render — gratuito)

1. Faça push do repo para o GitHub.
2. Em https://render.com → New → Web Service → conecte o repositório (runtime Docker é detectado pelo `Dockerfile`).
3. Em Environment, defina `ANTHROPIC_API_KEY` e `APP_SENHA` (senha que o usuário digita na tela).
4. Pronto: a URL gerada serve o frontend e a API juntos. Cada `git push` na branch main redeploya automaticamente.

Obs.: no plano gratuito o serviço hiberna após inatividade — o primeiro acesso do dia pode levar ~30 s.

## Versionamento (GitHub)

```bash
git remote add origin https://github.com/SEU_USUARIO/gerador-propostas.git
git push -u origin main
```

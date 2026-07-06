# Estágio 1: build do frontend (Node)
FROM node:22-slim AS front
WORKDIR /front
COPY frontend/package.json frontend/vite.config.js ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Estágio 2: backend (Python) servindo API + frontend
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
# gera templates apenas se não vierem versionados no repo
RUN test -f templates/proposta.docx || python scripts/build_templates.py
COPY --from=front /front/dist ./static
ENV FRONT_DIST=/app/static
EXPOSE 8000
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}

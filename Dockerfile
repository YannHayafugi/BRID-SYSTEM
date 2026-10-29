# =====================================================================
# GRUPO BRID · imagem de produção do app Next.js
#
# Três estágios, para a imagem final não carregar nem o código-fonte nem as
# dependências de build: ela sobe mais rápido e tem menos superfície.
#
# BASE DEBIAN, NÃO ALPINE, de propósito: o app depende de @napi-rs/canvas,
# binário nativo compilado contra a glibc. Em Alpine (musl) o pdfjs-dist
# quebra com "DOMMatrix is not defined" na hora de ler um PDF — o mesmo
# problema que o next.config.js já documenta no contexto da Vercel.
# =====================================================================

# ---------------------------------------------------------------------
# 1. Dependências
# ---------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# Só os manifestos: assim esta camada só é refeita quando uma dependência
# muda, e não a cada alteração de código.
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------
# 2. Build
# ---------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# As NEXT_PUBLIC_* são inlinadas NO BUILD, não lidas em tempo de execução —
# por isso entram como ARG aqui e não como variável do container. Trocar a
# URL do Supabase exige reconstruir a imagem.
#
# Não são segredo: a URL é pública e a chave publicável é feita para ficar
# no navegador. A chave SECRETA nunca entra aqui — ela é lida em runtime.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------------------------------------------------------
# 3. Execução
# ---------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Usuário sem privilégio: se algo for explorado no processo do Node, ele não
# é root dentro do container.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# `output: "standalone"` no next.config.js monta esta árvore com APENAS os
# módulos que o servidor usa de verdade. Sem ele, a imagem carregaria o
# node_modules inteiro (centenas de MB) e o COPY abaixo falharia.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# O healthcheck bate numa rota que NÃO toca o banco. Checar uma rota de
# dados faria o container ser reiniciado durante o refresh das materialized
# views, que é justamente quando ele não pode cair.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

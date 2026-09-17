#!/usr/bin/env bash
# =====================================================================
# Publica a versão mais nova do repositório no VPS.
#
# Rodar como o usuário "brid", na raiz do projeto:   bash deploy/atualizar.sh
#
# O build é feito na mesma pasta .next que o app em execução usa: durante
# os minutos do build, e se ele falhar, telas podem dar erro. Rode fora do
# horário de uso. Se falhar, volte ao commit anterior e rode de novo:
#   git log --oneline -3 && git checkout <commit> && bash deploy/atualizar.sh
# (o git pull é pulado quando o HEAD está destacado de uma branch)
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "Falta o .env.local na raiz do projeto (ver etapa 4 de docs/DEPLOY-VPS.md)." >&2
  exit 1
fi

if git symbolic-ref -q HEAD >/dev/null; then
  echo "==> Baixando código"
  git pull --ff-only
else
  echo "==> HEAD fixo em $(git rev-parse --short HEAD): sem git pull"
fi

# npm ci instala exatamente o package-lock e baixa os binários nativos do
# Linux (@napi-rs/canvas). Nunca copiar node_modules de outra máquina.
echo "==> Instalando dependências"
npm ci

echo "==> Build"
npm run build

echo "==> Recarregando aplicação"
if pm2 describe brid >/dev/null 2>&1; then
  pm2 reload brid
else
  pm2 start deploy/ecosystem.config.js
  pm2 save
fi

pm2 status brid

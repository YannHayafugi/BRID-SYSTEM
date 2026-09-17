#!/usr/bin/env bash
# =====================================================================
# Etapa 3 — prepara um VPS Ubuntu 22.04/24.04 limpo para rodar o sistema.
#
# Rodar UMA vez, como root:   bash preparar-vps.sh
#
# Instala: Node.js 22 (NodeSource), git, Nginx, PM2, certbot e firewall.
# Cria o usuário "brid", que é quem roda a aplicação — nunca o root.
# Pode ser rodado de novo sem estragar nada.
# =====================================================================
set -euo pipefail

USUARIO=brid

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode como root (ou com sudo)." >&2
  exit 1
fi

echo "==> Atualizando pacotes do sistema"
apt-get update -y
apt-get upgrade -y

echo "==> Ferramentas básicas"
apt-get install -y curl ca-certificates git build-essential ufw

# Node 22: exigido pelo @supabase/supabase-js (>=22) e pelo pdf-parse
# (>=22.3). O Node do repositório padrão do Ubuntu é antigo demais.
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  echo "==> Instalando Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "    node $(node -v) / npm $(npm -v)"

echo "==> PM2 (mantém o app no ar)"
npm install -g pm2

echo "==> Nginx e certbot (HTTPS)"
apt-get install -y nginx certbot python3-certbot-nginx
rm -f /etc/nginx/sites-enabled/default

echo "==> Firewall: só SSH, HTTP e HTTPS"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# O `next build` chega a usar 1–2 GB de RAM. Em VPS de pouca memória o
# build morre com "Killed" sem outra explicação; o swap evita isso.
if ! swapon --show | grep -q .; then
  MEM_MB=$(free -m | awk '/^Mem:/{print $2}')
  if [ "$MEM_MB" -lt 4000 ]; then
    echo "==> Criando swap de 2 GB (RAM: ${MEM_MB} MB)"
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
fi

if ! id "$USUARIO" >/dev/null 2>&1; then
  echo "==> Criando usuário $USUARIO"
  adduser --disabled-password --gecos "" "$USUARIO"
fi

echo
echo "Pronto. Próximo passo (etapa 4): entrar como $USUARIO e baixar o código:"
echo "  su - $USUARIO"

/**
 * PM2 — mantém o Next.js no ar no VPS e o reinicia se cair ou se o servidor
 * reiniciar (depois de `pm2 startup` + `pm2 save`, ver docs/DEPLOY-VPS.md).
 *
 * Uso, a partir da raiz do projeto:  pm2 start deploy/ecosystem.config.js
 *
 * As variáveis de ambiente NÃO ficam aqui: o `next start` lê o `.env.local`
 * da raiz do projeto, o mesmo arquivo que o `next build` usa. Assim as
 * NEXT_PUBLIC_* do build e as secretas do runtime vêm de um lugar só, e nada
 * sensível vai para o git.
 */
module.exports = {
  apps: [
    {
      name: "brid",
      cwd: __dirname + "/..",
      script: "node_modules/next/dist/bin/next",
      // 127.0.0.1: a porta 3000 só é acessível pelo Nginx, nunca direto da
      // internet — o HTTPS e os limites de upload/timeout ficam no Nginx.
      args: "start -H 127.0.0.1 -p 3000",
      exec_mode: "fork",
      instances: 1,
      env: { NODE_ENV: "production" },
      // Geração de documentos e parse de PDF usam memória em picos; se passar
      // disso por vazamento, o PM2 reinicia em vez de deixar o VPS travar.
      max_memory_restart: "1G",
      time: true,
    },
  ],
};

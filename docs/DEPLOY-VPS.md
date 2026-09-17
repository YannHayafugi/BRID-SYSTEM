# Deploy no VPS (Hostinger)

Migração da Vercel para um VPS próprio. Cada etapa termina com uma
**verificação**: só avance quando ela passar. Até a etapa 9 a Vercel continua
no ar, e nada muda para quem usa o sistema.

| # | Etapa | Onde | Tempo |
|---|-------|------|-------|
| 1 | Preparar o repositório | repositório | feito |
| 2 | Contratar o VPS e acessar por SSH | hPanel + terminal | 15 min |
| 3 | Instalar Node 22, Nginx, PM2 e firewall | VPS (root) | 10 min |
| 4 | Baixar o código e configurar o `.env.local` | VPS (brid) | 10 min |
| 5 | Build e subir com PM2 | VPS (brid) | 10 min |
| 6 | Apontar o domínio e configurar o Nginx | DNS + VPS (root) | 15 min + propagação |
| 7 | HTTPS com certbot | VPS (root) | 5 min |
| 8 | Ajustar URLs no Supabase | painel Supabase | 5 min |
| 9 | Testar tudo e fazer a virada | navegador | 30 min |

Arquivos usados: `deploy/preparar-vps.sh`, `deploy/ecosystem.config.js`,
`deploy/nginx/brid.conf` e `deploy/atualizar.sh`.

---

## 1. Preparar o repositório (feito)

- `package.json` exige Node `>=22.3.0` (`engines`) e há um `.nvmrc` com `22`.
  O motivo: o `@supabase/supabase-js` pede Node 22+ e o `pdf-parse` pede 22.3+.
- `typescript` e `@types/*` foram para `dependencies`. O `next build` precisa
  deles, e uma instalação "de produção" (sem devDependencies) quebraria o build.
- `.gitattributes` força LF nos `.sh`, para os scripts rodarem no Linux mesmo
  quando o commit sai do Windows.

---

## 2. Contratar o VPS e acessar por SSH

1. No hPanel, em **VPS**, escolha um plano com **pelo menos 2 GB de RAM** (o
   KVM 1 da Hostinger já atende; com 4 GB o build fica bem mais folgado).
2. Sistema operacional: **Ubuntu 24.04** (limpo, sem painel).
3. Defina a senha de root. Se puder, cadastre também sua chave SSH.
4. Anote o **IP** do VPS.

No terminal do seu computador:

```bash
ssh root@IP_DO_VPS
```

**Verificação:** você está no prompt `root@...`.

---

## 3. Instalar as dependências do sistema

Ainda como root, baixe e rode o script de preparação:

```bash
curl -fsSL https://raw.githubusercontent.com/YannHayafugi/BRID-SYSTEM/main/deploy/preparar-vps.sh -o preparar-vps.sh
bash preparar-vps.sh
```

> Se o repositório for privado, o `curl` não funciona. Nesse caso, copie o
> conteúdo de `deploy/preparar-vps.sh` para um arquivo no VPS com `nano` e
> rode do mesmo jeito.

O script instala Node 22, git, Nginx, PM2, certbot e o firewall (libera só
SSH, HTTP e HTTPS). Cria um swap de 2 GB se a máquina tiver menos de 4 GB de
RAM e cria o usuário `brid`, que é quem roda a aplicação.

**Verificação:**

```bash
node -v        # v22.x
pm2 -v
nginx -v
ufw status     # OpenSSH e Nginx Full: ALLOW
```

---

## 4. Baixar o código e configurar o ambiente

```bash
su - brid
git clone https://github.com/YannHayafugi/BRID-SYSTEM.git app
cd app
```

> Repositório privado: gere uma chave no VPS (`ssh-keygen -t ed25519`) e
> cadastre a chave pública em GitHub > repositório > Settings > **Deploy
> keys** (só leitura). Depois clone com
> `git clone git@github.com:YannHayafugi/BRID-SYSTEM.git app`.

Crie o `.env.local` com os **mesmos valores da Vercel** (Settings >
Environment Variables):

```bash
nano .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
ANTHROPIC_API_KEY=
# opcionais, só se estiverem definidas na Vercel:
# ANTHROPIC_MODEL=
# MAX_TR_CHARS=
```

```bash
chmod 600 .env.local
```

Cuidados:
- As `NEXT_PUBLIC_*` são gravadas no código **durante o build**. Se mudar
  alguma, é preciso fazer o build de novo (etapa 5).
- `SUPABASE_SECRET_KEY` nunca pode ter o prefixo `NEXT_PUBLIC_`.
- Esse arquivo não vai para o git (está no `.gitignore`).

**Verificação:** `grep -c '=' .env.local` mostra pelo menos 4.

---

## 5. Build e subir com PM2

Como `brid`, dentro de `~/app`:

```bash
bash deploy/atualizar.sh
```

O script roda `npm ci` (que baixa os binários de Linux do `@napi-rs/canvas`),
depois `npm run build` e sobe a aplicação no PM2.

> **Nunca** copie `node_modules` do seu computador para o VPS: o binário do
> canvas é específico do sistema, e a leitura de PDF quebraria.

Para o app voltar sozinho quando o VPS reiniciar:

```bash
pm2 startup
```

O comando imprime uma linha começando com `sudo env PATH=...`. Saia para o
root (`exit`), rode essa linha e volte (`su - brid`, `cd app`). Depois:

```bash
pm2 save
```

**Verificação:**

```bash
pm2 status                          # brid: online
curl -I http://127.0.0.1:3000/login # HTTP/1.1 200
```

Se não estiver `online`, veja o erro com `pm2 logs brid --lines 50`.

---

## 6. Apontar o domínio e configurar o Nginx

**DNS** (no hPanel, em Domínios > DNS, ou onde o domínio estiver): crie um
registro **A** com o nome do subdomínio (ex.: `sistema`) apontando para o
IP do VPS. A propagação pode levar de minutos a algumas horas.

**Nginx**, como root (troque `sistema.exemplo.com.br` pelo seu domínio):

```bash
cp /home/brid/app/deploy/nginx/brid.conf /etc/nginx/sites-available/brid
sed -i 's/SEU_DOMINIO/sistema.exemplo.com.br/g' /etc/nginx/sites-available/brid
ln -sf /etc/nginx/sites-available/brid /etc/nginx/sites-enabled/brid
nginx -t && systemctl reload nginx
```

A configuração já inclui:
- `client_max_body_size 50m`: o padrão de 1 MB barraria o upload do TR em PDF
  e os lotes da importação do SADA;
- timeout de 300 s: substitui o `maxDuration = 300` da Vercel na geração de
  documentos com IA.

**Verificação:** `http://sistema.exemplo.com.br/login` abre no navegador.
Ainda sem cadeado, e o login ainda pode falhar: isso se resolve nas etapas 7 e 8.

---

## 7. HTTPS

Como root:

```bash
certbot --nginx -d sistema.exemplo.com.br
```

Informe um e-mail e aceite redirecionar HTTP para HTTPS. A renovação é
automática.

**Verificação:** `https://sistema.exemplo.com.br` abre com cadeado, e
`certbot renew --dry-run` termina sem erro.

---

## 8. Ajustar URLs no Supabase

No painel do projeto (**upqyleaggnpnljdnoeqx**), em Authentication > URL
Configuration:

- **Site URL:** `https://sistema.exemplo.com.br`
- **Redirect URLs:** acrescente `https://sistema.exemplo.com.br/**`

Mantenha a URL da Vercel na lista até terminar a etapa 9. Sem este ajuste, os
e-mails de recuperação de senha continuam levando para a Vercel.

---

## 9. Testar e fazer a virada

Teste no domínio novo, nesta ordem:

- [ ] Login e logout
- [ ] Dashboard e Follow-up carregam dados
- [ ] Criar processo com **upload de TR em PDF** (testa canvas, pdf-parse e o limite de upload)
- [ ] **Gerar documentos** de um processo (testa a Anthropic e o timeout de 300 s)
- [ ] Download do docx gerado
- [ ] SADA: dashboard, qualidade e completude
- [ ] SADA: **importar uma planilha** (testa os lotes grandes)
- [ ] SADA: consulta de CNPJ na Receita (testa a saída do VPS para a internet)
- [ ] Recuperação de senha: o link do e-mail abre o domínio novo

Com tudo marcado:
1. Avise o time do endereço novo.
2. Depois de alguns dias sem problema, remova a URL da Vercel das Redirect
   URLs do Supabase e pause ou apague o projeto na Vercel.

---

## Depois da migração

**Publicar uma versão nova** (depois do merge no `main`):

```bash
ssh root@IP_DO_VPS
su - brid
cd app && bash deploy/atualizar.sh
```

O build acontece na mesma pasta que o app no ar usa: prefira rodar fora do
horário de uso. Se o build falhar, volte ao commit anterior e publique de novo:

```bash
git log --oneline -3
git checkout COMMIT_ANTERIOR
bash deploy/atualizar.sh
```

Depois de corrigido, `git checkout main` e `bash deploy/atualizar.sh`.

**Comandos úteis:**

| Para | Comando |
|------|---------|
| Ver logs ao vivo | `pm2 logs brid` |
| Reiniciar | `pm2 restart brid` |
| Uso de memória e CPU | `pm2 monit` |
| Erros do Nginx | `sudo tail -f /var/log/nginx/error.log` |

**Problemas comuns:**

| Sintoma | Causa provável |
|---------|----------------|
| `Killed` durante o build | Falta de memória: confira o swap (`swapon --show`) |
| `413 Request Entity Too Large` | `client_max_body_size` não aplicado: rode `nginx -t && systemctl reload nginx` |
| `504` ao gerar documentos | Timeout do Nginx: confira os `proxy_*_timeout` |
| `502 Bad Gateway` | App fora do ar: veja `pm2 status` e `pm2 logs brid` |
| `DOMMatrix is not defined` / erro no PDF | `node_modules` copiado de outra máquina: apague e rode `npm ci` |
| 503 "Configuração incompleta" | Faltou `NEXT_PUBLIC_*` no `.env.local` **antes** do build |
| Aviso `EBADENGINE` no `npm ci` | Node abaixo de 22.3: refaça a etapa 3 |

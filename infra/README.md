# Migração para a Hostinger — plano de ação

Sair da Vercel + Supabase Cloud e passar o sistema inteiro para **um VPS da
Hostinger em São Paulo**, com Supabase auto-hospedado.

Decisões já tomadas: tudo vai para a Hostinger (app e banco), a base começa
limpa, e ninguém fica dedicado a administrar o servidor.

---

## Por que isto reduz a latência

Hoje cada tela do SADA faz de três a seis consultas, e cada uma atravessa a
internet duas vezes: navegador → Vercel → Supabase e de volta. Com app e
banco no mesmo host, o trecho mais caro desaparece — a conversa entre eles
passa a ser a rede interna do Docker, em frações de milissegundo.

Soma-se a isso o datacenter em São Paulo. O público do sistema é servidor
público em prefeitura paulista; hoje a resposta provavelmente sai do
exterior.

Três ganhos já estão no código e continuam valendo:

- as **materialized views** do SADA (leitura de 12,5 s → 0 ms);
- o **cache de leitura** das rotas (`CACHE_LEITURA`);
- o **COPY** da importação via `SADA_DB_URL`, que agora aponta para o
  Postgres local em vez de um banco do outro lado da internet.

---

## Antes de tudo: confirme qual banco é o de produção

**Não comece a migração sem resolver isto.** Há dois projetos Supabase e eu
não consegui explicar a diferença:

| Projeto | Estado | Observação |
|---|---|---|
| `xyngrzennrozwcpgxmmm` | **no ar** | é o que o `.env.local` e o bundle de produção apontam |
| `upqyleaggnpnljdnoeqx` | pausado, 2,0 GB | é onde eu media os dados do SADA |

Abra o dashboard do SADA em produção. Se os números aparecerem, o banco vivo
é o `xyngr` — e aí **não é preciso começar limpo**: dá para fazer `pg_dump`
dele sem pagar nada, porque ele não está pausado. Isso mudaria a decisão de
"começar limpo" e preservaria as safras de 1995 a 2022, que são justamente o
que sustenta as curvas de recuperação do documento de debênture.

Dois pontos que "começar limpo" leva junto e talvez não tenham sido
considerados:

- **os arquivos do Storage** (`lib/processos/arquivos.ts`) — documentos de
  processo, não só linhas de tabela;
- **as contas de usuário**, que precisarão ser recriadas uma a uma.

---

## Dimensionamento

Recomendo **KVM 4** (4 vCPU, 16 GB, 200 GB NVMe), em São Paulo.

| Peça | RAM |
|---|---|
| Postgres (`shared_buffers` 4 GB + trabalho) | ~6 GB |
| Next.js | ~1 GB |
| Auth + PostgREST + Storage + Kong | ~1,5 GB |
| Dokploy + Traefik | ~1 GB |
| Folga para o refresh das MVs e a ingestão | o resto |

O KVM 2 (8 GB) roda, mas sem folga: o refresh das materialized views e um
`COPY` de milhões de linhas ao mesmo tempo encostariam no limite. E o
pipeline fala em mais de vinte entes — 2 GB de base viram dezenas.

Disco: a base atual tem 2,0 GB. Os 200 GB do KVM 4 absorvem crescimento e
os backups locais com sobra.

---

## Arquitetura

Um VPS, tudo em Docker, orquestrado pelo **Dokploy** (painel web no próprio
servidor: deploy por git, TLS automático via Traefik, logs e backups
agendados — foi por isso que ele entrou, já que ninguém fica dedicado a
administrar).

```
                        internet
                            │  443/TLS
                    ┌───────▼────────┐
                    │ Traefik        │  (Dokploy)
                    └───┬────────┬───┘
            app.dominio │        │ api.dominio
                    ┌───▼───┐ ┌──▼─────┐
                    │ app   │ │ Kong   │
                    │Next.js│ └──┬─────┘
                    └───┬───┘    │
                        │   ┌────┴────┬──────────┐
                        │   │         │          │
                     ┌──▼───▼──┐ ┌────▼───┐ ┌────▼────┐
                     │PostgREST│ │ GoTrue │ │ Storage │
                     └────┬────┘ └───┬────┘ └────┬────┘
                          └──────────┼───────────┘
                                ┌────▼─────┐
                                │ Postgres │
                                └──────────┘
```

O Postgres **não é publicado na internet**. Para administrar, túnel SSH:

```bash
ssh -L 5432:localhost:5432 root@SEU_VPS
```

### Arquivos desta pasta

| Arquivo | O quê |
|---|---|
| `docker-compose.yml` | a stack inteira, comentada |
| `kong.yml` | roteamento `/auth/v1`, `/rest/v1`, `/storage/v1` |
| `postgres/tuning.conf` | memória, paralelismo e WAL para 16 GB |
| `.env.example` | as variáveis exigidas, sem valores |

Fora daqui: `Dockerfile`, `.dockerignore` e `.github/workflows/imagem.yml`.

> **Confira as tags das imagens** no `docker-compose.yml` contra o
> [compose oficial do Supabase](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml)
> antes de subir. Os componentes precisam ser compatíveis entre si e o
> conjunto muda com frequência.

---

## Fases

### Fase 1 — Contratar e preparar (≈1 h)

1. VPS **KVM 4**, região **Brasil (São Paulo)**, Ubuntu 24.04.
2. Chave SSH; desligar login por senha.
3. Firewall: só 22, 80 e 443.
4. Instalar o Dokploy (um comando, do site deles).
5. Apontar o domínio para o IP do VPS.

### Fase 2 — Segredos (≈30 min)

Você gera e cola — eu não manuseio chave nem senha.

```bash
openssl rand -base64 32   # POSTGRES_PASSWORD
openssl rand -base64 48   # JWT_SECRET
```

`ANON_KEY` e `SERVICE_ROLE_KEY` saem do gerador oficial do Supabase para
auto-hospedagem, assinados com o seu `JWT_SECRET`.

Copie `infra/.env.example` para `infra/.env` no servidor e preencha.
**Nunca** cole esses valores numa conversa: a `SERVICE_ROLE_KEY` ignora RLS
e dá acesso à base inteira.

No GitHub, em *Settings → Secrets*, cadastre `NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_ANON_KEY` — elas são inlinadas no build.

### Fase 3 — Banco (≈1 h)

1. Subir só o `db` e esperar o healthcheck.
2. Aplicar os SQL de `supabase/`, **nesta ordem**:
   - `schema-unificado.sql`
   - `sada-schema.sql`
   - `rls-gp-politicas.sql`
   - `sada-regras-tributarias.sql`
   - `sada-spec-e-envios.sql`
   - `sada-depara-ano-e-opcionais.sql`
   - `sada-importacao-servidor.sql`
   - `sada-cnpj-status.sql`
   - `sada-mv-leitura.sql`
   - `sada-mv-validacao-tributaria.sql`
   - `sada-deb-categoria-e-coortes.sql` *(onda 1 — PR #37)*
   - `sada-deb-modelo.sql` *(onda 3)*
3. Conferir que as materialized views existem e que `sada_refresh_mvs()`
   roda sem erro.

> As duas últimas nunca foram aplicadas em lugar nenhum. As telas
> `/sada/debenture` e `/sada/debenture/modelo` dependem delas.

### Fase 4 — Serviços e app (≈1 h)

1. Subir `auth`, `rest`, `storage`, `kong`.
2. `curl https://api.seudominio/rest/v1/` com a `ANON_KEY` — tem de
   responder.
3. Rodar o workflow `imagem.yml` e subir o `app`.
4. Criar o primeiro usuário e a linha correspondente em `gp_profiles` com
   `is_superadmin`.

### Fase 5 — Dados (variável)

Reimportar pelas telas do SADA, na ordem: DE/PARA, dívida ativa,
lançamentos, recebimentos. A fila de importação da onda 4 aceita vários
`.xlsx` de uma vez.

Aproveite para **pedir ao ente** os dois arquivos de recebimento, que nunca
chegaram, e para esclarecer o `VLR_CORRECAO` (2,44 fixo em 96,8% das linhas)
e o `VLR_ESTOQUE`.

### Fase 6 — Virada (≈30 min)

1. Testar tudo no domínio novo com a Vercel ainda no ar.
2. Baixar o TTL do DNS antes.
3. Apontar o domínio definitivo.
4. Manter a Vercel uma semana como rede de segurança.

---

## Depois que estiver no ar

**Backups.** Agende no Dokploy: `pg_dump` diário + o volume do Storage,
enviados para **fora do VPS** (Backblaze B2 ou Cloudflare R2 — backup no
mesmo disco não protege de nada). Ligue também o snapshot do VPS da
Hostinger. E **teste uma restauração** antes de precisar: backup não testado
não é backup.

**Monitoramento.** Uptime externo batendo em `/api/saude`, e alerta de
disco acima de 80% — a base cresce por importação, aos saltos.

**Atualizações.** `unattended-upgrades` para o sistema; as imagens você
atualiza pelo Dokploy quando quiser.

---

## O que piora, e é honesto dizer

- **Um servidor só.** Caiu o VPS, caiu tudo. Hoje a Vercel e o Supabase dão
  redundância que um VPS não dá. Para uma ferramenta interna isso costuma
  ser aceitável — mas é uma troca, não um ganho puro.
- **A conta de operar passa a ser sua.** Backup, atualização de segurança,
  certificado e restauração deixam de ser de terceiro. O Dokploy automatiza
  quase tudo; "quase" não é "tudo".
- **Sem point-in-time recovery.** O Supabase Pro reconstrói o banco em
  qualquer instante. Com `pg_dump` diário, a perda máxima é de um dia.
- **Recuperação de senha depende de SMTP.** Enquanto não houver, troca de
  senha é feita por quem administra. A Hostinger vende e-mail, ou use
  qualquer SMTP transacional.

-- =====================================================================
-- SADA · Debênture, onda 3: modelos de documento
--
-- Guarda a ESCOLHA de tópicos — quais entram, em que ordem, para qual ente.
-- O catálogo em si fica em lib/sada/debenture.ts, no código: um tópico só
-- existe quando há componente que saiba desenhá-lo, e uma linha de tabela
-- prometendo um tópico sem renderizador viraria página em branco no material
-- do investidor.
--
-- Consequência prática desse desenho: o catálogo muda com o deploy, e um
-- modelo salvo pode citar um slug que não existe mais. Quem limpa é
-- `normalizarSelecao()` na leitura — por isso a coluna é jsonb solta e não
-- uma FK para uma tabela de tópicos.
--
-- DOIS NÍVEIS, como em sada_regra_tributaria e sada_tributo_categoria:
--   cnpj_orgao nulo  -> modelo disponível para qualquer ente;
--   cnpj_orgao cheio -> só daquele ente.
--
-- Idempotente.
-- =====================================================================

begin;

create table if not exists public.sada_deb_modelo (
  id          bigint generated always as identity primary key,
  cnpj_orgao  text,
  nome        text not null,
  -- Array de slugs NA ORDEM escolhida. A ordem é conteúdo, não enfeite: é
  -- o que a montagem reordena com as setas.
  topicos     jsonb not null default '[]'::jsonb,
  padrao      boolean not null default false,
  criado_por  uuid references public.gp_profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint sada_deb_modelo_nome_nao_vazio check (length(btrim(nome)) > 0),
  constraint sada_deb_modelo_topicos_array  check (jsonb_typeof(topicos) = 'array')
);

-- NULLS NOT DISTINCT: dois modelos globais de mesmo nome têm de colidir.
-- Sem isso, `cnpj_orgao is null` escapa do índice e a tela passa a mostrar
-- dois "Padrão" indistinguíveis.
create unique index if not exists idx_sada_deb_modelo_chave
  on public.sada_deb_modelo (cnpj_orgao, nome) nulls not distinct;

-- Um padrão por ente, no máximo. Índice parcial porque a restrição só vale
-- para as linhas marcadas: os não-padrão podem ser quantos forem.
create unique index if not exists idx_sada_deb_modelo_padrao
  on public.sada_deb_modelo (cnpj_orgao) nulls not distinct
  where padrao;

alter table public.sada_deb_modelo enable row level security;

-- Mesmo caminho das outras tabelas do módulo: a tela passa pela API, que é
-- quem conhece o perfil de quem pediu.
drop policy if exists sada_deb_modelo_service on public.sada_deb_modelo;
create policy sada_deb_modelo_service
  on public.sada_deb_modelo for all
  to service_role using (true) with check (true);

commit;

-- Conferência rápida:
-- select id, cnpj_orgao, nome, padrao, jsonb_array_length(topicos) as topicos
--   from public.sada_deb_modelo order by cnpj_orgao nulls first, nome;

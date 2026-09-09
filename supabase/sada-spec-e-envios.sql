-- =====================================================================
-- SADA · especificação do INFO REQUEST LIST + relatório de cada envio
--
-- A planilha oficial diz QUAIS dados se pede ao ente e com que criticidade.
-- Essa régua fica AQUI, versionada, e não é lida do arquivo que o cliente
-- devolve: a criticidade mora na aba LEIA da própria planilha, e se fosse lida
-- de lá o ente poderia alterar — de propósito ou ao mexer no arquivo — a régua
-- contra a qual está sendo medido.
--
-- O seed de cada versão é gerado por scripts/sada-spec-gerar.cjs a partir da
-- planilha oficial. Trocou a planilha, roda o gerador e aplica o SQL novo.
-- =====================================================================

create table if not exists public.sada_spec_versao (
  id           bigint generated always as identity primary key,
  nome         text not null,
  arquivo_nome text,
  vigente      boolean not null default false,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.gp_profiles (id)
);

-- Só uma versão vigente por vez. Índice parcial em vez de trigger: o banco
-- garante, e o seed é obrigado a desmarcar a anterior antes de inserir.
create unique index if not exists idx_sada_spec_versao_vigente
  on public.sada_spec_versao (vigente) where vigente;

create table if not exists public.sada_spec_campo (
  id          bigint generated always as identity primary key,
  versao_id   bigint not null references public.sada_spec_versao (id) on delete cascade,
  aba         text not null,               -- METADADOS, LANÇAMENTO, ESTOQUE DA...
  campo       text not null,               -- nome exato do cabeçalho na aba
  ordem       int  not null,               -- posição da coluna, como o ente vê
  criticidade text not null check (criticidade in ('Essencial', 'Importante', 'Complementar')),
  formato     text,
  descricao   text,
  regras      text,
  unique (versao_id, aba, campo)
);
create index if not exists idx_sada_spec_campo_versao
  on public.sada_spec_campo (versao_id, aba, ordem);

-- ---------------------------------------------------------------------
-- Um registro por envio: o retrato do que o ente mandou naquele momento.
-- Guardar o resultado (e não só recalcular) permite comparar reenvios e
-- mostrar ao ente que o preenchimento melhorou — ou não.
-- ---------------------------------------------------------------------
create table if not exists public.sada_envio (
  id                bigint generated always as identity primary key,
  versao_id         bigint not null references public.sada_spec_versao (id),
  orgao_id          uuid references public.gp_orgaos (id),
  cnpj_orgao        text,                  -- somente dígitos, quando informado
  arquivo_nome      text not null,
  enviado_em        timestamptz not null default now(),
  enviado_por       uuid references public.gp_profiles (id),
  -- Índice ponderado por criticidade, 0 a 100. É o número que vai na conversa
  -- com o ente; o detalhe fica nos jsonb abaixo.
  indice_completude numeric(5,2),
  resumo            jsonb not null default '{}'::jsonb,   -- por aba e criticidade
  por_campo         jsonb not null default '[]'::jsonb,   -- % de cada campo
  estruturais       jsonb not null default '[]'::jsonb    -- aba/coluna faltando, exemplos etc.
);
create index if not exists idx_sada_envio_orgao on public.sada_envio (orgao_id, enviado_em desc);
create index if not exists idx_sada_envio_cnpj  on public.sada_envio (cnpj_orgao, enviado_em desc);

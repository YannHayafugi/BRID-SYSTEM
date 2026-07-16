-- ============================================================================
-- Schema unificado do Gerador de Propostas (ETAPA 1 do plano de migração)
-- Aplicado no Supabase em 2026-07-16 (migração: gerador_schema_unificado_v1).
-- Adaptado de YannHayafugi/Gerador_de_Proposta_Securitizacao (schema.sql v2):
--   * prefixo gp_ em todas as tabelas (projeto Supabase compartilhado — D2)
--   * gatilho próprio on_auth_user_created_gp (não toca o do outro sistema)
--   * gp_profiles.ativo default FALSE (pool de auth compartilhado; admin ativa)
--   * + gp_processos (Follow-up unificado) e vínculos em gp_oficios
--
-- Tabelas: gp_profiles, gp_orgaos, gp_orgaos_contatos, gp_cadastros_tr,
--          gp_achados_tr, gp_achados_tr_historico, gp_processos, gp_oficios(+)
--
-- Primeiro admin (rodar após criar sua conta pelo login):
--   update public.gp_profiles set perfil='admin', ativo=true,
--     pode_editar_analises=true, pode_excluir_analises=true
--   where email='seu-email@exemplo.com';
--
-- Observação: gp_propostas (modelo antigo, senha única) permanece até o
-- cutover da ETAPA 4; será dropada junto com a desativação do app atual.
-- ============================================================================

-- (Conteúdo idêntico ao aplicado — fonte da verdade da estrutura do banco.)

-- 1. GP_PROFILES
create table if not exists public.gp_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nome_completo text,
  perfil text not null default 'visualizador'
    check (perfil in ('admin', 'editor', 'visualizador')),
  pode_editar_analises boolean not null default false,
  pode_excluir_analises boolean not null default false,
  ativo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user_gp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.gp_profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created_gp on auth.users;
create trigger on_auth_user_created_gp
  after insert on auth.users for each row execute procedure public.handle_new_user_gp();

-- 1.1 GP_ORGAOS
create table if not exists public.gp_orgaos (
  id uuid primary key default gen_random_uuid(),
  criado_por uuid references public.gp_profiles (id),
  tipo_ente text not null check (tipo_ente in ('Município', 'Estado')),
  razao_social text not null,
  cnpj text,
  cidade text not null,
  uf text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gp_orgaos_razao_social on public.gp_orgaos (razao_social);
create unique index if not exists idx_gp_orgaos_cnpj_unico on public.gp_orgaos (cnpj) where cnpj is not null;

-- 1.2 GP_ORGAOS_CONTATOS
create table if not exists public.gp_orgaos_contatos (
  id uuid primary key default gen_random_uuid(),
  orgao_id uuid not null references public.gp_orgaos (id) on delete cascade,
  nome_completo text not null,
  cargo text not null,
  telefone text,
  email text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_gp_orgaos_contatos_orgao_id on public.gp_orgaos_contatos (orgao_id);

-- 2. GP_CADASTROS_TR
create table if not exists public.gp_cadastros_tr (
  id uuid primary key default gen_random_uuid(),
  criado_por uuid references public.gp_profiles (id),
  orgao_id uuid references public.gp_orgaos (id),
  classificacao text not null check (classificacao in ('Município', 'Estado')),
  nome_ente text not null,
  uf text not null,
  nome_responsavel text not null,
  cargo text not null,
  telefone text,
  email text not null,
  objeto_tr text not null default 'Securitizacao',
  nome_arquivo_tr text not null,
  resultado_bruto_ia jsonb not null,
  status text not null default 'em_analise' check (status in ('em_analise', 'concluida')),
  relatorio_gerado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gp_cadastros_tr_criado_por on public.gp_cadastros_tr (criado_por);
create index if not exists idx_gp_cadastros_tr_orgao_id on public.gp_cadastros_tr (orgao_id);

-- 3. GP_ACHADOS_TR
create table if not exists public.gp_achados_tr (
  id uuid primary key default gen_random_uuid(),
  cadastro_id uuid not null references public.gp_cadastros_tr (id) on delete cascade,
  achado_id text not null,
  item_numero text not null,
  titulo text not null,
  texto text not null,
  comentario_obrigatorio boolean not null default false,
  ciente boolean not null default false,
  comentario text,
  ciente_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cadastro_id, achado_id)
);
create index if not exists idx_gp_achados_tr_cadastro_id on public.gp_achados_tr (cadastro_id);

-- 3.1 GP_ACHADOS_TR_HISTORICO (append-only)
create table if not exists public.gp_achados_tr_historico (
  id uuid primary key default gen_random_uuid(),
  achado_id uuid not null references public.gp_achados_tr (id) on delete cascade,
  versao int not null,
  ciente_anterior boolean not null,
  comentario_anterior text,
  ciente_novo boolean not null,
  comentario_novo text,
  justificativa_edicao text not null,
  editado_por uuid references public.gp_profiles (id),
  editado_em timestamptz not null default now()
);
create index if not exists idx_gp_achados_tr_hist_achado_id on public.gp_achados_tr_historico (achado_id);

-- 4. GP_PROCESSOS (Follow-up unificado; início limpo — D5)
create table if not exists public.gp_processos (
  id uuid primary key default gen_random_uuid(),
  criado_por uuid references public.gp_profiles (id),
  orgao_id uuid references public.gp_orgaos (id),
  titulo text not null,
  etapa int not null default 0,
  documentos jsonb not null default '{}'::jsonb,
  arquivos jsonb not null default '{}'::jsonb,
  tr_nome text,
  cadastro_tr_id uuid references public.gp_cadastros_tr (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gp_processos_criado_por on public.gp_processos (criado_por);
create index if not exists idx_gp_processos_orgao_id on public.gp_processos (orgao_id);

-- 4.1 GP_OFICIOS — vínculos novos
alter table public.gp_oficios add column if not exists criado_por uuid references public.gp_profiles (id);
alter table public.gp_oficios add column if not exists orgao_id uuid references public.gp_orgaos (id);

-- 5. RLS — políticas completas aplicadas na migração gerador_schema_unificado_v1
-- (dono-ou-admin em cadastros/achados/processos; compartilhado entre usuários
-- ativos em órgãos/contatos/perfis; histórico append-only.)
-- Ver Database → Migrations no painel do Supabase para o texto integral.

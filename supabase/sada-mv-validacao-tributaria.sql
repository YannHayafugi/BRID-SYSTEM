-- =====================================================================
-- SADA · validação tributária vira MATERIALIZED VIEW
--
-- Medido na base de produção: `sada_vw_validacao_tributaria` levava
-- **12.547 ms** para devolver 12 linhas. Ela entra no resumo de qualidade,
-- que o DASHBOARD consulta a cada abertura — era a última espera visível do
-- módulo depois que as outras views foram materializadas.
--
-- Ela ficou de fora daquela primeira leva de propósito: diferente das outras,
-- não depende só dos dados importados — cruza a base com o cadastro de regras
-- (sada_regra_tributaria), que é editado na tela de Validação. Materializada,
-- ela congela, e uma regra nova só aparece depois de um recálculo.
--
-- Por isso vem com DOIS gatilhos:
--   1. sada_refresh_mvs()        — ao fim de cada importação, como as outras;
--   2. sada_refresh_validacao()  — ao salvar ou excluir uma regra, chamada
--                                  pela rota /api/sada/regras.
--
-- A função separada existe para o salvar de uma regra não pagar o refresh das
-- outras oito MVs: são ~20 s contra ~12 s.
--
-- Idempotente: pode rodar de novo (pula se já for materializada).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Converte view -> materialized view, preservando nome e definição
-- ---------------------------------------------------------------------
do $$
declare
  defn text;
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'sada_vw_validacao_tributaria' and c.relkind = 'm'
  ) then
    return;
  end if;

  defn := regexp_replace(
    pg_get_viewdef('public.sada_vw_validacao_tributaria'::regclass, true), ';\s*$', '');
  execute 'drop view public.sada_vw_validacao_tributaria';
  execute 'create materialized view public.sada_vw_validacao_tributaria as ' || defn;
  execute 'grant select on public.sada_vw_validacao_tributaria to anon, authenticated, service_role';
end $$;

-- Índice único sobre COLUNAS (exigência do REFRESH ... CONCURRENTLY; índice
-- sobre expressão é recusado). NULLS NOT DISTINCT faz o papel do coalesce:
-- uma chave nula colide aqui, na criação, e não no fim de uma importação.
create unique index if not exists idx_sada_vw_validacao_trib_chave
  on public.sada_vw_validacao_tributaria (cnpj_orgao, codigo) nulls not distinct;

-- ---------------------------------------------------------------------
-- 2. Recálculo só desta MV — o gatilho do salvar de regra
-- ---------------------------------------------------------------------
create or replace function public.sada_refresh_validacao()
returns void
language sql
security definer
set search_path to 'public'
as $$
  refresh materialized view concurrently public.sada_vw_validacao_tributaria;
$$;

comment on function public.sada_refresh_validacao() is
  'Recalcula a validação tributária. Chamada ao salvar ou excluir uma regra '
  '(/api/sada/regras) — por isso essas operações levam ~12 s. CONCURRENTLY: '
  'quem estiver com o dashboard aberto continua lendo durante o recálculo.';

-- ---------------------------------------------------------------------
-- 3. A importação também recalcula: linha nova muda o que a regra julga
-- ---------------------------------------------------------------------
create or replace function public.sada_refresh_mvs()
returns void
language sql
security definer
set search_path to 'public'
as $$
  refresh materialized view concurrently public.sada_mv_estoque_da;
  refresh materialized view concurrently public.sada_mv_arrec_da;
  refresh materialized view concurrently public.sada_vw_qualidade;
  refresh materialized view concurrently public.sada_vw_top_devedores;
  refresh materialized view concurrently public.sada_vw_recuperacao_da;
  refresh materialized view concurrently public.sada_vw_ranking_tributos;
  refresh materialized view concurrently public.sada_vw_estoque_ano;
  refresh materialized view concurrently public.sada_vw_arrecadacao_ano;
  refresh materialized view concurrently public.sada_vw_validacao_tributaria;
$$;

comment on function public.sada_refresh_mvs() is
  'Atualiza as materialized views de leitura do SADA. Chamada ao fim de cada '
  'importação (navegador, servidor e importador de linha de comando). '
  'CONCURRENTLY: o dashboard continua respondendo durante a atualização.';

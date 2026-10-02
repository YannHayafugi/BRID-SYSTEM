-- =====================================================================
-- SADA · views de leitura viram MATERIALIZED VIEW
--
-- Medido na base de produção (1,07 mi de linhas em dívida ativa, 4,2 mi em
-- lançamentos), com o dashboard e a tela de Qualidade abrindo:
--
--   sada_vw_qualidade          11 linhas devolvidas   13.483 ms
--   sada_vw_top_devedores      top 10                  2.582 ms
--   sada_vw_recuperacao_da     34 linhas               1.247 ms
--   sada_vw_ranking_tributos   34 linhas                 817 ms
--   sada_vw_estoque_ano       322 linhas                 791 ms
--
-- O plano do top devedores explica: Parallel Seq Scan em 1,06 milhão de
-- linhas e agregação estourando para disco (10 MB) para entregar 10 linhas.
-- Eram views comuns — cada abertura de tela recalculava tudo, e o custo
-- cresce com a base.
--
-- Agora são materializadas e atualizadas no mesmo ponto em que as outras
-- duas já eram: ao fim de cada importação, por sada_refresh_mvs(). O custo
-- sai da tela de quem consulta e vai para a carga, que já é demorada e tem
-- barra de progresso.
--
-- Depois da conversão, as mesmas consultas: qualidade 0 ms (era 13.483),
-- top devedores 14 ms (era 2.582), as demais 0 ms. O refresh das oito custa
-- ~20 s, uma vez por importação, e não bloqueia leitura.
--
-- A conversão preserva a definição EXATA de cada view (pg_get_viewdef), para
-- não haver chance de a regra de negócio mudar junto. Os nomes continuam os
-- mesmos, então nenhuma rota precisa ser alterada.
--
-- Idempotente: pode rodar de novo (pula o que já é materializado).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Converte view -> materialized view, mantendo nome e definição
-- ---------------------------------------------------------------------
do $$
declare
  alvo  text;
  defn  text;
begin
  foreach alvo in array array[
    'sada_vw_qualidade',
    'sada_vw_top_devedores',
    'sada_vw_recuperacao_da',
    'sada_vw_ranking_tributos',
    'sada_vw_estoque_ano',
    'sada_vw_arrecadacao_ano'
  ] loop
    -- relkind 'm' = já é materializada; nada a fazer.
    if exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = alvo and c.relkind = 'm'
    ) then
      continue;
    end if;

    defn := regexp_replace(pg_get_viewdef(format('public.%I', alvo)::regclass, true), ';\s*$', '');
    execute format('drop view public.%I', alvo);
    execute format('create materialized view public.%I as %s', alvo, defn);
    -- As views tinham SELECT para estes papéis; a materialização não herda.
    execute format('grant select on public.%I to anon, authenticated, service_role', alvo);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Índice único por MV — exigência do REFRESH ... CONCURRENTLY
--
-- Sobre COLUNAS, não sobre expressão: índice com coalesce() é recusado pelo
-- refresh concorrente ("cannot refresh materialized view concurrently").
--
-- NULLS NOT DISTINCT (PG 15+) faz o papel que o coalesce faria: hoje não há
-- nulo nas chaves, mas um ente que mandasse sigla vazia bastaria para o
-- refresh passar a falhar com "duplicate rows" — e a falha apareceria só no
-- fim de uma importação longa. Assim a colisão aparece aqui, na criação.
-- ---------------------------------------------------------------------
create unique index if not exists idx_sada_vw_qualidade_chave
  on public.sada_vw_qualidade (cnpj_orgao, codigo) nulls not distinct;

create unique index if not exists idx_sada_vw_top_devedores_chave
  on public.sada_vw_top_devedores (cnpj_orgao, cnpj_cpf) nulls not distinct;

create unique index if not exists idx_sada_vw_recuperacao_da_chave
  on public.sada_vw_recuperacao_da (cnpj_orgao, sigla) nulls not distinct;

create unique index if not exists idx_sada_vw_ranking_tributos_chave
  on public.sada_vw_ranking_tributos (cnpj_orgao, sigla) nulls not distinct;

create unique index if not exists idx_sada_vw_estoque_ano_chave
  on public.sada_vw_estoque_ano (cnpj_orgao, ano, sigla) nulls not distinct;

create unique index if not exists idx_sada_vw_arrecadacao_ano_chave
  on public.sada_vw_arrecadacao_ano (cnpj_orgao, origem, ano_arrec) nulls not distinct;

-- Índices de consulta: o dashboard filtra por ente e ordena por valor.
create index if not exists idx_sada_vw_top_devedores_ordem
  on public.sada_vw_top_devedores (cnpj_orgao, divida_total desc);

-- ---------------------------------------------------------------------
-- 3. sada_refresh_mvs: todas as oito, CONCURRENTLY
--
-- Sem CONCURRENTLY o refresh toma ACCESS EXCLUSIVE e qualquer leitura do
-- dashboard fica esperando — justamente no minuto em que a importação
-- termina e a pessoa vai conferir o resultado. Com índice único em todas,
-- a versão concorrente deixa a leitura passar enquanto atualiza.
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
$$;

comment on function public.sada_refresh_mvs() is
  'Atualiza as materialized views de leitura do SADA. Chamada ao fim de cada '
  'importação (navegador, servidor e importador de linha de comando). '
  'CONCURRENTLY: o dashboard continua respondendo durante a atualização.';

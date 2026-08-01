-- =====================================================================
-- SADA — Sistema de Análise de Dívida Ativa
-- Módulo apartado. Neste primeiro momento NÃO há vínculo com gp_orgaos:
-- o ente é identificado apenas pelo CNPJ (cnpj_orgao), informado na
-- importação. O mapeamento CNPJ -> gp_orgaos será feito depois.
-- Convenção alinhada ao módulo de Propostas: prefixo `sada_`, schema
-- public, SEM RLS (permissão validada na camada de API por perfil/role).
--
-- Origem: 4 planilhas, uma aba por ano (2015–2025), cabeçalho idêntico
-- entre anos. Os dados podem ser de entes diferentes (por isso cnpj_orgao).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Controle de importações
--    "Retrato + histórico": cada carga registra um lote. O lote novo entra
--    como vigente = true; o anterior (mesmo cnpj_orgao + tipo + ano) é
--    marcado vigente = false pelo importador, mas NÃO é apagado (histórico).
--    Dashboards leem o vigente; o histórico permanece consultável.
-- ---------------------------------------------------------------------
create table if not exists public.sada_importacoes (
  id            bigint generated always as identity primary key,
  cnpj_orgao    text not null,                 -- CNPJ do ente (sem FK por enquanto)
  tipo          text not null check (tipo in
                  ('divida_ativa', 'lancamentos', 'recebimentos', 'recebimentos_da')),
  arquivo_nome  text,
  ano_inicio    int,
  ano_fim       int,
  vigente       boolean not null default true,
  linhas_importadas int not null default 0,
  importado_por uuid references public.gp_profiles (id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_sada_import_ente on public.sada_importacoes (cnpj_orgao, tipo, vigente);

-- ---------------------------------------------------------------------
-- 1. DÍVIDA ATIVA (estoque) — 13 colunas de origem
-- ---------------------------------------------------------------------
create table if not exists public.sada_divida_ativa (
  id            bigint generated always as identity primary key,
  cnpj_orgao    text not null,
  importacao_id bigint references public.sada_importacoes (id) on delete cascade,
  ano           int not null,                  -- aba de origem (competência do arquivo)
  sequencia     bigint,                         -- CHAVE de junção entre tabelas
  sigla         text,                           -- tributo: IPTU, ISS, TAXA...
  inscricao     text,                           -- inscrição imobiliária/cadastral
  cnpj_cpf      text,                           -- contribuinte
  descricao     text,
  fase          text,
  mes_venc      smallint,
  ano_venc      int,
  valor         numeric(15,2),
  atualizacao   numeric(15,2),
  juros         numeric(15,2),
  multa         numeric(15,2),
  total         numeric(15,2),
  created_at    timestamptz not null default now()
);
create index if not exists idx_sada_da_ente_ano   on public.sada_divida_ativa (cnpj_orgao, ano);
create index if not exists idx_sada_da_sequencia   on public.sada_divida_ativa (sequencia);
create index if not exists idx_sada_da_sigla        on public.sada_divida_ativa (cnpj_orgao, sigla);
create index if not exists idx_sada_da_inscricao    on public.sada_divida_ativa (cnpj_orgao, inscricao);
create index if not exists idx_sada_da_cnpj_cpf     on public.sada_divida_ativa (cnpj_orgao, cnpj_cpf);
create index if not exists idx_sada_da_importacao   on public.sada_divida_ativa (importacao_id);

-- ---------------------------------------------------------------------
-- 2. LANÇAMENTOS — 9 colunas de origem
-- ---------------------------------------------------------------------
create table if not exists public.sada_lancamentos (
  id            bigint generated always as identity primary key,
  cnpj_orgao    text not null,
  importacao_id bigint references public.sada_importacoes (id) on delete cascade,
  ano           int not null,
  sequencia     bigint,                         -- CHAVE de junção
  sigla         text,
  inscricao     text,
  cnpj_cpf      text,
  descricao     text,
  fase          text,
  mes_lancto    smallint,                       -- mês do lançamento
  exercicio     int,
  valor         numeric(15,2),
  created_at    timestamptz not null default now()
);
create index if not exists idx_sada_lanc_ente_ano  on public.sada_lancamentos (cnpj_orgao, ano);
create index if not exists idx_sada_lanc_sequencia  on public.sada_lancamentos (sequencia);
create index if not exists idx_sada_lanc_sigla       on public.sada_lancamentos (cnpj_orgao, sigla);
create index if not exists idx_sada_lanc_inscricao   on public.sada_lancamentos (cnpj_orgao, inscricao);
create index if not exists idx_sada_lanc_cnpj_cpf    on public.sada_lancamentos (cnpj_orgao, cnpj_cpf);
create index if not exists idx_sada_lanc_importacao  on public.sada_lancamentos (importacao_id);

-- ---------------------------------------------------------------------
-- 3. RECEBIMENTOS (arrecadação normal) — 18 colunas de origem
-- ---------------------------------------------------------------------
create table if not exists public.sada_recebimentos (
  id            bigint generated always as identity primary key,
  cnpj_orgao    text not null,
  importacao_id bigint references public.sada_importacoes (id) on delete cascade,
  ano           int not null,
  sequencia     bigint,                         -- CHAVE de junção
  sigla         text,
  inscricao     text,
  cnpj_cpf      text,
  descricao     text,
  fase          text,
  data_contrato date,                           -- origem 'NULL' → null
  mes_venc      smallint,
  ano_venc      int,
  valor         numeric(15,2),
  vlam          numeric(15,2),                  -- atualização monetária
  vljm          numeric(15,2),                  -- juros de mora
  vlmm          numeric(15,2),                  -- multa de mora
  vldesc        numeric(15,2),                  -- desconto
  vlel          numeric(15,2),                  -- origem 'NULL' → null
  totaldam      numeric(15,2),                  -- total do DAM
  mes_arrec     smallint,
  ano_arrec     int,
  created_at    timestamptz not null default now()
);
create index if not exists idx_sada_rec_ente_ano   on public.sada_recebimentos (cnpj_orgao, ano);
create index if not exists idx_sada_rec_sequencia   on public.sada_recebimentos (sequencia);
create index if not exists idx_sada_rec_arrec        on public.sada_recebimentos (cnpj_orgao, ano_arrec, mes_arrec);
create index if not exists idx_sada_rec_sigla        on public.sada_recebimentos (cnpj_orgao, sigla);
create index if not exists idx_sada_rec_inscricao    on public.sada_recebimentos (cnpj_orgao, inscricao);
create index if not exists idx_sada_rec_importacao   on public.sada_recebimentos (importacao_id);

-- ---------------------------------------------------------------------
-- 4. RECEBIMENTOS DA (arrecadação de dívida ativa) — mesmas 18 colunas
-- ---------------------------------------------------------------------
create table if not exists public.sada_recebimentos_da (
  id            bigint generated always as identity primary key,
  cnpj_orgao    text not null,
  importacao_id bigint references public.sada_importacoes (id) on delete cascade,
  ano           int not null,
  sequencia     bigint,                         -- CHAVE de junção
  sigla         text,
  inscricao     text,
  cnpj_cpf      text,
  descricao     text,
  fase          text,
  data_contrato date,
  mes_venc      smallint,
  ano_venc      int,
  valor         numeric(15,2),
  vlam          numeric(15,2),
  vljm          numeric(15,2),
  vlmm          numeric(15,2),
  vldesc        numeric(15,2),
  vlel          numeric(15,2),
  totaldam      numeric(15,2),
  mes_arrec     smallint,
  ano_arrec     int,
  created_at    timestamptz not null default now()
);
create index if not exists idx_sada_recda_ente_ano on public.sada_recebimentos_da (cnpj_orgao, ano);
create index if not exists idx_sada_recda_sequencia on public.sada_recebimentos_da (sequencia);
create index if not exists idx_sada_recda_arrec      on public.sada_recebimentos_da (cnpj_orgao, ano_arrec, mes_arrec);
create index if not exists idx_sada_recda_sigla      on public.sada_recebimentos_da (cnpj_orgao, sigla);
create index if not exists idx_sada_recda_inscricao  on public.sada_recebimentos_da (cnpj_orgao, inscricao);
create index if not exists idx_sada_recda_importacao on public.sada_recebimentos_da (importacao_id);

-- ---------------------------------------------------------------------
-- 5. Materialized views (somente lotes vigentes = retrato atual).
--    Atualizar após cada importação:  refresh materialized view <nome>;
-- ---------------------------------------------------------------------

-- Estoque de dívida ativa vigente por ente / ano / tributo
create materialized view if not exists public.sada_mv_estoque_da as
  select d.cnpj_orgao, d.ano, d.sigla,
         count(*)     as qtd_titulos,
         sum(d.valor) as valor_principal,
         sum(d.total) as valor_total
  from public.sada_divida_ativa d
  join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
  group by d.cnpj_orgao, d.ano, d.sigla;
create unique index if not exists idx_sada_mv_estoque
  on public.sada_mv_estoque_da (cnpj_orgao, ano, sigla);

-- Arrecadação de dívida ativa vigente por ente / ano de arrecadação / tributo
create materialized view if not exists public.sada_mv_arrec_da as
  select r.cnpj_orgao, r.ano_arrec, r.sigla,
         count(*)        as qtd_pagamentos,
         sum(r.totaldam) as valor_arrecadado
  from public.sada_recebimentos_da r
  join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
  group by r.cnpj_orgao, r.ano_arrec, r.sigla;
create unique index if not exists idx_sada_mv_arrec
  on public.sada_mv_arrec_da (cnpj_orgao, ano_arrec, sigla);

-- ---------------------------------------------------------------------
-- 6. Qualidade dos dados — uma linha por verificação, sobre o lote vigente.
--    Alimenta /sada/qualidade e o aviso no dashboard.
--    `qtd` = linhas com o problema; `base` = linhas examinadas na tabela.
--    Categorias: total_nulo | contribuinte | valor | campo_chave.
-- ---------------------------------------------------------------------
create or replace view public.sada_vw_qualidade as
with da as (
  select d.* from public.sada_divida_ativa d
  join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
), lc as (
  select l.* from public.sada_lancamentos l
  join public.sada_importacoes i on i.id = l.importacao_id and i.vigente
), rc as (
  select r.* from public.sada_recebimentos r
  join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
), rd as (
  select r.* from public.sada_recebimentos_da r
  join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
)
select categoria, tabela, problema, qtd, base from (
  -- DÍVIDA ATIVA
  select 'total_nulo'::text  as categoria, 'divida_ativa'::text as tabela,
         'Dívida Ativa — total nulo (só principal)'::text as problema,
         count(*) filter (where total is null) as qtd,
         (select count(*) from da) as base
    from da
  union all
  select 'contribuinte', 'divida_ativa', 'Dívida Ativa — CNPJ/CPF zerado ou vazio',
         count(*) filter (where cnpj_cpf is null or btrim(cnpj_cpf) = ''
                             or regexp_replace(cnpj_cpf, '\D', '', 'g') ~ '^0+$'),
         (select count(*) from da)
    from da
  union all
  select 'valor', 'divida_ativa', 'Dívida Ativa — valor nulo ou ≤ 0',
         count(*) filter (where valor is null or valor <= 0),
         (select count(*) from da)
    from da
  union all
  select 'campo_chave', 'divida_ativa', 'Dívida Ativa — sigla vazia',
         count(*) filter (where sigla is null or btrim(sigla) = ''),
         (select count(*) from da)
    from da
  union all
  select 'campo_chave', 'divida_ativa', 'Dívida Ativa — inscrição vazia',
         count(*) filter (where inscricao is null or btrim(inscricao) = ''),
         (select count(*) from da)
    from da
  union all
  select 'campo_chave', 'divida_ativa', 'Dívida Ativa — sequência nula',
         count(*) filter (where sequencia is null),
         (select count(*) from da)
    from da
  -- LANÇAMENTOS
  union all
  select 'valor', 'lancamentos', 'Lançamentos — valor nulo ou ≤ 0',
         count(*) filter (where valor is null or valor <= 0),
         (select count(*) from lc)
    from lc
  union all
  select 'contribuinte', 'lancamentos', 'Lançamentos — CNPJ/CPF zerado ou vazio',
         count(*) filter (where cnpj_cpf is null or btrim(cnpj_cpf) = ''
                             or regexp_replace(cnpj_cpf, '\D', '', 'g') ~ '^0+$'),
         (select count(*) from lc)
    from lc
  union all
  select 'campo_chave', 'lancamentos', 'Lançamentos — sigla vazia',
         count(*) filter (where sigla is null or btrim(sigla) = ''),
         (select count(*) from lc)
    from lc
  union all
  select 'campo_chave', 'lancamentos', 'Lançamentos — sequência nula',
         count(*) filter (where sequencia is null),
         (select count(*) from lc)
    from lc
  -- RECEBIMENTOS
  union all
  select 'valor', 'recebimentos', 'Recebimentos — totaldam nulo ou ≤ 0',
         count(*) filter (where totaldam is null or totaldam <= 0),
         (select count(*) from rc)
    from rc
  union all
  select 'campo_chave', 'recebimentos', 'Recebimentos — sequência nula',
         count(*) filter (where sequencia is null),
         (select count(*) from rc)
    from rc
  -- RECEBIMENTOS DA
  union all
  select 'valor', 'recebimentos_da', 'Recebimentos DA — totaldam nulo ou ≤ 0',
         count(*) filter (where totaldam is null or totaldam <= 0),
         (select count(*) from rd)
    from rd
  union all
  select 'campo_chave', 'recebimentos_da', 'Recebimentos DA — sequência nula',
         count(*) filter (where sequencia is null),
         (select count(*) from rd)
    from rd
) t
order by qtd desc;

-- ---------------------------------------------------------------------
-- 7. Views analíticas — leem sempre o lote vigente (join em sada_importacoes
--    com i.vigente). Consumidas por /api/sada/dashboard e pelos scripts.
--    Ao contrário das materialized views da seção 5, não precisam de refresh.
-- ---------------------------------------------------------------------

-- Estoque de dívida ativa por ente / ano / tributo (principal e total)
create or replace view public.sada_vw_estoque_ano as
  select d.cnpj_orgao, d.ano, d.sigla,
         count(*)     as qtd_titulos,
         sum(d.valor) as principal,
         sum(d.total) as total
  from public.sada_divida_ativa d
  join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
  group by d.cnpj_orgao, d.ano, d.sigla;

-- Arrecadação anual, separando origem normal x dívida ativa
create or replace view public.sada_vw_arrecadacao_ano as
  select r.cnpj_orgao, 'normal'::text as origem, r.ano_arrec,
         sum(r.totaldam) as valor
  from public.sada_recebimentos r
  join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
  group by r.cnpj_orgao, r.ano_arrec
  union all
  select r.cnpj_orgao, 'divida_ativa'::text, r.ano_arrec,
         sum(r.totaldam)
  from public.sada_recebimentos_da r
  join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
  group by r.cnpj_orgao, r.ano_arrec;

-- Mesma abertura da anterior, com mês e tributo (série mensal)
create or replace view public.sada_vw_arrecadacao_mensal as
  select r.cnpj_orgao, 'normal'::text as origem, r.ano_arrec, r.mes_arrec, r.sigla,
         count(*)        as qtd,
         sum(r.totaldam) as valor
  from public.sada_recebimentos r
  join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
  group by r.cnpj_orgao, r.ano_arrec, r.mes_arrec, r.sigla
  union all
  select r.cnpj_orgao, 'divida_ativa'::text, r.ano_arrec, r.mes_arrec, r.sigla,
         count(*),
         sum(r.totaldam)
  from public.sada_recebimentos_da r
  join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
  group by r.cnpj_orgao, r.ano_arrec, r.mes_arrec, r.sigla;

-- Ranking de tributos: estoque somado + arrecadado de DA do mesmo tributo
create or replace view public.sada_vw_ranking_tributos as
  select e.cnpj_orgao, e.sigla,
         sum(e.total) as estoque_total,
         (select sum(r.totaldam)
            from public.sada_recebimentos_da r
            join public.sada_importacoes i2 on i2.id = r.importacao_id and i2.vigente
           where r.cnpj_orgao = e.cnpj_orgao and r.sigla = e.sigla) as arrecadado_da
  from public.sada_divida_ativa e
  join public.sada_importacoes i on i.id = e.importacao_id and i.vigente
  group by e.cnpj_orgao, e.sigla;

-- Maiores devedores por contribuinte (ordenação fica a cargo do consumidor)
create or replace view public.sada_vw_top_devedores as
  select d.cnpj_orgao, d.cnpj_cpf,
         count(*)     as qtd_titulos,
         sum(d.total) as divida_total
  from public.sada_divida_ativa d
  join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
  where d.cnpj_cpf is not null
  group by d.cnpj_orgao, d.cnpj_cpf;

-- Taxa de recuperação por tributo: estoque remanescente x arrecadado de DA.
-- FULL JOIN para não perder tributo que só existe de um dos lados.
create or replace view public.sada_vw_recuperacao_da as
with estoque as (
  select d.cnpj_orgao, d.sigla, sum(d.total) as estoque_atual
  from public.sada_divida_ativa d
  join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
  group by d.cnpj_orgao, d.sigla
), arrec as (
  select r.cnpj_orgao, r.sigla, sum(r.totaldam) as arrecadado
  from public.sada_recebimentos_da r
  join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
  group by r.cnpj_orgao, r.sigla
)
select coalesce(e.cnpj_orgao, a.cnpj_orgao) as cnpj_orgao,
       coalesce(e.sigla, a.sigla)           as sigla,
       coalesce(e.estoque_atual, 0)         as estoque_atual,
       coalesce(a.arrecadado, 0)            as arrecadado_da,
       round(100 * coalesce(a.arrecadado, 0)
             / nullif(coalesce(a.arrecadado, 0) + coalesce(e.estoque_atual, 0), 0), 2) as pct_recuperacao
from estoque e
full join arrec a on e.cnpj_orgao = a.cnpj_orgao and e.sigla = a.sigla;

-- Entes que já importaram para o SADA mas ainda não existem em gp_orgaos
-- (compara só os dígitos do CNPJ). Alimenta o KPI e scripts/sada-pendentes.ts.
create or replace view public.sada_entes_pendentes as
  select i.cnpj_orgao,
         min(i.created_at) as primeira_importacao,
         count(*)          as qtd_lotes
  from public.sada_importacoes i
  left join public.gp_orgaos o
    on regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') = regexp_replace(i.cnpj_orgao, '\D', '', 'g')
  where o.id is null
  group by i.cnpj_orgao;

-- ---------------------------------------------------------------------
-- 8. Refresh das materialized views da seção 5. Chamada via rpc pelo
--    importador (scripts/sada-import.ts e /api/sada/importar/finalizar).
--    security definer porque a API chega com role sem permissão de refresh.
-- ---------------------------------------------------------------------
create or replace function public.sada_refresh_mvs()
returns void
language sql
security definer
set search_path to 'public'
as $$
  refresh materialized view public.sada_mv_estoque_da;
  refresh materialized view public.sada_mv_arrec_da;
$$;

-- ---------------------------------------------------------------------
-- 9. RLS: habilitado (mesma postura das tabelas gp_). Sem políticas =
--    acesso somente via service role na camada de API. Roles de view
--    entram como políticas/checagens depois.
-- ---------------------------------------------------------------------
alter table public.sada_importacoes    enable row level security;
alter table public.sada_divida_ativa   enable row level security;
alter table public.sada_lancamentos    enable row level security;
alter table public.sada_recebimentos   enable row level security;
alter table public.sada_recebimentos_da enable row level security;

-- =====================================================================
-- Notas:
-- * Vínculo com Órgão (gp_orgaos) será adicionado depois via cnpj_orgao.
-- * SEQUENCIA junta as tabelas (lançamento <-> recebimento <-> dívida)
--   dentro do mesmo cnpj_orgao — base para taxa de recuperação por título.
-- * Retrato + histórico: importador marca o lote novo vigente=true e o
--   anterior (mesmo cnpj_orgao+tipo+ano) vigente=false, sem apagar.
-- * Valores vêm como texto ('260.01','0.00','NULL') — importador converte
--   para numeric/null e preenche cnpj_orgao + ano por lote.
-- * Após importar, rodar refresh das materialized views (rpc sada_refresh_mvs).
-- * Dependência externa: sada_entes_pendentes lê public.gp_orgaos e
--   sada_importacoes referencia public.gp_profiles — ambas vêm de
--   schema-unificado.sql, que precisa rodar ANTES deste arquivo.
-- =====================================================================

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
-- Um agregado por tabela: TODAS as checagens saem de um único scan, via
-- count(*) filter. A versão anterior repetia `(select count(*) from da)` em
-- cada branch do union, o que fazia o Postgres reescanear as CTEs dezenas de
-- vezes — 7,6 s contra os 8 s de statement_timeout. Assim fica ~0,6 s.
-- Os `values` abaixo desempilham o agregado de volta em uma linha por check.
, agg_da as (
  select cnpj_orgao, count(*) as base,
         count(*) filter (where total is null) as c1,
         count(*) filter (where cnpj_cpf is null or btrim(cnpj_cpf) = ''
                             or regexp_replace(cnpj_cpf, '\D', '', 'g') ~ '^0+$') as c2,
         count(*) filter (where valor is null or valor <= 0) as c3,
         count(*) filter (where sigla is null or btrim(sigla) = '') as c4,
         count(*) filter (where inscricao is null or btrim(inscricao) = '') as c5,
         count(*) filter (where sequencia is null) as c6,
         -- Incoerência barata, no mesmo scan: total (com encargos) menor que o
         -- principal. Só faz sentido quando os dois estão preenchidos.
         count(*) filter (where total is not null and valor is not null
                            and total < valor) as c7
    from da
   group by cnpj_orgao
), agg_lc as (
  select cnpj_orgao, count(*) as base,
         count(*) filter (where valor is null or valor <= 0) as c1,
         count(*) filter (where cnpj_cpf is null or btrim(cnpj_cpf) = ''
                             or regexp_replace(cnpj_cpf, '\D', '', 'g') ~ '^0+$') as c2,
         count(*) filter (where sigla is null or btrim(sigla) = '') as c3,
         count(*) filter (where sequencia is null) as c4
    from lc
   group by cnpj_orgao
), agg_rc as (
  select cnpj_orgao, count(*) as base,
         count(*) filter (where totaldam is null or totaldam <= 0) as c1,
         count(*) filter (where sequencia is null) as c2
    from rc
   group by cnpj_orgao
), agg_rd as (
  select cnpj_orgao, count(*) as base,
         count(*) filter (where totaldam is null or totaldam <= 0) as c1,
         count(*) filter (where sequencia is null) as c2
    from rd
   group by cnpj_orgao
)
select cnpj_orgao, codigo, categoria, tabela, problema, qtd, base from (
  -- DÍVIDA ATIVA
  select a.cnpj_orgao, v.codigo, v.categoria, v.tabela, v.problema, v.qtd, a.base
    from agg_da a
    cross join lateral (values
      ('da_total_nulo'::text, 'total_nulo'::text, 'divida_ativa'::text, 'Dívida Ativa — total nulo (só principal)'::text, a.c1),
      ('da_contribuinte', 'contribuinte', 'divida_ativa', 'Dívida Ativa — CNPJ/CPF zerado ou vazio', a.c2),
      ('da_valor',        'valor',        'divida_ativa', 'Dívida Ativa — valor nulo ou ≤ 0',        a.c3),
      ('da_sigla',        'campo_chave',  'divida_ativa', 'Dívida Ativa — sigla vazia',              a.c4),
      ('da_inscricao',    'campo_chave',  'divida_ativa', 'Dívida Ativa — inscrição vazia',          a.c5),
      ('da_sequencia',    'campo_chave',  'divida_ativa', 'Dívida Ativa — sequência nula',           a.c6),
      ('da_total_menor_principal', 'incoerencia', 'divida_ativa',
                          'Dívida Ativa — total menor que o principal',                             a.c7)
    ) v(codigo, categoria, tabela, problema, qtd)
  -- LANÇAMENTOS
  union all
  select a.cnpj_orgao, v.codigo, v.categoria, v.tabela, v.problema, v.qtd, a.base
    from agg_lc a
    cross join lateral (values
      ('lc_valor'::text, 'valor'::text, 'lancamentos'::text, 'Lançamentos — valor nulo ou ≤ 0'::text, a.c1),
      ('lc_contribuinte', 'contribuinte', 'lancamentos', 'Lançamentos — CNPJ/CPF zerado ou vazio', a.c2),
      ('lc_sigla',        'campo_chave',  'lancamentos', 'Lançamentos — sigla vazia',              a.c3),
      ('lc_sequencia',    'campo_chave',  'lancamentos', 'Lançamentos — sequência nula',           a.c4)
    ) v(codigo, categoria, tabela, problema, qtd)
  -- RECEBIMENTOS
  union all
  select a.cnpj_orgao, v.codigo, v.categoria, v.tabela, v.problema, v.qtd, a.base
    from agg_rc a
    cross join lateral (values
      ('rc_totaldam'::text, 'valor'::text, 'recebimentos'::text, 'Recebimentos — totaldam nulo ou ≤ 0'::text, a.c1),
      ('rc_sequencia', 'campo_chave', 'recebimentos', 'Recebimentos — sequência nula',             a.c2)
    ) v(codigo, categoria, tabela, problema, qtd)
  -- RECEBIMENTOS DA
  union all
  select a.cnpj_orgao, v.codigo, v.categoria, v.tabela, v.problema, v.qtd, a.base
    from agg_rd a
    cross join lateral (values
      ('rd_totaldam'::text, 'valor'::text, 'recebimentos_da'::text, 'Recebimentos DA — totaldam nulo ou ≤ 0'::text, a.c1),
      ('rd_sequencia', 'campo_chave', 'recebimentos_da', 'Recebimentos DA — sequência nula',              a.c2)
    ) v(codigo, categoria, tabela, problema, qtd)
) t
order by qtd desc;

-- ---------------------------------------------------------------------
-- 6.1 Linhas por trás de cada verificação
--
-- O resumo acima diz QUANTAS; esta diz QUAIS. Os códigos batem com
-- sada_vw_qualidade.codigo, então a tela expande um check e lista as linhas.
--
-- SEMPRE consulte filtrando por codigo e cnpj_orgao. Sem filtro isto varre as
-- quatro tabelas inteiras — o mesmo risco de statement_timeout que motivou a
-- reescrita do resumo. Com o filtro, o Postgres descarta os ramos do union
-- cujo código literal não bate e usa os índices de cnpj_orgao.
-- ---------------------------------------------------------------------
create or replace view public.sada_vw_qualidade_linhas as
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
select cnpj_orgao, codigo, tabela, ano, sequencia, sigla, inscricao, cnpj_cpf, valor, detalhe from (
  select d.cnpj_orgao, v.codigo, 'divida_ativa'::text as tabela, d.ano, d.sequencia,
         d.sigla, d.inscricao, d.cnpj_cpf, d.valor,
         case when v.codigo = 'da_total_menor_principal'
              then 'total ' || coalesce(d.total::text, '?') || ' < principal ' || coalesce(d.valor::text, '?')
         end as detalhe
    from da d
    cross join lateral (values
      ('da_total_nulo'::text,       d.total is null),
      ('da_contribuinte',           d.cnpj_cpf is null or btrim(d.cnpj_cpf) = ''
                                      or regexp_replace(d.cnpj_cpf, '\D', '', 'g') ~ '^0+$'),
      ('da_valor',                  d.valor is null or d.valor <= 0),
      ('da_sigla',                  d.sigla is null or btrim(d.sigla) = ''),
      ('da_inscricao',              d.inscricao is null or btrim(d.inscricao) = ''),
      ('da_sequencia',              d.sequencia is null),
      ('da_total_menor_principal',  d.total is not null and d.valor is not null and d.total < d.valor)
    ) v(codigo, ruim)
   where v.ruim
  union all
  select l.cnpj_orgao, v.codigo, 'lancamentos'::text, l.ano, l.sequencia,
         l.sigla, l.inscricao, l.cnpj_cpf, l.valor, null::text
    from lc l
    cross join lateral (values
      ('lc_valor'::text,   l.valor is null or l.valor <= 0),
      ('lc_contribuinte',  l.cnpj_cpf is null or btrim(l.cnpj_cpf) = ''
                             or regexp_replace(l.cnpj_cpf, '\D', '', 'g') ~ '^0+$'),
      ('lc_sigla',         l.sigla is null or btrim(l.sigla) = ''),
      ('lc_sequencia',     l.sequencia is null)
    ) v(codigo, ruim)
   where v.ruim
  union all
  select r.cnpj_orgao, v.codigo, 'recebimentos'::text, r.ano, r.sequencia,
         r.sigla, r.inscricao, r.cnpj_cpf, r.totaldam, null::text
    from rc r
    cross join lateral (values
      ('rc_totaldam'::text, r.totaldam is null or r.totaldam <= 0),
      ('rc_sequencia',      r.sequencia is null)
    ) v(codigo, ruim)
   where v.ruim
  union all
  select r.cnpj_orgao, v.codigo, 'recebimentos_da'::text, r.ano, r.sequencia,
         r.sigla, r.inscricao, r.cnpj_cpf, r.totaldam, null::text
    from rd r
    cross join lateral (values
      ('rd_totaldam'::text, r.totaldam is null or r.totaldam <= 0),
      ('rd_sequencia',      r.sequencia is null)
    ) v(codigo, ruim)
   where v.ruim
) t;

-- ---------------------------------------------------------------------
-- 6.2 Duplicidades na base vigente
--
-- O importador já acusa repetição durante a leitura do arquivo, mas aquilo
-- morre quando a tela fecha. Aqui a informação persiste e cobre também a
-- repetição que só aparece depois — dois lotes vigentes do mesmo ano, por
-- exemplo, que o arquivo isolado não teria como mostrar.
--
-- Dois tipos:
--   linha_duplicada      — mesma linha de negócio repetida (todas as tabelas)
--   sequencia_duplicada  — só dívida ativa, onde cada título deveria aparecer
--                          uma vez. Em lançamentos e recebimentos é normal o
--                          mesmo título ter várias linhas (parcelas, pagamentos).
-- ---------------------------------------------------------------------
create or replace view public.sada_vw_duplicidades as
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
select cnpj_orgao, tipo, tabela, ano, sequencia, sigla, cnpj_cpf, valor, ocorrencias, detalhe from (
  select cnpj_orgao, 'linha_duplicada'::text as tipo, 'divida_ativa'::text as tabela,
         ano, sequencia, sigla, cnpj_cpf, valor, count(*) as ocorrencias, null::text as detalhe
    from da
   group by cnpj_orgao, ano, sequencia, sigla, inscricao, cnpj_cpf, valor
  having count(*) > 1
  union all
  select cnpj_orgao, 'sequencia_duplicada', 'divida_ativa', ano, sequencia,
         null::text, null::text, null::numeric, count(*),
         'mesmo título em ' || count(*) || ' linhas do ano'
    from da
   where sequencia is not null
   group by cnpj_orgao, ano, sequencia
  having count(*) > 1
  union all
  select cnpj_orgao, 'linha_duplicada', 'lancamentos', ano, sequencia, sigla, cnpj_cpf,
         valor, count(*), null::text
    from lc
   group by cnpj_orgao, ano, sequencia, sigla, inscricao, cnpj_cpf, valor
  having count(*) > 1
  union all
  select cnpj_orgao, 'linha_duplicada', 'recebimentos', ano, sequencia, sigla, cnpj_cpf,
         totaldam, count(*),
         'arrecadação ' || coalesce(mes_arrec::text, '?') || '/' || coalesce(ano_arrec::text, '?')
    from rc
   group by cnpj_orgao, ano, sequencia, sigla, inscricao, cnpj_cpf, totaldam, mes_arrec, ano_arrec
  having count(*) > 1
  union all
  select cnpj_orgao, 'linha_duplicada', 'recebimentos_da', ano, sequencia, sigla, cnpj_cpf,
         totaldam, count(*),
         'arrecadação ' || coalesce(mes_arrec::text, '?') || '/' || coalesce(ano_arrec::text, '?')
    from rd
   group by cnpj_orgao, ano, sequencia, sigla, inscricao, cnpj_cpf, totaldam, mes_arrec, ano_arrec
  having count(*) > 1
) t;

-- ---------------------------------------------------------------------
-- 6.3 Incoerências entre tabelas
--
-- Separada das anteriores de propósito: estas cruzam dívida ativa com
-- recebimentos DA e são as únicas verificações do módulo que fazem join entre
-- duas tabelas grandes. É o candidato natural a estourar o statement_timeout
-- de 8 s — consulte SEMPRE por cnpj_orgao, que tem índice nas duas pontas.
-- ---------------------------------------------------------------------
create or replace view public.sada_vw_incoerencias as
with da as (
  select d.* from public.sada_divida_ativa d
  join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
), rd as (
  select r.* from public.sada_recebimentos_da r
  join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
)
select r.cnpj_orgao,
       'recebimento_sem_titulo'::text as codigo,
       'recebimentos_da'::text        as tabela,
       r.ano, r.sequencia, r.sigla, r.cnpj_cpf, r.totaldam as valor,
       'sequência não existe na dívida ativa deste ente'::text as detalhe
  from rd r
 where r.sequencia is not null
   and not exists (
     select 1 from da d
      where d.cnpj_orgao = r.cnpj_orgao and d.sequencia = r.sequencia
   )
union all
select p.cnpj_orgao,
       'pago_maior_que_titulo', 'recebimentos_da',
       null::int, p.sequencia, null::text, null::text, p.pago,
       'pago ' || p.pago::text || ' contra título de ' || t.titulo::text
  from (
    select cnpj_orgao, sequencia, sum(totaldam) as pago
      from rd
     where sequencia is not null
     group by cnpj_orgao, sequencia
  ) p
  join (
    select cnpj_orgao, sequencia, max(coalesce(total, valor)) as titulo
      from da
     where sequencia is not null
     group by cnpj_orgao, sequencia
  ) t on t.cnpj_orgao = p.cnpj_orgao and t.sequencia = p.sequencia
 where t.titulo is not null and p.pago > t.titulo;

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

-- ATENÇÃO À BASE: as três views abaixo somam `valor` (PRINCIPAL), não `total`.
-- `total` = principal + encargos só vem preenchido em parte das safras (nesta
-- base, 2 de 11). Somar `total` descartava silenciosamente as demais: o estoque
-- aparecia como R$ 35,7 mi contra R$ 76,2 mi reais, e 1.583 devedores (14,9%)
-- ficavam zerados no ranking. Principal está em 100% das linhas.

-- Ranking de tributos: estoque somado + arrecadado de DA do mesmo tributo
create or replace view public.sada_vw_ranking_tributos as
  select e.cnpj_orgao, e.sigla,
         sum(e.valor) as estoque_total,
         (select sum(r.valor)
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
         sum(d.valor) as divida_total
  from public.sada_divida_ativa d
  join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
  where d.cnpj_cpf is not null
  group by d.cnpj_orgao, d.cnpj_cpf;

-- Taxa de recuperação por tributo: estoque remanescente x arrecadado de DA.
-- FULL JOIN para não perder tributo que só existe de um dos lados.
-- A taxa compara PRINCIPAL com PRINCIPAL — comparar arrecadação com encargos
-- (totaldam) contra estoque sem eles inflaria o percentual. O caixa efetivo
-- fica em `arrecadado_caixa`, última coluna porque `create or replace view`
-- só admite acrescentar coluna no fim.
create or replace view public.sada_vw_recuperacao_da as
with estoque as (
  select d.cnpj_orgao, d.sigla, sum(d.valor) as estoque_principal
  from public.sada_divida_ativa d
  join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
  group by d.cnpj_orgao, d.sigla
), arrec as (
  select r.cnpj_orgao, r.sigla,
         sum(r.valor)    as arrecadado_principal,
         sum(r.totaldam) as arrecadado_caixa
  from public.sada_recebimentos_da r
  join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
  group by r.cnpj_orgao, r.sigla
)
select coalesce(e.cnpj_orgao, a.cnpj_orgao)   as cnpj_orgao,
       coalesce(e.sigla, a.sigla)             as sigla,
       coalesce(e.estoque_principal, 0)       as estoque_atual,
       coalesce(a.arrecadado_principal, 0)    as arrecadado_da,
       round(100 * coalesce(a.arrecadado_principal, 0)
             / nullif(coalesce(a.arrecadado_principal, 0)
                    + coalesce(e.estoque_principal, 0), 0), 2) as pct_recuperacao,
       coalesce(a.arrecadado_caixa, 0)        as arrecadado_caixa
from estoque e
full join arrec a on e.cnpj_orgao = a.cnpj_orgao and e.sigla = a.sigla;

-- Entes que já importaram para o SADA mas ainda não existem em gp_orgaos
-- (compara só os dígitos do CNPJ). Alimenta o KPI e scripts/sada-pendentes.ts.
-- ---------------------------------------------------------------------
-- CLIENTE -> CNPJs
--
-- O cliente é a prefeitura (registro em gp_orgaos). Ela costuma operar sob
-- vários CNPJs: a prefeitura em si, autarquias, fundos, câmaras. Cada um
-- manda planilha própria e chega ao SADA como um cnpj_orgao distinto, mas o
-- dashboard precisa somar o conjunto.
--
-- Um CNPJ pertence a um cliente só — daí o unique. O vínculo é opcional:
-- CNPJ importado sem cadastro continua funcionando e aparece em
-- sada_entes_pendentes, que é a fila de "falta vincular".
-- ---------------------------------------------------------------------
create table if not exists public.sada_ente_cnpj (
  id          bigint generated always as identity primary key,
  orgao_id    uuid not null references public.gp_orgaos (id) on delete cascade,
  cnpj_orgao  text not null unique,      -- somente dígitos
  apelido     text,                      -- "Prefeitura", "IPREV", "SAAE"
  created_at  timestamptz not null default now(),
  created_by  uuid references public.gp_profiles (id)
);
create index if not exists idx_sada_ente_cnpj_orgao on public.sada_ente_cnpj (orgao_id);

-- Fila de vínculo: CNPJs que já importaram e ainda não pertencem a cliente
-- nenhum. Passa a olhar sada_ente_cnpj (vínculo explícito) em vez de casar
-- pelo CNPJ do próprio gp_orgaos — uma autarquia nunca casaria por ali.
create or replace view public.sada_entes_pendentes as
  select i.cnpj_orgao,
         min(i.created_at) as primeira_importacao,
         count(*)          as qtd_lotes
  from public.sada_importacoes i
  left join public.sada_ente_cnpj v on v.cnpj_orgao = i.cnpj_orgao
  where v.id is null
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
-- 9. DE/PARA — cada ente manda a planilha no layout do seu próprio sistema
--    de origem. Estas tabelas guardam a tradução; o importador deixa de ler
--    por posição fixa e passa a interpretar o mapa.
--
--    Sem linha aqui, o importador cai no MAPA_PADRAO de lib/sada/depara.ts
--    (o layout posicional histórico) — por isso não há seed: ente antigo
--    continua importando sem nenhum cadastro.
-- ---------------------------------------------------------------------

-- Mapa de COLUNAS: um por ente + tipo de planilha.
create table if not exists public.sada_depara (
  id            bigint generated always as identity primary key,
  -- SOMENTE DÍGITOS. A API normaliza na gravação e na busca: com pontuação
  -- livre, o mesmo ente digitado "12.345.678/0001-90" numa tela e
  -- "12345678000190" na outra virava dois cadastros, o importador não achava
  -- o mapa e caía no MAPA_PADRAO traduzindo a planilha por posição.
  cnpj_orgao    text not null,
  tipo          text not null check (tipo in
                  ('divida_ativa', 'lancamentos', 'recebimentos', 'recebimentos_da')),
  -- Um ente pode ter mais de um mapa por tipo (trocou de sistema no meio do
  -- ano, layout novo em teste). A tela de importação escolhe qual usar; sem
  -- escolha explícita vale o de updated_at mais recente.
  nome          text not null default 'Padrão',
  -- Como as abas viram o campo `ano`:
  --   ano_no_nome      = nome da aba é o ano (formato histórico)
  --   abas_escolhidas  = usuário marca quais abas entram e o ano de cada uma
  abas_modo     text not null default 'ano_no_nome'
                  check (abas_modo in ('ano_no_nome', 'abas_escolhidas')),
  abas          jsonb,                          -- [{"nome":"Plan1","ano":2024}]
  -- campo destino -> {"origem": <nome da coluna|índice>, "transform": "..."}
  --                | {"constante": <valor>}
  -- `transform` só aparece quando difere do tipo natural do campo destino
  -- (ex.: data_mes/data_ano, que extraem de uma única coluna de data).
  mapa          jsonb not null default '{}'::jsonb,
  observacao    text,
  criado_por    uuid references public.gp_profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (cnpj_orgao, tipo, nome)
);

-- DE/PARA de VALORES: normaliza o vocabulário do ente para o canônico.
-- Escopo é o ente inteiro (sem `tipo`) de propósito: a sigla precisa casar
-- entre dívida ativa, lançamentos e recebimentos, senão o ranking fragmenta.
-- `valor_origem` é gravado já normalizado (upper + trim) — ver lib/sada/depara.ts.
create table if not exists public.sada_depara_valor (
  id             bigint generated always as identity primary key,
  cnpj_orgao     text not null,          -- somente dígitos (ver sada_depara)
  campo          text not null default 'sigla' check (campo in ('sigla', 'fase')),
  valor_origem   text not null,
  valor_canonico text not null,
  created_at     timestamptz not null default now(),
  unique (cnpj_orgao, campo, valor_origem)
);
create index if not exists idx_sada_depara_valor_ente
  on public.sada_depara_valor (cnpj_orgao, campo);

-- ---------------------------------------------------------------------
-- 10. Insumos da previsão orçamentária (/api/sada/previsao).
--     Entregam dados calibráveis, não a projeção — o cálculo roda no
--     navegador para a tela responder a cada ajuste de parâmetro.
--     Fórmulas e limites: docs/SADA-PREVISAO-ORCAMENTARIA.md
-- ---------------------------------------------------------------------

-- Estoque em aberto por safra de inscrição.
-- `total` só existe nas safras em que a planilha trouxe encargos — nesta base,
-- 2 de 11. É dessas duas que sai a taxa de encargos, pela razão entre as razões
-- total/principal, que cancela a data (desconhecida) da foto.
-- titulos/contribuintes alimentam o detector de quebra estrutural.
create or replace view public.sada_vw_prev_safras as
  select d.ano,
         count(*)                   as titulos,
         count(distinct d.cnpj_cpf) as contribuintes,
         sum(d.valor)               as principal,
         sum(d.total)               as total
  from public.sada_divida_ativa d
  join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
  group by d.ano;

-- Distribuição do recuperado por idade da dívida.
-- Sem join por sequencia: título pago sai do estoque, então os conjuntos são
-- disjuntos por construção (verificado — 67.897 recebimentos, zero casaram).
-- A idade vem de ano_arrec - ano_venc; a janela 0..20 corta ano invertido.
create or replace view public.sada_vw_prev_curva as
  select (r.ano_arrec - r.ano_venc) as idade,
         count(*)                   as pagamentos,
         sum(r.totaldam)            as valor
  from public.sada_recebimentos_da r
  join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
  where r.ano_arrec is not null and r.ano_venc is not null
    and (r.ano_arrec - r.ano_venc) between 0 and 20
  group by 1;

-- Séries anuais de fluxo. O filtro de ano descarta resíduo obviamente errado
-- (a base tem linhas em 1899 e 2041) sem depender de constante por ente.
create or replace view public.sada_vw_prev_series as
  with lanc as (
    select l.ano, sum(l.valor) as lancado
    from public.sada_lancamentos l
    join public.sada_importacoes i on i.id = l.importacao_id and i.vigente
    where l.ano between 2000 and extract(year from now())::int + 1
    group by l.ano
  ), rec as (
    select r.ano_arrec as ano, sum(r.totaldam) as arrecadado_normal
    from public.sada_recebimentos r
    join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
    where r.ano_arrec between 2000 and extract(year from now())::int + 1
    group by r.ano_arrec
  ), recda as (
    select r.ano_arrec as ano, sum(r.totaldam) as arrecadado_da
    from public.sada_recebimentos_da r
    join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
    where r.ano_arrec between 2000 and extract(year from now())::int + 1
    group by r.ano_arrec
  )
  select coalesce(l.ano, rc.ano, rd.ano) as ano,
         l.lancado, rc.arrecadado_normal, rd.arrecadado_da
  from lanc l
  full join rec   rc on rc.ano = l.ano
  full join recda rd on rd.ano = coalesce(l.ano, rc.ano);

-- ---------------------------------------------------------------------
-- 11. RLS: habilitado (mesma postura das tabelas gp_). Sem políticas =
--    acesso somente via service role na camada de API. Roles de view
--    entram como políticas/checagens depois.
-- ---------------------------------------------------------------------
alter table public.sada_importacoes    enable row level security;
alter table public.sada_divida_ativa   enable row level security;
alter table public.sada_lancamentos    enable row level security;
alter table public.sada_recebimentos   enable row level security;
alter table public.sada_recebimentos_da enable row level security;
alter table public.sada_depara         enable row level security;
alter table public.sada_depara_valor   enable row level security;

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

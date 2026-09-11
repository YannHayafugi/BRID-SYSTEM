-- =====================================================================
-- SADA · migração: cliente com vários CNPJs + qualidade detalhada por ente
--
-- Rode UMA VEZ no SQL Editor de cada banco que já tem dados, DEPOIS da
-- migração supabase/migracao-sada-cnpj-e-mapas.sql. Bancos criados do zero a
-- partir de supabase/sada-schema.sql já nascem com esta estrutura.
--
-- O que muda:
--
-- 1. sada_ente_cnpj — o cliente é a prefeitura (registro em gp_orgaos) e pode
--    operar sob vários CNPJs (prefeitura, autarquias, fundos). Cada um chega
--    ao SADA como um cnpj_orgao próprio; o dashboard soma o conjunto.
--
-- 2. sada_entes_pendentes passa a ser a fila de vínculo: CNPJs que já
--    importaram e ainda não pertencem a cliente nenhum. Antes tentava casar
--    pelo CNPJ do próprio gp_orgaos, o que nunca acharia uma autarquia.
--
-- 3. sada_vw_qualidade ganha cnpj_orgao (agrupa por ente) e codigo, que liga
--    cada verificação às linhas que a originaram.
--
-- 4. Três views novas: sada_vw_qualidade_linhas (quais linhas),
--    sada_vw_duplicidades (repetição na base vigente) e
--    sada_vw_incoerencias (cruzamentos entre dívida ativa e recebimentos).
--
-- Nenhum dado é apagado: tudo aqui é estrutura.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Cliente -> CNPJs, e a fila de vínculo.
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
-- 2. Qualidade.
--
-- O drop é necessário: create or replace view não aceita mudar a lista de
-- colunas, e sada_vw_qualidade ganhou cnpj_orgao e codigo à esquerda.
-- Nada depende dela além da API, então o drop é seguro.
-- ---------------------------------------------------------------------
drop view if exists public.sada_vw_qualidade;

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

commit;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
-- CNPJs importados que ainda não têm cliente:
-- select * from public.sada_entes_pendentes order by qtd_lotes desc;

-- Vincular um CNPJ a um cliente (orgao_id vem de gp_orgaos):
-- insert into public.sada_ente_cnpj (orgao_id, cnpj_orgao, apelido)
-- values ('<uuid-do-gp_orgaos>', '12345678000190', 'Prefeitura');

-- As duas consultas abaixo são as caras do módulo. Rode filtrando por ente e
-- confirme que voltam dentro do statement_timeout de 8 s antes de liberar a
-- tela para todo mundo:
-- select * from public.sada_vw_duplicidades where cnpj_orgao = '12345678000190' limit 50;
-- select * from public.sada_vw_incoerencias  where cnpj_orgao = '12345678000190' limit 50;

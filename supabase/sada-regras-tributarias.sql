-- =====================================================================
-- SADA · Regras tributárias (lei geral + lei municipal) e validação
--
-- O que este arquivo cria:
--   1. sada_regra_tributaria          cadastro das regras, em dois níveis
--   2. sada_vw_regra_linha            casa cada linha da DA com a regra vigente
--   3. sada_vw_validacao_tributaria   resumo: uma linha por verificação/ente
--   4. sada_vw_validacao_linhas       o detalhe, para a tela e o xlsx
--   5. a lei geral inicial (CTN + jurisprudência)
--
-- DOIS NÍVEIS:
--
--   LEI GERAL (nivel = 'geral', sem CNPJ) — vale para todos os entes. Traz
--   duas coisas: os LIMITES que nenhuma lei municipal pode ultrapassar (multa
--   de 20%, juros de 1% ao mês, prescrição em 5 anos) e a regra SUPLETIVA,
--   usada quando o município não tem lei cadastrada — é o que diz o CTN art.
--   161 §1º: juros de 1% ao mês "se a lei não dispuser de modo diverso".
--
--   LEI MUNICIPAL (nivel = 'municipal', com CNPJ) — as alíquotas do Código
--   Tributário daquele município. Prevalece sobre a geral no cálculo do
--   esperado, mas NÃO afasta os limites: multa municipal de 30% continua sendo
--   apontada como acima do teto.
--
-- ORDEM DE PRECEDÊNCIA, da mais forte para a mais fraca:
--   1. municipal + tributo específico (ex.: IPTU daquele ente)
--   2. municipal + '*' (todos os tributos do ente)
--   3. geral + tributo específico
--   4. geral + '*'
-- Dentro do mesmo nível, ganha a vigência mais recente que cobre a data.
--
-- VIGÊNCIA: dívida de 2016 é conferida com a lei de 2016, não com a de hoje.
--
-- DATA-BASE DA CONFERÊNCIA: a planilha é uma foto do estoque. Tomamos como
-- data-base 31/12 do último ano do lote (`ano_fim` da importação vigente, ou o
-- `ano` da própria linha quando ele falta). Não é exato — o ente pode ter
-- extraído em outro dia — e é por isso que toda comparação tem tolerância.
--
-- Idempotente: pode rodar de novo, inclusive sobre a versão anterior deste
-- arquivo (que não tinha o nível geral).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Cadastro das regras
-- ---------------------------------------------------------------------
create table if not exists public.sada_regra_tributaria (
  id             bigint generated always as identity primary key,
  cnpj_orgao     text,
  tributo        text not null default '*',
  vigencia_inicio date not null,
  vigencia_fim    date,
  multa_tipo     text not null default 'unica'
                   check (multa_tipo in ('unica', 'progressiva')),
  multa_pct      numeric(6,3),
  multa_teto_pct numeric(6,3),
  juros_modo     text not null default 'mensal'
                   check (juros_modo in ('mensal', 'selic')),
  juros_pct_mes  numeric(6,3),
  selic_media_aa numeric(6,3),
  correcao_indice  text,
  correcao_pct_aa  numeric(6,3),
  honorarios_pct numeric(6,3),
  tolerancia_pct   numeric(6,3) not null default 5,
  tolerancia_reais numeric(12,2) not null default 1,
  fundamento     text,
  observacao     text,
  criado_por     uuid references public.gp_profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);

-- Migração da versão anterior (só tinha regra municipal, com cnpj not null).
alter table public.sada_regra_tributaria
  add column if not exists nivel text not null default 'municipal',
  -- Limites da LEI GERAL. Ficam nulos nas regras municipais: quem manda no
  -- teto é a lei geral vigente, não o município conferido.
  add column if not exists teto_multa_pct      numeric(6,3),
  add column if not exists teto_juros_pct_mes  numeric(6,3),
  add column if not exists anos_prescricao     smallint;

alter table public.sada_regra_tributaria alter column cnpj_orgao    drop not null;
alter table public.sada_regra_tributaria alter column multa_pct     drop not null;
alter table public.sada_regra_tributaria alter column juros_pct_mes drop not null;
alter table public.sada_regra_tributaria alter column multa_pct     drop default;
alter table public.sada_regra_tributaria alter column juros_pct_mes drop default;

do $$ begin
  alter table public.sada_regra_tributaria
    add constraint sada_regra_nivel_chk check (nivel in ('geral', 'municipal'));
exception when duplicate_object then null; end $$;

-- Geral não tem CNPJ; municipal exige um. Sem isto, uma regra geral gravada
-- com CNPJ viraria regra municipal silenciosa — e vice-versa.
do $$ begin
  alter table public.sada_regra_tributaria
    add constraint sada_regra_nivel_cnpj_chk check (
      (nivel = 'geral'     and cnpj_orgao is null) or
      (nivel = 'municipal' and cnpj_orgao is not null));
exception when duplicate_object then null; end $$;

-- A unicidade antiga era (cnpj_orgao, tributo, vigencia_inicio) e não cobre
-- cnpj nulo: em Postgres, nulos nunca colidem, e daria para gravar duas leis
-- gerais iguais. O índice de expressão resolve.
alter table public.sada_regra_tributaria
  drop constraint if exists sada_regra_tributaria_cnpj_orgao_tributo_vigencia_inicio_key;
create unique index if not exists idx_sada_regra_chave
  on public.sada_regra_tributaria (coalesce(cnpj_orgao, '*'), tributo, vigencia_inicio);

create index if not exists idx_sada_regra_ente
  on public.sada_regra_tributaria (cnpj_orgao, tributo, vigencia_inicio desc);

comment on table public.sada_regra_tributaria is
  'Regras da validação tributária em dois níveis: lei geral (limites e regra '
  'supletiva, sem CNPJ) e lei municipal (alíquotas do ente). A municipal '
  'prevalece no esperado; os limites vêm sempre da geral.';

-- ---------------------------------------------------------------------
-- 2. Cada linha da dívida ativa vigente com a regra aplicável, os limites
--    da lei geral e os valores esperados.
-- ---------------------------------------------------------------------
-- As três views são recriadas do zero: o Postgres recusa um
-- `create or replace view` que acrescente coluna no meio (a versão anterior
-- não tinha regra_nivel), e as duas de baixo dependem desta.
drop view if exists public.sada_vw_validacao_linhas;
drop view if exists public.sada_vw_validacao_tributaria;
drop view if exists public.sada_vw_regra_linha;

create view public.sada_vw_regra_linha as
with da as (
  select d.*,
         make_date(coalesce(i.ano_fim, d.ano), 12, 31) as data_base
    from public.sada_divida_ativa d
    join public.sada_importacoes i
      on i.id = d.importacao_id and i.vigente
), venc as (
  select da.*,
         case when da.ano_venc between 1980 and 2100
               and da.mes_venc between 1 and 12
              then make_date(da.ano_venc, da.mes_venc, 1)
         end as data_venc
    from da
), base as (
  select v.*,
         -- Meses de atraso até a data-base. Fica NULO quando não há data ou
         -- quando o vencimento é posterior à foto: aí não há encargo nenhum a
         -- esperar, e comparar contra zero apontaria divergência em toda linha
         -- a vencer. Esse caso tem código próprio (trib_venc_futuro).
         case when v.data_venc is null or v.data_venc > v.data_base then null
              else (date_part('year',  age(v.data_base, v.data_venc)) * 12
                  + date_part('month', age(v.data_base, v.data_venc)))::int
         end as meses_atraso
    from venc v
), com_regra as (
  select b.*,
         r.id            as regra_id,
         r.nivel         as regra_nivel,
         r.tributo       as regra_tributo,
         r.multa_tipo, r.multa_pct, r.multa_teto_pct,
         r.juros_modo, r.juros_pct_mes, r.selic_media_aa,
         r.correcao_indice, r.correcao_pct_aa,
         r.tolerancia_pct, r.tolerancia_reais,
         -- Limites: sempre da lei geral vigente na data de vencimento. Os
         -- coalesce são a rede de segurança para uma base sem lei geral
         -- cadastrada — valem os números do CTN e da jurisprudência.
         coalesce(g.teto_multa_pct, 20)    as teto_multa_pct,
         coalesce(g.teto_juros_pct_mes, 1) as teto_juros_pct_mes,
         coalesce(g.anos_prescricao, 5)    as anos_prescricao
    from base b
    -- Regra do esperado: municipal ganha da geral, específica ganha da '*',
    -- e dentro disso vale a vigência mais recente que cobre o vencimento.
    left join lateral (
      select r.*
        from public.sada_regra_tributaria r
       where (r.cnpj_orgao = b.cnpj_orgao or r.cnpj_orgao is null)
         and (r.tributo = '*' or r.tributo = b.sigla)
         and b.data_venc is not null
         and r.vigencia_inicio <= b.data_venc
         and (r.vigencia_fim is null or r.vigencia_fim >= b.data_venc)
       order by (r.cnpj_orgao is not null) desc,
                (r.tributo <> '*') desc,
                r.vigencia_inicio desc
       limit 1
    ) r on true
    -- Limites, em consulta própria: mesmo quando a municipal ganha, o teto
    -- continua sendo o da lei geral.
    left join lateral (
      select g.*
        from public.sada_regra_tributaria g
       where g.nivel = 'geral'
         and (g.tributo = '*' or g.tributo = b.sigla)
         and b.data_venc is not null
         and g.vigencia_inicio <= b.data_venc
         and (g.vigencia_fim is null or g.vigencia_fim >= b.data_venc)
       order by (g.tributo <> '*') desc, g.vigencia_inicio desc
       limit 1
    ) g on true
)
select
  c.*,
  -- MULTA esperada. Sem percentual cadastrado (o caso da lei geral, que não
  -- fixa multa — só o teto), não há o que comparar.
  case when c.regra_id is null or c.valor is null or c.meses_atraso is null
         or c.multa_pct is null then null
       when c.multa_tipo = 'progressiva'
         then round(c.valor * least(c.multa_pct * c.meses_atraso,
                                    coalesce(c.multa_teto_pct, c.teto_multa_pct)) / 100, 2)
       else round(c.valor * c.multa_pct / 100, 2)
  end as multa_esperada,
  -- JUROS esperados. Mensal: juros simples, como manda o CTN. SELIC: só dá
  -- para aproximar se a média anual foi informada.
  case when c.regra_id is null or c.valor is null or c.meses_atraso is null then null
       when c.juros_modo = 'mensal' and c.juros_pct_mes is not null
         then round(c.valor * c.juros_pct_mes / 100 * c.meses_atraso, 2)
       when c.juros_modo = 'selic' and c.selic_media_aa is not null
         then round(c.valor * (power(1 + c.selic_media_aa / 100, c.meses_atraso / 12.0) - 1), 2)
  end as juros_esperado,
  -- CORREÇÃO esperada, composta ao ano. Em SELIC não há correção à parte.
  case when c.regra_id is null or c.valor is null or c.meses_atraso is null then null
       when c.juros_modo = 'selic' then 0
       when c.correcao_pct_aa is null then null
       else round(c.valor * (power(1 + c.correcao_pct_aa / 100, c.meses_atraso / 12.0) - 1), 2)
  end as correcao_esperada
  from com_regra c;

comment on view public.sada_vw_regra_linha is
  'Dívida ativa vigente + regra aplicável (municipal ou geral) + limites da '
  'lei geral + encargos esperados. Pesada: use sempre com filtro de cnpj_orgao.';

-- ---------------------------------------------------------------------
-- 3. Resumo — uma linha por verificação e por ente, no padrão de
--    sada_vw_qualidade (count(*) filter num scan só).
--
--    Códigos e o que cada um quer dizer:
--      trib_total_soma        total ≠ principal + atualização + juros + multa
--      trib_multa_divergente  multa fora da tolerância da regra aplicável
--      trib_juros_divergente  juros fora da tolerância
--      trib_correcao_divergente  correção fora da tolerância
--      trib_multa_teto        multa acima do teto da lei geral
--      trib_juros_teto        juros acima do teto da lei geral
--      trib_selic_e_correcao  regra usa SELIC e a linha traz correção à parte
--      trib_so_lei_geral      conferida só pela lei geral (ente sem lei cadastrada)
--      trib_sem_regra         nenhuma regra cobre a linha, nem a geral
--      trib_venc_invalido     mês/ano de vencimento ausente ou impossível
--      trib_venc_futuro       vencimento depois da data-base da foto
--      trib_prescricao        prazo de prescrição vencido na data-base
-- ---------------------------------------------------------------------
create view public.sada_vw_validacao_tributaria as
with l as (
  select *,
         greatest(coalesce(tolerancia_reais, 1),
                  coalesce(multa_esperada, 0) * coalesce(tolerancia_pct, 5) / 100) as tol_multa,
         greatest(coalesce(tolerancia_reais, 1),
                  coalesce(juros_esperado, 0) * coalesce(tolerancia_pct, 5) / 100) as tol_juros,
         greatest(coalesce(tolerancia_reais, 1),
                  coalesce(correcao_esperada, 0) * coalesce(tolerancia_pct, 5) / 100) as tol_corr
    from public.sada_vw_regra_linha
), agg as (
  select cnpj_orgao, count(*) as base,
         count(*) filter (
           where total is not null and valor is not null
             and abs(total - (valor + coalesce(atualizacao,0) + coalesce(juros,0)
                              + coalesce(multa,0))) > 1) as c_soma,
         count(*) filter (
           where multa_esperada is not null and multa is not null
             and abs(multa - multa_esperada) > tol_multa) as c_multa,
         count(*) filter (
           where juros_esperado is not null and juros is not null
             and abs(juros - juros_esperado) > tol_juros) as c_juros,
         count(*) filter (
           where correcao_esperada is not null and atualizacao is not null
             and juros_modo <> 'selic'
             and abs(atualizacao - correcao_esperada) > tol_corr) as c_corr,
         count(*) filter (
           where multa is not null and valor is not null and valor > 0
             and multa > valor * teto_multa_pct / 100 + 1) as c_multa_teto,
         count(*) filter (
           where juros is not null and valor is not null and valor > 0
             and meses_atraso is not null and meses_atraso > 0
             and juros > valor * teto_juros_pct_mes / 100 * meses_atraso + 1) as c_juros_teto,
         count(*) filter (
           where juros_modo = 'selic'
             and atualizacao is not null and atualizacao > 0) as c_selic,
         -- Cobertura: a linha foi conferida pelo padrão do CTN porque o
         -- município não tem lei cadastrada. Não é erro do dado.
         count(*) filter (
           where regra_nivel = 'geral'
             and (multa is not null or juros is not null or atualizacao is not null)) as c_so_geral,
         -- data_venc nula já sai em trib_venc_invalido; repetir aqui como
         -- "sem regra" mandaria cadastrar regra que não resolveria nada.
         count(*) filter (
           where regra_id is null and data_venc is not null
             and (multa is not null or juros is not null or atualizacao is not null)) as c_sem_regra,
         count(*) filter (where data_venc is null) as c_venc,
         count(*) filter (where data_venc is not null and data_venc > data_base) as c_futuro,
         count(*) filter (
           where meses_atraso is not null
             and meses_atraso > anos_prescricao * 12) as c_prescr
    from l
   group by cnpj_orgao
)
select a.cnpj_orgao, v.codigo, v.categoria, v.tabela, v.problema, v.qtd, a.base
  from agg a
  cross join lateral (values
    ('trib_total_soma'::text, 'tributario'::text, 'divida_ativa'::text,
     'Total diferente de principal + atualização + juros + multa'::text, a.c_soma),
    ('trib_multa_divergente', 'tributario', 'divida_ativa',
     'Multa fora da regra aplicável', a.c_multa),
    ('trib_juros_divergente', 'tributario', 'divida_ativa',
     'Juros fora da regra aplicável', a.c_juros),
    ('trib_correcao_divergente', 'tributario', 'divida_ativa',
     'Correção monetária fora da regra aplicável', a.c_corr),
    ('trib_multa_teto', 'tributario', 'divida_ativa',
     'Multa acima do teto da lei geral', a.c_multa_teto),
    ('trib_juros_teto', 'tributario', 'divida_ativa',
     'Juros acima do teto da lei geral (CTN art. 161 §1º)', a.c_juros_teto),
    ('trib_selic_e_correcao', 'tributario', 'divida_ativa',
     'Regra usa SELIC e a linha traz correção à parte (duplicidade)', a.c_selic),
    ('trib_so_lei_geral', 'tributario', 'divida_ativa',
     'Conferida só pela lei geral — ente sem lei municipal cadastrada', a.c_so_geral),
    ('trib_sem_regra', 'tributario', 'divida_ativa',
     'Nenhuma regra cobre a linha, nem a lei geral', a.c_sem_regra),
    ('trib_venc_invalido', 'tributario', 'divida_ativa',
     'Vencimento ausente ou impossível', a.c_venc),
    ('trib_venc_futuro', 'tributario', 'divida_ativa',
     'Vencimento depois da data-base da importação', a.c_futuro),
    ('trib_prescricao', 'tributario', 'divida_ativa',
     'Prazo de prescrição vencido (CTN art. 174 — verificar interrupção)', a.c_prescr)
  ) v(codigo, categoria, tabela, problema, qtd);

-- ---------------------------------------------------------------------
-- 4. Detalhe — as linhas por trás de cada código, com o esperado ao lado
--    do informado. Sempre consultada com filtro de código, ente e limite.
-- ---------------------------------------------------------------------
create view public.sada_vw_validacao_linhas as
with l as (
  select *,
         greatest(coalesce(tolerancia_reais, 1),
                  coalesce(multa_esperada, 0) * coalesce(tolerancia_pct, 5) / 100) as tol_multa,
         greatest(coalesce(tolerancia_reais, 1),
                  coalesce(juros_esperado, 0) * coalesce(tolerancia_pct, 5) / 100) as tol_juros,
         greatest(coalesce(tolerancia_reais, 1),
                  coalesce(correcao_esperada, 0) * coalesce(tolerancia_pct, 5) / 100) as tol_corr
    from public.sada_vw_regra_linha
), marcada as (
  select l.*, v.codigo
    from l
    cross join lateral (values
      ('trib_total_soma',
       total is not null and valor is not null
         and abs(total - (valor + coalesce(atualizacao,0) + coalesce(juros,0)
                          + coalesce(multa,0))) > 1),
      ('trib_multa_divergente',
       multa_esperada is not null and multa is not null
         and abs(multa - multa_esperada) > tol_multa),
      ('trib_juros_divergente',
       juros_esperado is not null and juros is not null
         and abs(juros - juros_esperado) > tol_juros),
      ('trib_correcao_divergente',
       correcao_esperada is not null and atualizacao is not null
         and juros_modo <> 'selic' and abs(atualizacao - correcao_esperada) > tol_corr),
      ('trib_multa_teto',
       multa is not null and valor is not null and valor > 0
         and multa > valor * teto_multa_pct / 100 + 1),
      ('trib_juros_teto',
       juros is not null and valor is not null and valor > 0
         and meses_atraso is not null and meses_atraso > 0
         and juros > valor * teto_juros_pct_mes / 100 * meses_atraso + 1),
      ('trib_selic_e_correcao',
       juros_modo = 'selic' and atualizacao is not null and atualizacao > 0),
      ('trib_so_lei_geral',
       regra_nivel = 'geral'
         and (multa is not null or juros is not null or atualizacao is not null)),
      ('trib_sem_regra',
       regra_id is null and data_venc is not null
         and (multa is not null or juros is not null or atualizacao is not null)),
      ('trib_venc_invalido', data_venc is null),
      ('trib_venc_futuro',   data_venc is not null and data_venc > data_base),
      ('trib_prescricao',    meses_atraso is not null and meses_atraso > anos_prescricao * 12)
    ) v(codigo, bate)
   where v.bate
)
select cnpj_orgao, codigo, ano, sequencia, sigla, inscricao, cnpj_cpf,
       mes_venc, ano_venc, meses_atraso,
       valor, atualizacao, juros, multa, total,
       multa_esperada, juros_esperado, correcao_esperada,
       regra_id, regra_nivel, regra_tributo
  from marcada;

-- ---------------------------------------------------------------------
-- 5. Lei geral inicial.
--
--    Sem multa: a lei federal não fixa alíquota de multa de mora municipal —
--    só o teto. Com juros de 1% ao mês, que é o supletivo do CTN. Sem índice
--    de correção, que também é da lei local.
--
--    Vigência desde o CTN (Lei 5.172, de 25/10/1966). Se a lei geral mudar,
--    NÃO edite esta linha: cadastre outra com o novo início de vigência e
--    feche esta pelo campo de fim — senão a dívida antiga passa a ser
--    conferida com a lei nova.
-- ---------------------------------------------------------------------
insert into public.sada_regra_tributaria
  (nivel, cnpj_orgao, tributo, vigencia_inicio,
   multa_tipo, multa_pct, juros_modo, juros_pct_mes,
   teto_multa_pct, teto_juros_pct_mes, anos_prescricao,
   tolerancia_pct, tolerancia_reais, fundamento, observacao)
values
  ('geral', null, '*', date '1966-10-25',
   'unica', null, 'mensal', 1,
   20, 1, 5,
   5, 1,
   'CTN arts. 161 §1º e 174; STF, multa de mora limitada a 20%',
   'Regra supletiva e limites. A lei municipal prevalece no cálculo do esperado, mas não afasta os limites.')
on conflict do nothing;

commit;

-- Conferência rápida (troque o CNPJ):
-- select codigo, problema, qtd, base from public.sada_vw_validacao_tributaria
--  where cnpj_orgao = '12345678000190' order by qtd desc;
-- select * from public.sada_vw_validacao_linhas
--  where cnpj_orgao = '12345678000190' and codigo = 'trib_juros_teto' limit 20;

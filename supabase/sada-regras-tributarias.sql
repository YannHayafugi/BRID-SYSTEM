-- =====================================================================
-- SADA · Regras tributárias por ente e validação das fórmulas
--
-- O que este arquivo cria:
--   1. sada_regra_tributaria          cadastro das alíquotas de cada ente
--   2. sada_vw_regra_linha            casa cada linha da DA com a regra vigente
--   3. sada_vw_validacao_tributaria   resumo: uma linha por verificação/ente
--   4. sada_vw_validacao_linhas       o detalhe, para a tela e o xlsx
--
-- POR QUE POR ENTE: multa, juros e índice de correção da dívida ativa saem do
-- Código Tributário de cada município. O CTN fixa só o piso e o teto (art. 161
-- §1º: juros de 1% ao mês quando a lei não dispuser de outro modo); o resto é
-- lei municipal, e muda de cidade para cidade e ao longo do tempo. Por isso o
-- cadastro tem VIGÊNCIA: dívida de 2016 tem de ser conferida com a lei de
-- 2016, não com a de hoje.
--
-- DATA-BASE DA CONFERÊNCIA: a planilha é uma foto do estoque. Tomamos como
-- data-base 31/12 do último ano do lote (`ano_fim` da importação vigente, ou o
-- `ano` da própria linha quando ele falta). Não é exato — o ente pode ter
-- extraído em outro dia — e é por isso que toda comparação tem tolerância.
--
-- Idempotente: pode rodar de novo.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Cadastro das regras
-- ---------------------------------------------------------------------
create table if not exists public.sada_regra_tributaria (
  id             bigint generated always as identity primary key,
  -- SOMENTE DÍGITOS, como em sada_depara: a API normaliza na gravação e na
  -- busca, senão o mesmo ente vira dois cadastros e a regra não é encontrada.
  cnpj_orgao     text not null,
  -- Sigla canônica do tributo (IPTU, ISS, TAXA...) ou '*' para "todos os
  -- tributos do ente". A regra específica ganha da genérica.
  tributo        text not null default '*',
  vigencia_inicio date not null,
  vigencia_fim    date,                       -- null = ainda em vigor

  -- MULTA de mora. 'unica': percentual aplicado uma vez sobre o principal.
  -- 'progressiva': percentual POR MÊS de atraso, limitado por multa_teto_pct.
  multa_tipo     text not null default 'unica'
                   check (multa_tipo in ('unica', 'progressiva')),
  multa_pct      numeric(6,3) not null default 0,
  multa_teto_pct numeric(6,3),                -- só para 'progressiva'

  -- JUROS. 'mensal': taxa fixa ao mês (o caso do art. 161 §1º do CTN).
  -- 'selic': a SELIC já engloba correção e juros — somar os dois é cobrança
  -- em duplicidade, e a validação verifica justamente isso.
  juros_modo     text not null default 'mensal'
                   check (juros_modo in ('mensal', 'selic')),
  juros_pct_mes  numeric(6,3) not null default 1,
  -- Média anual da SELIC usada só como APROXIMAÇÃO quando juros_modo='selic'
  -- (não temos a série mês a mês). Sem ela, a conferência de juros é pulada.
  selic_media_aa numeric(6,3),

  -- CORREÇÃO monetária: o nome do índice é documental; a conferência usa a
  -- taxa média anual informada. Sem taxa, a correção não é recalculada.
  correcao_indice  text,                      -- IPCA, IPCA-E, IGP-M, UFM...
  correcao_pct_aa  numeric(6,3),

  honorarios_pct numeric(6,3),                -- encargo de cobrança, se houver

  -- Tolerância da comparação. Vale a maior entre as duas: percentual sobre o
  -- valor esperado e um piso em reais, que evita apontar diferença de centavo.
  tolerancia_pct   numeric(6,3) not null default 5,
  tolerancia_reais numeric(12,2) not null default 1,

  fundamento     text,                        -- "Lei Municipal 1.234/2015, art. 8º"
  observacao     text,
  criado_por     uuid references public.gp_profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (cnpj_orgao, tributo, vigencia_inicio),
  check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);

create index if not exists idx_sada_regra_ente
  on public.sada_regra_tributaria (cnpj_orgao, tributo, vigencia_inicio desc);

comment on table public.sada_regra_tributaria is
  'Alíquotas de multa, juros e correção da dívida ativa, por ente, tributo e '
  'período de vigência. Base da validação de fórmulas (sada_vw_validacao_*).';

-- ---------------------------------------------------------------------
-- 2. Cada linha da dívida ativa vigente com a regra aplicável e os
--    valores esperados. É a base das duas views seguintes.
-- ---------------------------------------------------------------------
create or replace view public.sada_vw_regra_linha as
with da as (
  select d.*,
         -- Data-base da foto: ver cabeçalho do arquivo.
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
         r.tributo       as regra_tributo,
         r.multa_tipo, r.multa_pct, r.multa_teto_pct,
         r.juros_modo, r.juros_pct_mes, r.selic_media_aa,
         r.correcao_indice, r.correcao_pct_aa,
         r.tolerancia_pct, r.tolerancia_reais
    from base b
    -- lateral + order by: entre as regras que cobrem a data de vencimento,
    -- vence a do tributo específico sobre a genérica ('*') e, dentro disso,
    -- a de vigência mais recente.
    left join lateral (
      select r.*
        from public.sada_regra_tributaria r
       where r.cnpj_orgao = b.cnpj_orgao
         and (r.tributo = '*' or r.tributo = b.sigla)
         and b.data_venc is not null
         and r.vigencia_inicio <= b.data_venc
         and (r.vigencia_fim is null or r.vigencia_fim >= b.data_venc)
       order by (r.tributo <> '*') desc, r.vigencia_inicio desc
       limit 1
    ) r on true
)
select
  c.*,
  -- MULTA esperada. Progressiva: percentual por mês, limitado ao teto.
  case when c.regra_id is null or c.valor is null or c.meses_atraso is null then null
       when c.multa_tipo = 'progressiva'
         then round(c.valor * least(c.multa_pct * coalesce(c.meses_atraso, 0),
                                    coalesce(c.multa_teto_pct, 20)) / 100, 2)
       else round(c.valor * c.multa_pct / 100, 2)
  end as multa_esperada,
  -- JUROS esperados. Mensal: juros simples, como manda o CTN. SELIC: só dá
  -- para aproximar se a média anual foi informada.
  case when c.regra_id is null or c.valor is null or c.meses_atraso is null then null
       when c.juros_modo = 'mensal'
         then round(c.valor * c.juros_pct_mes / 100 * c.meses_atraso, 2)
       when c.selic_media_aa is not null
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
  'Dívida ativa vigente + regra tributária aplicável + encargos esperados. '
  'Pesada: use sempre com filtro de cnpj_orgao.';

-- ---------------------------------------------------------------------
-- 3. Resumo — uma linha por verificação e por ente, no padrão de
--    sada_vw_qualidade (count(*) filter num scan só).
--
--    Códigos e o que cada um quer dizer:
--      trib_total_soma        total ≠ principal + atualização + juros + multa
--      trib_multa_divergente  multa fora da tolerância da regra do ente
--      trib_juros_divergente  juros fora da tolerância
--      trib_correcao_divergente  correção fora da tolerância
--      trib_multa_teto        multa acima de 20% do principal
--      trib_juros_teto        juros acima de 1% ao mês de atraso
--      trib_selic_e_correcao  ente usa SELIC e a linha traz correção à parte
--      trib_sem_regra         linha com encargos e nenhuma regra cadastrada
--      trib_venc_invalido     mês/ano de vencimento ausente ou impossível
--      trib_venc_futuro       vencimento depois da data-base da foto
--      trib_prescricao        mais de 5 anos vencida (CTN art. 174)
-- ---------------------------------------------------------------------
create or replace view public.sada_vw_validacao_tributaria as
with l as (
  select *,
         -- Tolerância em reais para cada comparação: a maior entre o piso e o
         -- percentual sobre o esperado.
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
         -- Tetos: valem mesmo sem regra cadastrada. 20% é o limite que a
         -- jurisprudência admite para multa de mora; 1% a.m. é o do CTN.
         count(*) filter (
           where multa is not null and valor is not null and valor > 0
             and multa > valor * 0.20 + 1) as c_multa_teto,
         count(*) filter (
           where juros is not null and valor is not null and valor > 0
             and meses_atraso is not null and meses_atraso > 0
             and juros > valor * 0.01 * meses_atraso + 1) as c_juros_teto,
         count(*) filter (
           where juros_modo = 'selic'
             and atualizacao is not null and atualizacao > 0) as c_selic,
         count(*) filter (
           -- data_venc nula já sai em trib_venc_invalido; repetir aqui como
           -- "sem regra" mandaria cadastrar regra que não resolveria nada.
           where regra_id is null and data_venc is not null
             and (multa is not null or juros is not null or atualizacao is not null)) as c_sem_regra,
         count(*) filter (where data_venc is null) as c_venc,
         count(*) filter (where data_venc is not null and data_venc > data_base) as c_futuro,
         count(*) filter (where meses_atraso is not null and meses_atraso > 60) as c_prescr
    from l
   group by cnpj_orgao
)
select a.cnpj_orgao, v.codigo, v.categoria, v.tabela, v.problema, v.qtd, a.base
  from agg a
  cross join lateral (values
    ('trib_total_soma'::text, 'tributario'::text, 'divida_ativa'::text,
     'Total diferente de principal + atualização + juros + multa'::text, a.c_soma),
    ('trib_multa_divergente', 'tributario', 'divida_ativa',
     'Multa fora da regra cadastrada para o ente', a.c_multa),
    ('trib_juros_divergente', 'tributario', 'divida_ativa',
     'Juros fora da regra cadastrada para o ente', a.c_juros),
    ('trib_correcao_divergente', 'tributario', 'divida_ativa',
     'Correção monetária fora da regra cadastrada', a.c_corr),
    ('trib_multa_teto', 'tributario', 'divida_ativa',
     'Multa acima de 20% do principal', a.c_multa_teto),
    ('trib_juros_teto', 'tributario', 'divida_ativa',
     'Juros acima de 1% ao mês de atraso (CTN art. 161 §1º)', a.c_juros_teto),
    ('trib_selic_e_correcao', 'tributario', 'divida_ativa',
     'Ente usa SELIC e a linha traz correção à parte (duplicidade)', a.c_selic),
    ('trib_sem_regra', 'tributario', 'divida_ativa',
     'Linha com encargos sem regra tributária cadastrada', a.c_sem_regra),
    ('trib_venc_invalido', 'tributario', 'divida_ativa',
     'Vencimento ausente ou impossível', a.c_venc),
    ('trib_venc_futuro', 'tributario', 'divida_ativa',
     'Vencimento depois da data-base da importação', a.c_futuro),
    ('trib_prescricao', 'tributario', 'divida_ativa',
     'Vencida há mais de 5 anos (CTN art. 174 — verificar interrupção)', a.c_prescr)
  ) v(codigo, categoria, tabela, problema, qtd);

-- ---------------------------------------------------------------------
-- 4. Detalhe — as linhas por trás de cada código, com o esperado ao lado
--    do informado. Sempre consultada com filtro de código, ente e limite.
-- ---------------------------------------------------------------------
create or replace view public.sada_vw_validacao_linhas as
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
         and multa > valor * 0.20 + 1),
      ('trib_juros_teto',
       juros is not null and valor is not null and valor > 0
         and meses_atraso is not null and meses_atraso > 0
         and juros > valor * 0.01 * meses_atraso + 1),
      ('trib_selic_e_correcao',
       juros_modo = 'selic' and atualizacao is not null and atualizacao > 0),
      ('trib_sem_regra',
       regra_id is null and data_venc is not null
         and (multa is not null or juros is not null or atualizacao is not null)),
      ('trib_venc_invalido', data_venc is null),
      ('trib_venc_futuro',   data_venc is not null and data_venc > data_base),
      ('trib_prescricao',    meses_atraso is not null and meses_atraso > 60)
    ) v(codigo, bate)
   where v.bate
)
select cnpj_orgao, codigo, ano, sequencia, sigla, inscricao, cnpj_cpf,
       mes_venc, ano_venc, meses_atraso,
       valor, atualizacao, juros, multa, total,
       multa_esperada, juros_esperado, correcao_esperada,
       regra_id, regra_tributo
  from marcada;

commit;

-- Conferência rápida (troque o CNPJ):
-- select codigo, problema, qtd, base from public.sada_vw_validacao_tributaria
--  where cnpj_orgao = '12345678000190' order by qtd desc;
-- select * from public.sada_vw_validacao_linhas
--  where cnpj_orgao = '12345678000190' and codigo = 'trib_juros_teto' limit 20;

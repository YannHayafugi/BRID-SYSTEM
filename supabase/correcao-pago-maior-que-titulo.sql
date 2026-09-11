-- =====================================================================
-- SADA · correção: pago_maior_que_titulo somava o mesmo pagamento N vezes
--
-- A view sada_vw_incoerencias juntava recebimentos_da com divida_ativa por
-- (cnpj_orgao, sequencia) e SÓ DEPOIS somava — sem `ano` no join.
--
-- O estoque de dívida ativa é reportado uma aba por ano, e o título em aberto
-- reaparece nas safras seguintes: `ano` é a aba de origem, não o ano do
-- título. Com o join antes da soma, cada pagamento casava com uma linha de
-- divida_ativa por safra, e sum(totaldam) contava o mesmo pagamento uma vez
-- para cada uma.
--
-- Efeito prático: um título presente em 2023, 2024 e 2025 com um pagamento de
-- R$ 1.000 aparecia como R$ 3.000 pagos contra um título de R$ 1.500, e era
-- acusado de quitação acima do devido sem nunca ter sido. Todo título
-- parcialmente pago que atravessa mais de um ano virava achado falso, o que
-- na prática inutilizava a aba de incoerências.
--
-- A correção agrega os dois lados SEPARADAMENTE antes de encontrá-los. Do
-- lado do título, `max` sobre as safras: o valor cresce com encargos, e o
-- maior reportado é o teto mais conservador para comparar.
--
-- Só troca a definição da view; não há dado a migrar.
-- =====================================================================

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

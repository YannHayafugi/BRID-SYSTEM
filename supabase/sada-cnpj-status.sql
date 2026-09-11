-- =====================================================================
-- SADA · situação cadastral dos CNPJs que existem na base
--
-- Cruza os contribuintes da dívida ativa vigente com o cache de consulta_cnpj,
-- para a tela saber quem já tem status, quem nunca foi consultado e quando
-- cada um foi atualizado pela última vez.
--
-- Só CNPJ: o filtro de 14 dígitos deixa CPF de fora porque não existe consulta
-- pública de situação cadastral para pessoa física. Numa carteira de IPTU isso
-- corta a maioria das linhas — a tela precisa dizer quanto ficou de fora, em
-- vez de dar a impressão de cobertura total.
--
-- `cnpj_cpf` é preenchido pelo importador com o que veio da planilha, que pode
-- ter pontuação. A normalização acontece aqui, e é ela que casa com a chave de
-- consulta_cnpj, que é sempre só dígitos.
-- =====================================================================

create or replace view public.sada_vw_cnpj_status as
with base as (
  select d.cnpj_orgao,
         regexp_replace(d.cnpj_cpf, '\D', '', 'g') as documento,
         d.valor
    from public.sada_divida_ativa d
    join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
   where d.cnpj_cpf is not null
), pj as (
  select cnpj_orgao, documento,
         count(*)    as qtd_titulos,
         sum(valor)  as divida_total
    from base
   where length(documento) = 14
   group by cnpj_orgao, documento
)
select pj.cnpj_orgao,
       pj.documento,
       pj.qtd_titulos,
       pj.divida_total,
       c.razao_social,
       c.situacao,
       c.situacao_data,
       c.uf        as uf_receita,
       c.municipio as municipio_receita,
       c.consultado_em
  from pj
  left join public.consulta_cnpj c on c.cnpj = pj.documento;

-- Contagem por ente: quantos documentos são PJ (consultáveis), quantos PF
-- (fora do alcance) e quantos já têm status em cache.
create or replace view public.sada_vw_cnpj_cobertura as
with base as (
  select d.cnpj_orgao,
         regexp_replace(d.cnpj_cpf, '\D', '', 'g') as documento,
         d.valor
    from public.sada_divida_ativa d
    join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
   where d.cnpj_cpf is not null
), distintos as (
  select cnpj_orgao, documento, sum(valor) as divida
    from base group by cnpj_orgao, documento
)
select d.cnpj_orgao,
       count(*) filter (where length(d.documento) = 14)                    as documentos_pj,
       count(*) filter (where length(d.documento) = 11)                    as documentos_pf,
       count(*) filter (where length(d.documento) not in (11, 14))         as documentos_invalidos,
       count(*) filter (where length(d.documento) = 14 and c.cnpj is not null) as pj_com_status,
       sum(d.divida) filter (where length(d.documento) = 14)               as divida_pj,
       sum(d.divida) filter (where length(d.documento) = 11)               as divida_pf
  from distintos d
  left join public.consulta_cnpj c on c.cnpj = d.documento
 group by d.cnpj_orgao;

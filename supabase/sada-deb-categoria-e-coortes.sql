-- =====================================================================
-- SADA · Debênture, onda 1: categoria do tributo, coortes e prontidão
--
-- O modelo de InfoPack de securitização (o PDF da emissão) segmenta TUDO em
-- Imobiliário / Mobiliário / Não Estabelecido, e três das suas páginas de
-- análise retrospectiva pedem recortes que o SADA ainda não tinha:
--
--   pág.  9  lançado x pago por exercício  -> sada_mv_adimplencia
--   pág. 10  estoque por safra, categoria e designação
--                                          -> sada_mv_estoque_designacao
--            quadro resumo (ticket, concentração)
--                                          -> sada_mv_estoque_resumo
--   pág. 11  recuperação por safra          -> sada_mv_coorte_da
--   pág. 12  curva acumulada safra x ano    -> sada_mv_coorte_da
--
-- O QUE MEDI NA BASE ANTES DE ESCREVER ISTO (lote vigente, 02/10/2026):
--
--   sada_divida_ativa      806.563 linhas, safras 1995–2022   OK
--   sada_lancamentos     4.206.672 linhas, exercícios 2010–26 OK
--   sada_recebimentos              0 linhas                   VAZIA
--   sada_recebimentos_da           0 linhas                   VAZIA
--
-- As duas tabelas de recebimento estão vazias. As MVs de coorte e de
-- adimplência nascem corretas e VAZIAS do lado do pago — elas se preenchem
-- sozinhas na primeira importação desses arquivos, sem mexer em nada aqui.
-- `sada_vw_deb_prontidao`, no fim deste arquivo, é quem diz isso na tela.
--
-- Idempotente.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Heurística de categoria
--
-- Chuta a categoria pelo nome do tributo, para a tela já abrir classificada
-- em vez de pedir 34 decisões em branco. É CHUTE: a classificação que vale é
-- a da tabela do item 2, e a tela mostra de onde veio cada uma.
--
-- Ordem importa: 'IMOBILIARI' é testado antes de 'MOBILIARI', senão
-- "INFRACAO IMOBILIARIA" cairia no segundo.
--
-- `\m` ancora no início de palavra: sem ele, 'ISS' casaria dentro de
-- "EMISSAO". O translate() tira o acento — "SERVIÇOS", "ALIENAÇÃO" e
-- "AÇÃO FISCAL" aparecem assim nesta base.
-- ---------------------------------------------------------------------
create or replace function public.sada_categoria_heuristica(sigla text)
returns text
language sql
immutable
as $$
  select case
    when t ~ '(\mIPTU|\mITBI|IMOBILIARI|PREDIAL|TERRITORIAL|CONTRIBUICAO DE MELHORIA)'
      then 'imobiliario'
    when t ~ '(\mISS|\mNFSE|ALVARA|LICENCA|LICENCIAMENTO|VISAM|VIGILANCIA|MOBILIARI|PUBLICIDADE|AMBULANTE|FUNCIONAMENTO)'
      then 'mobiliario'
    else 'nao_estabelecido'
  end
  from (select upper(translate(coalesce(sigla, ''),
                 'ÁÀÂÃÉÊÍÓÔÕÚÜÇáàâãéêíóôõúüç',
                 'AAAAEEIOOOUUCAAAAEEIOOOUUC')) as t) x;
$$;

comment on function public.sada_categoria_heuristica(text) is
  'Chute inicial da categoria pelo nome do tributo. A classificação que vale '
  'é sada_tributo_categoria; esta função só preenche o que ninguém decidiu.';

-- ---------------------------------------------------------------------
-- 2. Classificação explícita, em dois níveis
--
--   cnpj_orgao nulo  -> vale para todos os entes (ex.: IPTU é imobiliário
--                       em qualquer município);
--   cnpj_orgao cheio -> só naquele ente, e prevalece sobre o global.
--
-- Mesmo desenho das regras tributárias, pelo mesmo motivo: cada prefeitura
-- batiza suas siglas do seu jeito ("TOMAD/O.PUB GIS", "ISS ESTI GISS"), e o
-- que é mobiliário num ente pode não ser no vizinho.
-- ---------------------------------------------------------------------
create table if not exists public.sada_tributo_categoria (
  id           bigint generated always as identity primary key,
  cnpj_orgao   text,
  sigla        text not null,
  categoria    text not null
                 check (categoria in ('imobiliario', 'mobiliario', 'nao_estabelecido')),
  observacao   text,
  definido_por uuid references public.gp_profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- NULLS NOT DISTINCT para que duas linhas globais da mesma sigla colidam:
-- sem isso, `cnpj_orgao is null` escaparia do índice e a view do item 3
-- passaria a multiplicar linhas num join silencioso.
create unique index if not exists idx_sada_tributo_categoria_chave
  on public.sada_tributo_categoria (cnpj_orgao, sigla) nulls not distinct;

alter table public.sada_tributo_categoria enable row level security;

-- Leitura pela rota (service role); escrita idem. A tela passa pela API, que
-- é quem conhece o perfil — mesmo caminho de sada_regra_tributaria.
drop policy if exists sada_tributo_categoria_service on public.sada_tributo_categoria;
create policy sada_tributo_categoria_service
  on public.sada_tributo_categoria for all
  to service_role using (true) with check (true);

-- ---------------------------------------------------------------------
-- 3. Inventário de siglas (caro) + resolução da categoria (barata)
--
-- Separados de propósito. Varrer 4,2 milhões de lançamentos para listar as
-- siglas custa caro e só muda quando entra importação — é MV, atualizada com
-- as outras. Já a categoria muda quando alguém clica na tela, e precisa
-- aparecer na hora: fica numa view comum, que é só um join por cima.
--
-- Se as duas estivessem juntas, salvar uma categoria exigiria um refresh de
-- MV e a tela demoraria ~20 s por clique.
-- ---------------------------------------------------------------------
drop materialized view if exists public.sada_mv_sigla_inventario cascade;
create materialized view public.sada_mv_sigla_inventario as
with fontes as (
  select d.cnpj_orgao, d.sigla,
         count(*) as titulos_da, sum(d.valor) as principal_da,
         0::bigint as titulos_lanc, 0::bigint as titulos_rec
    from public.sada_divida_ativa d
    join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
   where d.sigla is not null
   group by 1, 2
  union all
  select l.cnpj_orgao, l.sigla, 0, 0, count(*), 0
    from public.sada_lancamentos l
    join public.sada_importacoes i on i.id = l.importacao_id and i.vigente
   where l.sigla is not null
   group by 1, 2
  union all
  select r.cnpj_orgao, r.sigla, 0, 0, 0, count(*)
    from public.sada_recebimentos_da r
    join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
   where r.sigla is not null
   group by 1, 2
)
select cnpj_orgao,
       sigla,
       sum(titulos_da)              as titulos_da,
       coalesce(sum(principal_da), 0) as principal_da,
       sum(titulos_lanc)            as titulos_lanc,
       sum(titulos_rec)             as titulos_rec
  from fontes
 group by cnpj_orgao, sigla;

create unique index if not exists idx_sada_mv_sigla_inventario_chave
  on public.sada_mv_sigla_inventario (cnpj_orgao, sigla) nulls not distinct;

grant select on public.sada_mv_sigla_inventario to anon, authenticated, service_role;

-- A view que a tela e os relatórios consultam.
create or replace view public.sada_vw_sigla_categoria as
  select s.cnpj_orgao,
         s.sigla,
         s.titulos_da,
         s.principal_da,
         s.titulos_lanc,
         s.titulos_rec,
         coalesce(e.categoria, g.categoria,
                  public.sada_categoria_heuristica(s.sigla)) as categoria,
         case when e.categoria is not null then 'ente'
              when g.categoria is not null then 'global'
              else 'heuristica' end                          as origem
    from public.sada_mv_sigla_inventario s
    left join public.sada_tributo_categoria e
           on e.cnpj_orgao = s.cnpj_orgao and e.sigla = s.sigla
    left join public.sada_tributo_categoria g
           on g.cnpj_orgao is null and g.sigla = s.sigla;

grant select on public.sada_vw_sigla_categoria to anon, authenticated, service_role;

comment on view public.sada_vw_sigla_categoria is
  'Toda sigla vista no lote vigente, com a categoria resolvida (ente > global '
  '> heurística) e o peso em reais, para a tela mostrar primeiro o que importa.';

-- ---------------------------------------------------------------------
-- 4. Estoque por safra COM a designação (pág. 10)
--
-- sada_vw_estoque_ano já dava principal e total; faltavam correção, juros e
-- multa, que é a abertura do gráfico "Estoque por designação".
--
-- A categoria NÃO entra aqui: ela é editável, e congelá-la na MV obrigaria a
-- um refresh a cada clique. Quem quiser por categoria junta com
-- sada_vw_sigla_categoria.
-- ---------------------------------------------------------------------
drop materialized view if exists public.sada_mv_estoque_designacao cascade;
create materialized view public.sada_mv_estoque_designacao as
  select d.cnpj_orgao,
         d.ano as safra,
         d.sigla,
         count(*)                        as titulos,
         sum(coalesce(d.valor, 0))       as principal,
         sum(coalesce(d.atualizacao, 0)) as correcao,
         sum(coalesce(d.juros, 0))       as juros,
         sum(coalesce(d.multa, 0))       as multa,
         sum(coalesce(d.total, 0))       as total
    from public.sada_divida_ativa d
    join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
   group by d.cnpj_orgao, d.ano, d.sigla;

create unique index if not exists idx_sada_mv_estoque_designacao_chave
  on public.sada_mv_estoque_designacao (cnpj_orgao, safra, sigla) nulls not distinct;

grant select on public.sada_mv_estoque_designacao to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. Quadro resumo do estoque (pág. 10)
--
-- Ticket médio e concentração saem sobre `total`, não sobre o principal —
-- é assim que o documento-modelo fecha: 411.710.674 / 15.119 = 27.231, e
-- excluídos os 10 maiores (27,2% da carteira) o ticket cai para ~19,8 mil,
-- exatamente o número que o texto da página cita.
-- ---------------------------------------------------------------------
drop materialized view if exists public.sada_mv_estoque_resumo cascade;
create materialized view public.sada_mv_estoque_resumo as
with da as (
  select d.* from public.sada_divida_ativa d
  join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
), por_devedor as (
  select cnpj_orgao, cnpj_cpf, sum(coalesce(total, 0)) as divida
    from da
   where cnpj_cpf is not null
   group by 1, 2
), ordenado as (
  select *, row_number() over (partition by cnpj_orgao order by divida desc) as posicao
    from por_devedor
), topo as (
  select cnpj_orgao,
         count(*)                                           as devedores,
         sum(divida)                                        as divida_devedores,
         sum(divida) filter (where posicao <= 10)           as divida_top10,
         count(*)    filter (where posicao > 10)            as devedores_sem_top10,
         sum(divida) filter (where posicao > 10)            as divida_sem_top10
    from ordenado
   group by cnpj_orgao
), carteira as (
  select cnpj_orgao,
         count(*)                        as titulos,
         sum(coalesce(valor, 0))         as principal,
         sum(coalesce(atualizacao, 0))   as correcao,
         sum(coalesce(juros, 0))         as juros,
         sum(coalesce(multa, 0))         as multa,
         sum(coalesce(total, 0))         as total,
         min(ano)                        as safra_min,
         max(ano)                        as safra_max
    from da
   group by cnpj_orgao
)
select c.cnpj_orgao,
       c.titulos, c.principal, c.correcao, c.juros, c.multa, c.total,
       c.safra_min, c.safra_max,
       coalesce(t.devedores, 0) as devedores,
       round(c.total / nullif(t.devedores, 0), 2)                   as ticket_medio,
       round(t.divida_sem_top10 / nullif(t.devedores_sem_top10, 0), 2)
                                                                    as ticket_medio_sem_top10,
       round(100 * t.divida_top10 / nullif(t.divida_devedores, 0), 2)
                                                                    as concentracao_top10
  from carteira c
  left join topo t on t.cnpj_orgao = c.cnpj_orgao;

create unique index if not exists idx_sada_mv_estoque_resumo_chave
  on public.sada_mv_estoque_resumo (cnpj_orgao);

grant select on public.sada_mv_estoque_resumo to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. Coorte: safra de inscrição x ano de arrecadação (págs. 11 e 12)
--
-- É o cruzamento que faz a matriz triangular de recuperação acumulada. Os
-- dois lados vêm da MESMA linha de sada_recebimentos_da: `ano` é a aba de
-- origem (o exercício do crédito) e `ano_arrec` é quando o dinheiro entrou.
--
-- VAZIA HOJE: sada_recebimentos_da não tem nenhuma linha vigente. A MV se
-- preenche na primeira importação do arquivo de recebimentos de dívida ativa.
-- ---------------------------------------------------------------------
drop materialized view if exists public.sada_mv_coorte_da cascade;
create materialized view public.sada_mv_coorte_da as
  select r.cnpj_orgao,
         r.ano       as safra,
         r.ano_arrec,
         r.sigla,
         count(*)                                     as pagamentos,
         sum(coalesce(r.valor, 0))                    as principal,
         sum(coalesce(r.vlam, 0))                     as correcao,
         sum(coalesce(r.vljm, 0))                     as juros,
         sum(coalesce(r.vlmm, 0))                     as multa,
         sum(coalesce(r.vldesc, 0))                   as desconto,
         sum(coalesce(r.totaldam, 0))                 as caixa
    from public.sada_recebimentos_da r
    join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
   where r.ano_arrec between 1980 and 2100
   group by r.cnpj_orgao, r.ano, r.ano_arrec, r.sigla;

create unique index if not exists idx_sada_mv_coorte_da_chave
  on public.sada_mv_coorte_da (cnpj_orgao, safra, ano_arrec, sigla) nulls not distinct;

grant select on public.sada_mv_coorte_da to anon, authenticated, service_role;

comment on materialized view public.sada_mv_coorte_da is
  'Recuperação de dívida ativa cruzando safra de inscrição com ano de '
  'arrecadação — a base da matriz de recuperação acumulada do InfoPack.';

-- ---------------------------------------------------------------------
-- 7. Adimplência: lançado x pago por exercício (pág. 9)
--
-- DOIS CUIDADOS COM O ANO, aprendidos medindo esta base:
--
--   Em sada_lancamentos, `ano` é 2026 em TODAS as 4,2 milhões de linhas —
--   é o ano do arquivo, não do crédito. Quem diz o exercício é `exercicio`,
--   que vai de 2010 a 2026. Agrupar por `ano` daria uma barra só.
--
--   Em sada_recebimentos, o exercício do crédito não tem coluna própria.
--   `ano` é a aba de origem, que naquele arquivo não é por exercício, e
--   `ano_arrec` é quando pagaram — nenhum dos dois serve para casar com o
--   lançamento. Usamos `ano_venc`: o IPTU de 2019 vence em 2019.
--   Esta premissa ainda não pôde ser conferida contra dado real (a tabela
--   está vazia) e deve ser revista na primeira importação.
-- ---------------------------------------------------------------------
drop materialized view if exists public.sada_mv_adimplencia cascade;
create materialized view public.sada_mv_adimplencia as
with lancado as (
  select l.cnpj_orgao, l.exercicio as exercicio, l.sigla,
         count(*)                  as titulos,
         sum(coalesce(l.valor, 0)) as lancado
    from public.sada_lancamentos l
    join public.sada_importacoes i on i.id = l.importacao_id and i.vigente
   where l.exercicio between 1980 and 2100
   group by 1, 2, 3
), pago as (
  select r.cnpj_orgao, r.ano_venc as exercicio, r.sigla,
         sum(coalesce(r.valor, 0)) as pago
    from public.sada_recebimentos r
    join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
   where r.ano_venc between 1980 and 2100
   group by 1, 2, 3
)
select coalesce(l.cnpj_orgao, p.cnpj_orgao) as cnpj_orgao,
       coalesce(l.exercicio, p.exercicio)   as exercicio,
       coalesce(l.sigla, p.sigla)           as sigla,
       coalesce(l.titulos, 0)               as titulos,
       coalesce(l.lancado, 0)               as lancado,
       coalesce(p.pago, 0)                  as pago,
       coalesce(l.lancado, 0) - coalesce(p.pago, 0) as inadimplido
  from lancado l
  full join pago p
    on p.cnpj_orgao = l.cnpj_orgao
   and p.exercicio  = l.exercicio
   and p.sigla      = l.sigla;

create unique index if not exists idx_sada_mv_adimplencia_chave
  on public.sada_mv_adimplencia (cnpj_orgao, exercicio, sigla) nulls not distinct;

grant select on public.sada_mv_adimplencia to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8. Prontidão: o que ainda falta para gerar o documento
--
-- Uma linha por exigência, por ente. É o que a tela usa para dizer "peça o
-- arquivo X ao ente" em vez de desenhar um gráfico vazio e deixar quem olha
-- achar que a carteira não recuperou nada.
--
-- O check de COLUNA CONSTANTE existe por um caso real desta base: 96,8% das
-- linhas têm atualizacao = 2,44 — o mesmo valor em IPTU de 2010 e de 2022.
-- Não é correção monetária, é uma coluna trocada na origem. Um gráfico de
-- designação montado sobre isso sairia convincente e errado.
-- ---------------------------------------------------------------------
create or replace view public.sada_vw_deb_prontidao as
with entes as (
  select distinct cnpj_orgao from public.sada_mv_sigla_inventario
), base as (
  select e.cnpj_orgao,
         (select count(*) from public.sada_mv_estoque_designacao x
           where x.cnpj_orgao = e.cnpj_orgao)                     as linhas_estoque,
         (select coalesce(sum(titulos_lanc), 0) from public.sada_mv_sigla_inventario x
           where x.cnpj_orgao = e.cnpj_orgao)                     as linhas_lanc,
         (select count(*) from public.sada_mv_coorte_da x
           where x.cnpj_orgao = e.cnpj_orgao)                     as linhas_coorte,
         (select coalesce(sum(pago), 0) from public.sada_mv_adimplencia x
           where x.cnpj_orgao = e.cnpj_orgao)                     as total_pago
    from entes e
)
select cnpj_orgao, 'estoque' as codigo, linhas_estoque > 0 as pronto,
       'Estoque de dívida ativa — páginas de carteira e quadro resumo.' as exigencia,
       case when linhas_estoque > 0 then 'Importado.'
            else 'Importe o arquivo de dívida ativa.' end as detalhe
  from base
union all
select cnpj_orgao, 'lancamentos', linhas_lanc > 0,
       'Lançamentos por exercício — metade "cobrado" do gráfico de adimplência.',
       case when linhas_lanc > 0 then 'Importado.'
            else 'Importe o arquivo de lançamentos.' end
  from base
union all
select cnpj_orgao, 'recebimentos', total_pago > 0,
       'Recebimentos gerais — metade "pago" do gráfico de adimplência.',
       case when total_pago > 0 then 'Importado.'
            else 'Falta o arquivo de recebimentos: sem ele não há taxa de inadimplência.' end
  from base
union all
select cnpj_orgao, 'recebimentos_da', linhas_coorte > 0,
       'Recebimentos de dívida ativa — histórico de recuperação e curvas por safra.',
       case when linhas_coorte > 0 then 'Importado.'
            else 'Falta o arquivo de recebimentos de dívida ativa: sem ele não há curva de recuperação.' end
  from base
union all
-- Siglas que ninguém classificou e que pesam: a heurística chutou, e o chute
-- entra direto na segmentação do documento.
select s.cnpj_orgao, 'categoria', count(*) = 0,
       'Classificação dos tributos em imobiliário, mobiliário e não estabelecido.',
       case when count(*) = 0 then 'Todas as siglas relevantes estão classificadas.'
            else count(*) || ' sigla(s) acima de R$ 100 mil ainda no chute da heurística.' end
  from public.sada_vw_sigla_categoria s
 where s.origem = 'heuristica' and s.principal_da > 100000
 group by s.cnpj_orgao
union all
-- Coluna de valor praticamente constante = coluna trocada no DE/PARA.
select cnpj_orgao, 'coluna_constante', not existe,
       'Correção, juros e multa com valores que variam entre os títulos.',
       case when not existe then 'Nenhuma coluna de valor repete o mesmo número.'
            else detalhe end
  from (
    select d.cnpj_orgao,
           bool_or(pct >= 90) as existe,
           string_agg(coluna || ': ' || round(pct, 1) || '% das linhas com o mesmo valor',
                      '; ' order by pct desc) filter (where pct >= 90) as detalhe
      from (
        select cnpj_orgao, 'correção' as coluna,
               100.0 * max(n) / nullif(sum(n), 0) as pct
          from (select d.cnpj_orgao, d.atualizacao, count(*) as n
                  from public.sada_divida_ativa d
                  join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
                 group by 1, 2) q
         group by cnpj_orgao
        union all
        select cnpj_orgao, 'juros', 100.0 * max(n) / nullif(sum(n), 0)
          from (select d.cnpj_orgao, d.juros, count(*) as n
                  from public.sada_divida_ativa d
                  join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
                 group by 1, 2) q
         group by cnpj_orgao
        union all
        select cnpj_orgao, 'multa', 100.0 * max(n) / nullif(sum(n), 0)
          from (select d.cnpj_orgao, d.multa, count(*) as n
                  from public.sada_divida_ativa d
                  join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
                 group by 1, 2) q
         group by cnpj_orgao
      ) d
     group by d.cnpj_orgao
  ) c;

grant select on public.sada_vw_deb_prontidao to anon, authenticated, service_role;

comment on view public.sada_vw_deb_prontidao is
  'Uma linha por exigência de dado do InfoPack, por ente: o que já dá para '
  'gerar e o que precisa ser pedido ao ente antes de montar o documento.';

-- ---------------------------------------------------------------------
-- 9. As novas MVs entram no refresh da importação
--
-- sada_mv_sigla_inventario vem ANTES das demais só por clareza de leitura:
-- não há dependência entre elas, cada uma lê as tabelas-base.
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
  refresh materialized view concurrently public.sada_mv_sigla_inventario;
  refresh materialized view concurrently public.sada_mv_estoque_designacao;
  refresh materialized view concurrently public.sada_mv_estoque_resumo;
  refresh materialized view concurrently public.sada_mv_coorte_da;
  refresh materialized view concurrently public.sada_mv_adimplencia;
$$;

comment on function public.sada_refresh_mvs() is
  'Atualiza as materialized views de leitura do SADA. Chamada ao fim de cada '
  'importação (navegador, servidor e importador de linha de comando). '
  'CONCURRENTLY: o dashboard continua respondendo durante a atualização.';

-- ---------------------------------------------------------------------
-- 10. Classificação global inicial
--
-- Só o que é inequívoco em qualquer município brasileiro. O resto fica com a
-- heurística até alguém decidir na tela — de propósito: uma classificação
-- gravada parece decidida, e decidir errado aqui desloca carteira inteira de
-- uma categoria para outra no documento.
--
-- A comparação é por sigla EXATA, então 'ISS' não cobre "ISS VARIAV GISS" —
-- e, nesta base, nenhum dos R$ 12,1 milhões dessa sigla cai aqui. É a
-- heurística que os pega, e por ser chute eles aparecem na tela para alguém
-- confirmar. Ou seja: o que entra nesta lista deixa de ser perguntado.
-- ---------------------------------------------------------------------
insert into public.sada_tributo_categoria (cnpj_orgao, sigla, categoria, observacao)
values
  (null, 'IPTU', 'imobiliario', 'Imposto sobre a propriedade predial e territorial urbana.'),
  (null, 'ITBI', 'imobiliario', 'Imposto sobre transmissão de bens imóveis.'),
  (null, 'CONTRIBUICAO DE MELHORIA', 'imobiliario', 'Decorre de obra pública que valoriza o imóvel.'),
  (null, 'ISSQN', 'mobiliario', 'Imposto sobre serviços.'),
  (null, 'ISS', 'mobiliario', 'Imposto sobre serviços.')
on conflict do nothing;

commit;

-- Conferência rápida (troque o CNPJ):
-- select * from public.sada_vw_deb_prontidao where cnpj_orgao = '45358249000101';
-- select sigla, categoria, origem, principal_da from public.sada_vw_sigla_categoria
--  where cnpj_orgao = '45358249000101' order by principal_da desc;
-- select * from public.sada_mv_estoque_resumo where cnpj_orgao = '45358249000101';

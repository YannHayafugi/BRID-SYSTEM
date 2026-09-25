-- =====================================================================
-- SADA · DE/PARA: ano vindo de coluna, e dispensa de campo obrigatório
--
-- 1. abas_modo ganha o valor 'ano_na_coluna'.
--
--    Até aqui todo arquivo precisava ser organizado por ano: ou o nome da
--    aba era o ano, ou o usuário informava o ano de cada aba. Nem sempre é
--    assim — há ente que manda tudo numa aba só, com o exercício numa
--    coluna, e ente cujas abas separam outra coisa (mês, tributo, unidade).
--    No modo novo o ano sai de uma COLUNA, linha a linha, mapeada no
--    próprio DE/PARA como o campo de destino `ano`.
--
-- 2. campos_opcionais: campos obrigatórios dispensados NAQUELE mapa.
--
--    A obrigatoriedade existe porque importar sem ela grava a tabela com o
--    campo nulo, sem erro de banco para avisar. Mas há ente cujo sistema
--    simplesmente não exporta a coluna, e barrar deixava o cliente sem
--    importação nenhuma. A dispensa fica registrada por mapa (nunca global),
--    e a tela mostra quais campos estão dispensados.
--
-- Idempotente: pode rodar de novo.
-- =====================================================================

begin;

alter table public.sada_depara
  drop constraint if exists sada_depara_abas_modo_check;

alter table public.sada_depara
  add constraint sada_depara_abas_modo_check
  check (abas_modo in ('ano_no_nome', 'abas_escolhidas', 'ano_na_coluna'));

alter table public.sada_depara
  add column if not exists campos_opcionais text[] not null default '{}';

comment on column public.sada_depara.abas_modo is
  'ano_no_nome: o nome da aba é o ano. abas_escolhidas: o usuário escolhe as '
  'abas e informa o ano de cada uma. ano_na_coluna: o ano sai de uma coluna da '
  'planilha (campo de destino `ano` do mapa).';

comment on column public.sada_depara.campos_opcionais is
  'Campos obrigatórios dispensados neste mapa. Vale só para este ente/tipo — '
  'não existe dispensa global.';

commit;

-- Conferência:
-- select cnpj_orgao, tipo, nome, abas_modo, campos_opcionais
--   from public.sada_depara order by updated_at desc limit 20;

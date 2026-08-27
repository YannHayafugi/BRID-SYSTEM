-- =====================================================================
-- SADA · migração: CNPJ canônico (só dígitos) + vários mapas por ente/tipo
--
-- Rode UMA VEZ no SQL Editor de cada banco que já tem dados. Bancos criados
-- do zero a partir de supabase/sada-schema.sql já nascem com esta estrutura.
--
-- Por que:
--
-- 1. `cnpj_orgao` era gravado como o usuário digitava (só `.trim()`). O mesmo
--    ente escrito "12.345.678/0001-90" na tela de DE/PARA e "12345678000190"
--    na de importação virava dois cadastros. Consequência silenciosa: o
--    importador não achava o mapa, caía no MAPA_PADRAO e lia a planilha por
--    posição — os dados entram nas colunas erradas sem nenhum erro de banco.
--
-- 2. `unique (cnpj_orgao, tipo)` permitia um único mapa por ente e tipo, então
--    não havia o que selecionar na importação.
--
-- Tudo roda numa transação: ou passa inteiro, ou não muda nada.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Solta as restrições de unicidade ANTES de normalizar: a normalização
--    pode aproximar duas linhas que hoje convivem por terem pontuação
--    diferente. São recriadas na etapa 5.
--
--    A busca é pelo catálogo em vez de chutar o nome gerado pelo Postgres:
--    se a tabela foi criada por outro caminho o nome pode diferir, e um
--    "drop constraint if exists" com nome errado passaria batido — a etapa 3
--    então falharia por violação de unicidade.
-- ---------------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select conname, conrelid::regclass as tabela
      from pg_constraint
     where contype = 'u'
       and conrelid in ('public.sada_depara'::regclass,
                        'public.sada_depara_valor'::regclass)
  loop
    execute format('alter table %s drop constraint %I', c.tabela, c.conname);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Coluna do nome do mapa.
-- ---------------------------------------------------------------------
alter table public.sada_depara
  add column if not exists nome text not null default 'Padrão';

-- ---------------------------------------------------------------------
-- 3. CNPJ para só dígitos em todas as tabelas que o guardam.
-- ---------------------------------------------------------------------
update public.sada_depara          set cnpj_orgao = regexp_replace(cnpj_orgao, '\D', '', 'g')
  where cnpj_orgao <> regexp_replace(cnpj_orgao, '\D', '', 'g');
update public.sada_depara_valor    set cnpj_orgao = regexp_replace(cnpj_orgao, '\D', '', 'g')
  where cnpj_orgao <> regexp_replace(cnpj_orgao, '\D', '', 'g');
update public.sada_importacoes     set cnpj_orgao = regexp_replace(cnpj_orgao, '\D', '', 'g')
  where cnpj_orgao <> regexp_replace(cnpj_orgao, '\D', '', 'g');
update public.sada_divida_ativa    set cnpj_orgao = regexp_replace(cnpj_orgao, '\D', '', 'g')
  where cnpj_orgao <> regexp_replace(cnpj_orgao, '\D', '', 'g');
update public.sada_lancamentos     set cnpj_orgao = regexp_replace(cnpj_orgao, '\D', '', 'g')
  where cnpj_orgao <> regexp_replace(cnpj_orgao, '\D', '', 'g');
update public.sada_recebimentos    set cnpj_orgao = regexp_replace(cnpj_orgao, '\D', '', 'g')
  where cnpj_orgao <> regexp_replace(cnpj_orgao, '\D', '', 'g');
update public.sada_recebimentos_da set cnpj_orgao = regexp_replace(cnpj_orgao, '\D', '', 'g')
  where cnpj_orgao <> regexp_replace(cnpj_orgao, '\D', '', 'g');

-- ---------------------------------------------------------------------
-- 4. Colisões criadas pela normalização.
--
--    Mapas: NADA é apagado — configuração de DE/PARA é trabalho manual caro.
--    O mais recente fica com o nome que tinha; os outros ganham sufixo, viram
--    alternativas selecionáveis na importação e podem ser apagados à mão
--    depois de conferidos.
-- ---------------------------------------------------------------------
with ordenados as (
  select id,
         row_number() over (
           partition by cnpj_orgao, tipo, nome
           order by updated_at desc, id desc
         ) as pos
  from public.sada_depara
)
update public.sada_depara d
   set nome = d.nome || ' (' || o.pos || ')'
  from ordenados o
 where o.id = d.id and o.pos > 1;

--    DE/PARA de valores: aqui duplicata é só repetição do mesmo par
--    origem -> canônico, então fica o mais recente e o resto sai.
delete from public.sada_depara_valor v
 using public.sada_depara_valor mais_novo
 where v.cnpj_orgao   = mais_novo.cnpj_orgao
   and v.campo        = mais_novo.campo
   and v.valor_origem = mais_novo.valor_origem
   and v.id < mais_novo.id;

-- ---------------------------------------------------------------------
-- 5. Restrições novas.
-- ---------------------------------------------------------------------
alter table public.sada_depara
  add constraint sada_depara_cnpj_tipo_nome_key unique (cnpj_orgao, tipo, nome);
alter table public.sada_depara_valor
  add constraint sada_depara_valor_cnpj_campo_origem_key
  unique (cnpj_orgao, campo, valor_origem);

commit;

-- ---------------------------------------------------------------------
-- Conferência (rode depois; nenhuma linha = tudo normalizado)
-- ---------------------------------------------------------------------
-- select 'sada_depara' as tabela, cnpj_orgao from public.sada_depara
--  where cnpj_orgao <> regexp_replace(cnpj_orgao, '\D', '', 'g')
-- union all
-- select 'sada_importacoes', cnpj_orgao from public.sada_importacoes
--  where cnpj_orgao <> regexp_replace(cnpj_orgao, '\D', '', 'g');

-- Mapas que ganharam sufixo na etapa 4 (confira e apague os que não servem):
-- select cnpj_orgao, tipo, nome, updated_at from public.sada_depara
--  where nome ~ ' \(\d+\)$' order by cnpj_orgao, tipo, nome;

-- =====================================================================
-- Cache de consulta de CNPJ na Receita (via BrasilAPI)
--
-- Guardar em vez de consultar a cada abertura de tela por três motivos:
-- a API é pública e tem limite por IP; a situação cadastral muda raramente
-- (mudança de ofício é evento de anos, não de horas); e a consulta entra em
-- listas de devedores, onde a mesma tela pode pedir centenas de documentos.
--
-- `bruto` guarda a resposta inteira. Os campos promovidos a coluna são só os
-- que a tela usa hoje — se amanhã precisarmos de CNAE secundário ou do quadro
-- societário, o dado já está aqui e vira coluna sem nova consulta.
--
-- Acesso apenas pelo servidor (rota usa a chave secreta): RLS ligado e sem
-- política, como as tabelas sada_*.
-- =====================================================================

create table if not exists public.consulta_cnpj (
  cnpj              text primary key,          -- 14 dígitos, sem pontuação
  razao_social      text,
  nome_fantasia     text,
  situacao          text,                      -- ATIVA, BAIXADA, SUSPENSA, INAPTA, NULA
  situacao_data     date,
  situacao_motivo   text,
  matriz_filial     text,
  uf                text,
  municipio         text,
  cnae_codigo       text,
  cnae_descricao    text,
  natureza_juridica text,
  porte             text,
  inicio_atividade  date,
  capital_social    numeric(18,2),
  bruto             jsonb not null default '{}'::jsonb,
  fonte             text not null default 'brasilapi',
  consultado_em     timestamptz not null default now()
);

create index if not exists idx_consulta_cnpj_situacao on public.consulta_cnpj (situacao);
create index if not exists idx_consulta_cnpj_consultado on public.consulta_cnpj (consultado_em desc);

alter table public.consulta_cnpj enable row level security;

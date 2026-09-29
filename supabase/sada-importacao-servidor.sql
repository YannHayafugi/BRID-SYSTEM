-- =====================================================================
-- SADA · importação de arquivo grande pelo servidor
--
-- POR QUE EXISTE: até aqui a planilha era lida no navegador. Medido:
--   • o navegador recusa alocar 2 GB de uma vez (RangeError);
--   • a leitura em memória consome de 35 a 50 vezes o tamanho do arquivo;
--   • com teto de ~4 GB por aba, o máximo real é um .xlsx de ~100 MB.
-- Arquivos de 2 GB ou mais nem chegam a abrir. Eles passam a ser enviados
-- ao servidor, lidos em streaming e gravados direto no banco.
--
-- Esta tabela é o acompanhamento: a tela envia o arquivo, recebe um id e
-- pergunta o andamento por ele. Também é o registro do que foi feito — um
-- trabalho de horas não pode depender da aba continuar aberta.
--
-- Idempotente: pode rodar de novo.
-- =====================================================================

begin;

create table if not exists public.sada_importacao_arquivo (
  id             bigint generated always as identity primary key,
  -- Só é preenchido quando o lote é criado, já na fase de gravação: antes
  -- disso não existe importação nenhuma para apontar.
  importacao_id  bigint references public.sada_importacoes (id) on delete set null,
  cnpj_orgao     text not null,
  tipo           text not null check (tipo in
                   ('divida_ativa', 'lancamentos', 'recebimentos', 'recebimentos_da')),
  mapa_nome      text,
  arquivo_nome   text,
  bytes          bigint,
  -- Caminho no disco do servidor. Apagado ao terminar; fica para diagnóstico
  -- quando dá erro.
  caminho        text,
  status         text not null default 'recebendo'
                   check (status in ('recebendo', 'lendo', 'gravando', 'concluido', 'erro', 'cancelado')),
  -- Andamento. `linhas_lidas` sobe na leitura; `linhas_gravadas` na carga.
  linhas_lidas   bigint not null default 0,
  linhas_gravadas bigint not null default 0,
  anos           int[],
  -- Relatório de qualidade do arquivo (mesmo formato da tela).
  relatorio      jsonb,
  mensagem       text,
  erro           text,
  criado_por     uuid references public.gp_profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_sada_imp_arquivo_ente
  on public.sada_importacao_arquivo (cnpj_orgao, tipo, created_at desc);
create index if not exists idx_sada_imp_arquivo_status
  on public.sada_importacao_arquivo (status)
  where status in ('recebendo', 'lendo', 'gravando');

comment on table public.sada_importacao_arquivo is
  'Acompanhamento das importações feitas pelo servidor (arquivos grandes). '
  'A tela envia o arquivo, recebe o id e consulta o andamento por ele.';

commit;

-- Conferência:
-- select id, cnpj_orgao, tipo, status, linhas_lidas, linhas_gravadas, erro
--   from public.sada_importacao_arquivo order by created_at desc limit 10;

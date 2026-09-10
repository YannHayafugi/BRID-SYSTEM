-- =====================================================================
-- RLS das tabelas gp_* — políticas que faltavam
--
-- As nove tabelas gp_* são lidas e gravadas com a chave publishable (cliente
-- do navegador ou route handler ligado à sessão), então RLS se aplica. Estavam
-- com RLS ligado e ZERO políticas: o Postgres nega tudo. O sintoma era a
-- mensagem "new row violates row-level security policy" no primeiro insert, e
-- telas vazias em toda leitura.
--
-- A migração `gerador_schema_unificado_v1`, que criou as políticas originais,
-- nunca foi versionada. Mas o modelo sobreviveu nas tabelas antigas, sem
-- prefixo (cadastros_tr, achados_tr, orgaos, profiles), que continuam neste
-- banco: as regras abaixo são TRADUÇÃO daquelas, não invenção.
--
-- Exceção: gp_processos, gp_oficios, gp_feedbacks e gp_solicitacoes_exclusao
-- não têm equivalente antigo. Para elas apliquei o mesmo padrão dono-ou-admin,
-- inferido de como o código usa cada tabela. Estão marcadas com INFERIDA.
--
-- As tabelas sada_* NÃO entram aqui de propósito: as rotas do SADA usam a
-- chave secreta no servidor e ignoram RLS, como registrado no cabeçalho do
-- schema. Mantê-las fechadas ao navegador é o comportamento correto.
--
-- Idempotente: cada política é dropada antes de ser criada.
-- =====================================================================

begin;

-- Atalho: "sou admin". Repetido nas políticas em vez de virar função para
-- ficar igual ao original, que inline a subconsulta. A leitura de gp_profiles
-- aqui é a do próprio usuário, permitida pela política gp_profiles_le_proprio.

-- ---------------------------------------------------------------------
-- gp_cadastros_tr — TRADUZIDA de cadastros_tr
-- ---------------------------------------------------------------------
drop policy if exists gp_cadastros_tr_select on public.gp_cadastros_tr;
create policy gp_cadastros_tr_select on public.gp_cadastros_tr
  for select to authenticated
  using (criado_por = auth.uid()
         or exists (select 1 from public.gp_profiles p
                     where p.id = auth.uid() and p.perfil = 'admin'));

drop policy if exists gp_cadastros_tr_insert on public.gp_cadastros_tr;
create policy gp_cadastros_tr_insert on public.gp_cadastros_tr
  for insert to authenticated
  with check (criado_por = auth.uid());

drop policy if exists gp_cadastros_tr_update on public.gp_cadastros_tr;
create policy gp_cadastros_tr_update on public.gp_cadastros_tr
  for update to authenticated
  using (exists (select 1 from public.gp_profiles p
                  where p.id = auth.uid()
                    and (p.perfil = 'admin'
                         or (gp_cadastros_tr.criado_por = auth.uid() and p.pode_editar_analises))));

drop policy if exists gp_cadastros_tr_delete on public.gp_cadastros_tr;
create policy gp_cadastros_tr_delete on public.gp_cadastros_tr
  for delete to authenticated
  using (exists (select 1 from public.gp_profiles p
                  where p.id = auth.uid()
                    and (p.perfil = 'admin'
                         or (gp_cadastros_tr.criado_por = auth.uid() and p.pode_excluir_analises))));

-- ---------------------------------------------------------------------
-- gp_achados_tr — TRADUZIDA de achados_tr (permissão herdada do cadastro pai)
-- ---------------------------------------------------------------------
drop policy if exists gp_achados_tr_select on public.gp_achados_tr;
create policy gp_achados_tr_select on public.gp_achados_tr
  for select to authenticated
  using (exists (select 1 from public.gp_cadastros_tr c
                  where c.id = gp_achados_tr.cadastro_id
                    and (c.criado_por = auth.uid()
                         or exists (select 1 from public.gp_profiles p
                                     where p.id = auth.uid() and p.perfil = 'admin'))));

drop policy if exists gp_achados_tr_insert on public.gp_achados_tr;
create policy gp_achados_tr_insert on public.gp_achados_tr
  for insert to authenticated
  with check (exists (select 1 from public.gp_cadastros_tr c
                       where c.id = gp_achados_tr.cadastro_id and c.criado_por = auth.uid()));

drop policy if exists gp_achados_tr_update on public.gp_achados_tr;
create policy gp_achados_tr_update on public.gp_achados_tr
  for update to authenticated
  using (exists (select 1 from public.gp_cadastros_tr c
                   join public.gp_profiles p on p.id = auth.uid()
                  where c.id = gp_achados_tr.cadastro_id
                    and (p.perfil = 'admin'
                         or (c.criado_por = auth.uid() and p.pode_editar_analises))));

drop policy if exists gp_achados_tr_delete on public.gp_achados_tr;
create policy gp_achados_tr_delete on public.gp_achados_tr
  for delete to authenticated
  using (exists (select 1 from public.gp_cadastros_tr c
                   join public.gp_profiles p on p.id = auth.uid()
                  where c.id = gp_achados_tr.cadastro_id
                    and (p.perfil = 'admin'
                         or (c.criado_por = auth.uid() and p.pode_excluir_analises))));

-- ---------------------------------------------------------------------
-- gp_achados_tr_historico — TRADUZIDA: append-only, leitura pelo achado
-- ---------------------------------------------------------------------
drop policy if exists gp_achados_tr_historico_select on public.gp_achados_tr_historico;
create policy gp_achados_tr_historico_select on public.gp_achados_tr_historico
  for select to authenticated
  using (exists (select 1 from public.gp_achados_tr a
                   join public.gp_cadastros_tr c on c.id = a.cadastro_id
                  where a.id = gp_achados_tr_historico.achado_id
                    and (c.criado_por = auth.uid()
                         or exists (select 1 from public.gp_profiles p
                                     where p.id = auth.uid() and p.perfil = 'admin'))));

drop policy if exists gp_achados_tr_historico_insert on public.gp_achados_tr_historico;
create policy gp_achados_tr_historico_insert on public.gp_achados_tr_historico
  for insert to authenticated
  with check (true);

-- ---------------------------------------------------------------------
-- gp_orgaos e gp_orgaos_contatos — TRADUZIDAS: cadastro compartilhado
-- ---------------------------------------------------------------------
drop policy if exists gp_orgaos_select on public.gp_orgaos;
create policy gp_orgaos_select on public.gp_orgaos for select to authenticated using (true);
drop policy if exists gp_orgaos_insert on public.gp_orgaos;
create policy gp_orgaos_insert on public.gp_orgaos for insert to authenticated with check (true);
drop policy if exists gp_orgaos_update on public.gp_orgaos;
create policy gp_orgaos_update on public.gp_orgaos for update to authenticated using (true);

drop policy if exists gp_orgaos_contatos_select on public.gp_orgaos_contatos;
create policy gp_orgaos_contatos_select on public.gp_orgaos_contatos for select to authenticated using (true);
drop policy if exists gp_orgaos_contatos_insert on public.gp_orgaos_contatos;
create policy gp_orgaos_contatos_insert on public.gp_orgaos_contatos for insert to authenticated with check (true);
drop policy if exists gp_orgaos_contatos_update on public.gp_orgaos_contatos;
create policy gp_orgaos_contatos_update on public.gp_orgaos_contatos for update to authenticated using (true);
drop policy if exists gp_orgaos_contatos_delete on public.gp_orgaos_contatos;
create policy gp_orgaos_contatos_delete on public.gp_orgaos_contatos for delete to authenticated using (true);

-- ---------------------------------------------------------------------
-- gp_processos — INFERIDA. Sem equivalente antigo; segue o padrão de
-- gp_cadastros_tr. A troca de etapa já é restrita a admin/editor na API
-- (app/api/processos/[id]/etapa/route.ts), então o update aqui só impede
-- que alguém mexa no processo alheio.
-- ---------------------------------------------------------------------
drop policy if exists gp_processos_select on public.gp_processos;
create policy gp_processos_select on public.gp_processos
  for select to authenticated
  using (criado_por = auth.uid()
         or exists (select 1 from public.gp_profiles p
                     where p.id = auth.uid() and p.perfil in ('admin', 'editor')));

drop policy if exists gp_processos_insert on public.gp_processos;
create policy gp_processos_insert on public.gp_processos
  for insert to authenticated
  with check (criado_por = auth.uid());

drop policy if exists gp_processos_update on public.gp_processos;
create policy gp_processos_update on public.gp_processos
  for update to authenticated
  using (criado_por = auth.uid()
         or exists (select 1 from public.gp_profiles p
                     where p.id = auth.uid() and p.perfil in ('admin', 'editor')));

drop policy if exists gp_processos_delete on public.gp_processos;
create policy gp_processos_delete on public.gp_processos
  for delete to authenticated
  using (criado_por = auth.uid()
         or exists (select 1 from public.gp_profiles p
                     where p.id = auth.uid() and p.perfil = 'admin'));

-- ---------------------------------------------------------------------
-- gp_oficios — INFERIDA. É catálogo compartilhado: /api/oficios lista sem
-- filtrar por autor, e excluir um processo desvincula ofícios de terceiros
-- (update job_id = null). Por isso leitura e atualização abertas a qualquer
-- autenticado; criar exige ser o autor e excluir fica com admin.
-- ---------------------------------------------------------------------
drop policy if exists gp_oficios_select on public.gp_oficios;
create policy gp_oficios_select on public.gp_oficios for select to authenticated using (true);

drop policy if exists gp_oficios_insert on public.gp_oficios;
create policy gp_oficios_insert on public.gp_oficios
  for insert to authenticated with check (criado_por = auth.uid());

drop policy if exists gp_oficios_update on public.gp_oficios;
create policy gp_oficios_update on public.gp_oficios for update to authenticated using (true);

drop policy if exists gp_oficios_delete on public.gp_oficios;
create policy gp_oficios_delete on public.gp_oficios
  for delete to authenticated
  using (exists (select 1 from public.gp_profiles p
                  where p.id = auth.uid() and p.perfil = 'admin'));

-- ---------------------------------------------------------------------
-- gp_feedbacks — INFERIDA. Qualquer usuário registra o próprio feedback;
-- quem resolve é admin. Era esta a tabela que recusava o insert.
-- ---------------------------------------------------------------------
drop policy if exists gp_feedbacks_insert on public.gp_feedbacks;
create policy gp_feedbacks_insert on public.gp_feedbacks
  for insert to authenticated with check (criado_por = auth.uid());

drop policy if exists gp_feedbacks_select on public.gp_feedbacks;
create policy gp_feedbacks_select on public.gp_feedbacks
  for select to authenticated
  using (criado_por = auth.uid()
         or exists (select 1 from public.gp_profiles p
                     where p.id = auth.uid() and p.perfil = 'admin'));

drop policy if exists gp_feedbacks_update on public.gp_feedbacks;
create policy gp_feedbacks_update on public.gp_feedbacks
  for update to authenticated
  using (exists (select 1 from public.gp_profiles p
                  where p.id = auth.uid() and p.perfil = 'admin'));

-- ---------------------------------------------------------------------
-- gp_solicitacoes_exclusao — INFERIDA. O usuário pede a exclusão da própria
-- análise; a decisão (aprovar ou recusar) é de admin.
-- ---------------------------------------------------------------------
drop policy if exists gp_solicitacoes_exclusao_insert on public.gp_solicitacoes_exclusao;
create policy gp_solicitacoes_exclusao_insert on public.gp_solicitacoes_exclusao
  for insert to authenticated with check (solicitado_por = auth.uid());

drop policy if exists gp_solicitacoes_exclusao_select on public.gp_solicitacoes_exclusao;
create policy gp_solicitacoes_exclusao_select on public.gp_solicitacoes_exclusao
  for select to authenticated
  using (solicitado_por = auth.uid()
         or exists (select 1 from public.gp_profiles p
                     where p.id = auth.uid() and p.perfil = 'admin'));

drop policy if exists gp_solicitacoes_exclusao_update on public.gp_solicitacoes_exclusao;
create policy gp_solicitacoes_exclusao_update on public.gp_solicitacoes_exclusao
  for update to authenticated
  using (exists (select 1 from public.gp_profiles p
                  where p.id = auth.uid() and p.perfil = 'admin'));

commit;

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { somenteDigitos } from "@/lib/mascaras";

/**
 * SADA · cliente -> CNPJs.
 *
 * O cliente é a prefeitura, cadastrada em gp_orgaos. Ela costuma operar sob
 * vários CNPJs (a prefeitura em si, autarquias, fundos), e cada um manda
 * planilha própria — no SADA cada um vira um `cnpj_orgao`. O vínculo mora em
 * sada_ente_cnpj, e é ele que permite ao dashboard somar o conjunto.
 */

/** CNPJs de um cliente, só dígitos. Lista vazia = cliente sem vínculo. */
export async function cnpjsDoCliente(orgaoId: string): Promise<string[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("sada_ente_cnpj")
    .select("cnpj_orgao")
    .eq("orgao_id", orgaoId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => somenteDigitos(String(r.cnpj_orgao)));
}

/** gp_orgaos.id é uuid: sem esta checagem, `?cliente=abc` chega ao Postgres e
 *  volta como "invalid input syntax for type uuid", que o route transforma em
 *  500 com a mensagem crua do banco. Um id truncado num link antigo bastava. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function clienteIdValido(v: string | null): boolean {
  return !!v && UUID.test(v.trim());
}

/**
 * Valor que nunca casa com um cnpj_orgao, que é sempre só dígitos.
 *
 * Serve para o caso "cliente existe mas não tem CNPJ vinculado": em vez de
 * mandar lista vazia e depender de como o PostgREST interpreta `in.()`,
 * mandamos um valor impossível e garantimos resultado vazio — que é o certo,
 * melhor do que exibir a base inteira como se fosse daquele cliente.
 */
export const SEM_VINCULO = "sem-vinculo";

/**
 * Traduz o parâmetro `?cliente=` (id em gp_orgaos) na lista de CNPJs a filtrar.
 *
 * Devolve `null` quando não há filtro — a consulta deve então varrer todos os
 * entes, que é o comportamento histórico do dashboard. Devolve lista vazia
 * quando o cliente existe mas não tem CNPJ vinculado: aí o certo é não
 * retornar nada, e NÃO cair no "sem filtro", que mostraria a base inteira
 * como se fosse daquele cliente.
 */
export async function cnpjsDoFiltro(clienteId: string | null): Promise<string[] | null> {
  if (!clienteId) return null;
  return cnpjsDoCliente(clienteId);
}

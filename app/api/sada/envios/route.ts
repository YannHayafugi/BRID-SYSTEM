import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { somenteDigitos } from "@/lib/mascaras";

export const runtime = "nodejs";

/**
 * Histórico de envios do INFO REQUEST LIST, um registro por arquivo recebido.
 *
 * Guardar o resultado — e não recalcular sob demanda — é o que permite mostrar
 * ao ente a evolução entre reenvios. O arquivo em si não é guardado aqui: só a
 * medição, que é o que interessa depois.
 */

function semAcesso(profile: { is_superadmin?: boolean; pode_ver_sada?: boolean } | null) {
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Sem acesso ao SADA." }, { status: 403 });
  }
  return null;
}

/** GET /api/sada/envios[?cnpj=...] — mais recentes primeiro. */
export async function GET(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;

  const cnpj = somenteDigitos(new URL(req.url).searchParams.get("cnpj") ?? "");
  const sb = getSupabaseAdmin();
  let q = sb
    .from("sada_envio")
    .select("id, versao_id, orgao_id, cnpj_orgao, arquivo_nome, enviado_em, indice_completude, resumo")
    .order("enviado_em", { ascending: false })
    .limit(100);
  if (cnpj) q = q.eq("cnpj_orgao", cnpj);

  const { data, error } = await q;
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ envios: data ?? [] });
}

/** POST /api/sada/envios — registra o relatório de um envio. */
export async function POST(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;

  const body = (await req.json().catch(() => null)) as {
    versaoId?: number;
    orgaoId?: string | null;
    cnpj?: string | null;
    arquivoNome?: string;
    indiceCompletude?: number;
    resumo?: unknown;
    porCampo?: unknown;
    estruturais?: unknown;
  } | null;

  if (!body?.versaoId || !body?.arquivoNome) {
    return NextResponse.json({ erro: "Informe versaoId e arquivoNome." }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("sada_envio")
    .insert({
      versao_id: body.versaoId,
      orgao_id: body.orgaoId || null,
      cnpj_orgao: body.cnpj ? somenteDigitos(body.cnpj) : null,
      arquivo_nome: body.arquivoNome,
      enviado_por: profile!.id,
      indice_completude: body.indiceCompletude ?? null,
      resumo: body.resumo ?? {},
      por_campo: body.porCampo ?? [],
      estruturais: body.estruturais ?? [],
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

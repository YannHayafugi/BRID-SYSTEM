import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual, getSupabaseRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";

/** Aprova a Proposta do processo (D14) — libera a emissão do Ofício, que só
 * pode ser gerado depois desse aceite. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const supabase = getSupabaseRouteClient();
  const { data: processo, error: erroBusca } = await supabase
    .from("gp_processos")
    .select("arquivos")
    .eq("id", params.id)
    .single();
  if (erroBusca || !processo) {
    return NextResponse.json({ erro: "Processo não encontrado." }, { status: 404 });
  }
  const arquivos = (processo.arquivos || {}) as Record<string, string>;
  if (!arquivos.proposta) {
    return NextResponse.json({ erro: "Gere a Proposta antes de aprová-la." }, { status: 400 });
  }

  const { error } = await supabase
    .from("gp_processos")
    .update({ proposta_aprovada: true, updated_at: new Date().toISOString() })
    .eq("id", params.id);
  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

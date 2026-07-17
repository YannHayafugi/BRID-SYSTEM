import { NextResponse } from "next/server";
import { getProfileAtual, getSupabaseRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";

/** Lista os ofícios do catálogo ainda não vinculados a um processo
 * (alimenta o drop do "Abrir novo processo" no Follow-up). */
export async function GET() {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const supabase = getSupabaseRouteClient();
  const { data, error } = await supabase
    .from("gp_oficios")
    .select("id, assunto, destinatario, contrato, data")
    .is("job_id", null)
    .order("data", { ascending: false });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, oficios: data || [] });
}

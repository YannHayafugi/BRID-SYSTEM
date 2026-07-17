import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual, getSupabaseRouteClient } from "@/lib/supabase/route";
import { ETAPAS_FLUXO } from "@/lib/processos/etapas";

export const runtime = "nodejs";

/** Muda a fase do processo — apenas fases manuais. As automatizadas são
 * definidas pelos documentos (Ofício → TR → Proposta). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const { etapa } = (await req.json().catch(() => ({}))) as { etapa?: number };
  if (typeof etapa !== "number" || etapa < 0 || etapa >= ETAPAS_FLUXO.length) {
    return NextResponse.json({ erro: "Etapa inválida." }, { status: 400 });
  }
  if (ETAPAS_FLUXO[etapa].tipo === "auto") {
    return NextResponse.json(
      { erro: "As fases automatizadas são definidas pelos documentos do processo — selecione apenas fases manuais." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseRouteClient();

  // D19: fases manuais só se liberam depois que a fase automatizada
  // (TR > Proposta > Ofício) estiver concluída.
  const primeiraManual = ETAPAS_FLUXO.findIndex((e) => e.tipo === "manual");
  const { data: processoAtual, error: erroBusca } = await supabase
    .from("gp_processos")
    .select("etapa")
    .eq("id", params.id)
    .single();
  if (erroBusca || !processoAtual) {
    return NextResponse.json({ erro: "Processo não encontrado." }, { status: 404 });
  }
  if (primeiraManual >= 0 && processoAtual.etapa < primeiraManual) {
    return NextResponse.json(
      { erro: "Conclua a fase automatizada (TR > Proposta > Ofício) antes de avançar para fases manuais." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("gp_processos")
    .update({ etapa, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ erro: "Processo não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, etapa, nome: ETAPAS_FLUXO[etapa].nome });
}

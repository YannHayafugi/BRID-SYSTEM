import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Fecha o lote: grava contagem e faixa de anos e atualiza as materialized
 * views. Se algo falhou no meio, o cliente pode chamar com cancelar=true para
 * remover o lote (o cascade limpa as linhas já inseridas). */
export async function POST(req: NextRequest) {
  const profile = await getProfileAtual();
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Sem acesso ao SADA." }, { status: 403 });
  }

  const { importacaoId, total, anoInicio, anoFim, cancelar } = (await req.json()) || {};
  if (!importacaoId) return NextResponse.json({ erro: "importacaoId ausente." }, { status: 400 });

  const sb = getSupabaseAdmin();

  if (cancelar) {
    await sb.from("sada_importacoes").delete().eq("id", importacaoId);
    return NextResponse.json({ ok: true, cancelado: true });
  }

  const upd = await sb
    .from("sada_importacoes")
    .update({ linhas_importadas: total ?? 0, ano_inicio: anoInicio ?? null, ano_fim: anoFim ?? null })
    .eq("id", importacaoId);
  if (upd.error) return NextResponse.json({ erro: upd.error.message }, { status: 500 });

  const rf = await sb.rpc("sada_refresh_mvs");
  if (rf.error) return NextResponse.json({ ok: true, avisoRefresh: rf.error.message });

  return NextResponse.json({ ok: true });
}

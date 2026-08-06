import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual, getSupabaseRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";

/**
 * Edição de um achado já salvo no histórico. Toda edição exige justificativa
 * e gera uma nova entrada em achados_tr_historico (versão), preservando os
 * valores anteriores — nada é sobrescrito silenciosamente.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const body = await req.json();
  const { ciente, comentario, justificativa } = body || {};

  if (typeof ciente !== "boolean") {
    return NextResponse.json({ erro: "Campo 'ciente' inválido." }, { status: 400 });
  }
  if (!justificativa || !String(justificativa).trim()) {
    return NextResponse.json(
      { erro: "Informe a justificativa da edição para salvar a alteração." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseRouteClient();

  const { data: atual, error: erroAtual } = await supabase
    .from("gp_achados_tr")
    .select("id, ciente, comentario")
    .eq("id", params.id)
    .single();

  if (erroAtual || !atual) {
    return NextResponse.json({ erro: "Achado não encontrado ou sem permissão de acesso." }, { status: 404 });
  }

  const { count } = await supabase
    .from("gp_achados_tr_historico")
    .select("id", { count: "exact", head: true })
    .eq("achado_id", params.id);

  const proximaVersao = (count || 0) + 1;

  const { error: erroHistorico } = await supabase.from("gp_achados_tr_historico").insert({
    achado_id: params.id,
    versao: proximaVersao,
    ciente_anterior: atual.ciente,
    comentario_anterior: atual.comentario,
    ciente_novo: ciente,
    comentario_novo: comentario || null,
    justificativa_edicao: String(justificativa).trim(),
    editado_por: profile.id,
  });

  if (erroHistorico) {
    return NextResponse.json(
      { erro: "Falha ao registrar o histórico da edição (verifique sua permissão): " + erroHistorico.message },
      { status: 403 }
    );
  }

  const { error: erroUpdate } = await supabase
    .from("gp_achados_tr")
    .update({ ciente, comentario: comentario || null })
    .eq("id", params.id);

  if (erroUpdate) {
    return NextResponse.json({ erro: erroUpdate.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, versao: proximaVersao });
}

/** Lista o histórico de versões de um achado, mais recente primeiro. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const supabase = getSupabaseRouteClient();
  const { data, error } = await supabase
    .from("gp_achados_tr_historico")
    .select("*, profiles:editado_por (email, nome_completo)")
    .eq("achado_id", params.id)
    .order("versao", { ascending: false });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, historico: data });
}

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getProfileAtual } from "@/lib/supabase/route";

export const runtime = "nodejs";

async function exigirAdmin() {
  const profile = await getProfileAtual();
  if (!profile) return { erro: "Não autenticado.", status: 401 as const };
  if (profile.perfil !== "admin")
    return { erro: "Apenas administradores podem gerenciar usuários.", status: 403 as const };
  return { profile };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const check = await exigirAdmin();
  if ("erro" in check) return NextResponse.json({ erro: check.erro }, { status: check.status });

  const body = await req.json();
  const { nomeCompleto, perfil, ativo, isSuperadmin, podeVerSada } = body || {};

  // is_superadmin e pode_ver_sada só podem ser alterados por um superadmin.
  const souSuper = !!check.profile.is_superadmin;
  if (!souSuper && (isSuperadmin !== undefined || podeVerSada !== undefined)) {
    return NextResponse.json(
      { erro: "Apenas superadmins podem alterar essas permissões." },
      { status: 403 }
    );
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("gp_profiles")
    .update({
      ...(nomeCompleto !== undefined ? { nome_completo: nomeCompleto } : {}),
      ...(perfil !== undefined ? { perfil } : {}),
      ...(ativo !== undefined ? { ativo } : {}),
      ...(souSuper && isSuperadmin !== undefined ? { is_superadmin: isSuperadmin } : {}),
      ...(souSuper && podeVerSada !== undefined ? { pode_ver_sada: podeVerSada } : {}),
    })
    .eq("id", params.id);

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

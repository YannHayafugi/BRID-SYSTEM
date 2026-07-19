import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getProfileAtual } from "@/lib/supabase/route";

export const runtime = "nodejs";

async function exigirAdmin() {
  const profile = await getProfileAtual();
  if (!profile) return { erro: "Não autenticado.", status: 401 as const };
  if (profile.perfil !== "admin") return { erro: "Apenas administradores podem gerenciar usuários.", status: 403 as const };
  return { profile };
}

export async function GET() {
  const check = await exigirAdmin();
  if ("erro" in check) return NextResponse.json({ erro: check.erro }, { status: check.status });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("gp_profiles")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, usuarios: data });
}

export async function POST(req: NextRequest) {
  const check = await exigirAdmin();
  if ("erro" in check) return NextResponse.json({ erro: check.erro }, { status: check.status });

  const body = await req.json();
  const { email, senha, nomeCompleto, perfil } = body || {};

  if (!email || !senha || !perfil) {
    return NextResponse.json({ erro: "E-mail, senha e perfil são obrigatórios." }, { status: 400 });
  }
  if (senha.length < 6) {
    return NextResponse.json({ erro: "A senha deve ter ao menos 6 caracteres." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return NextResponse.json({ erro: createError?.message || "Falha ao criar usuário." }, { status: 400 });
  }

  // O trigger on_auth_user_created já cria a linha em profiles; aqui só
  // completamos com perfil/permissões/nome escolhidos pelo admin.
  const { error: updateError } = await admin
    .from("gp_profiles")
    .update({
      nome_completo: nomeCompleto || null,
      perfil,
    })
    .eq("id", created.user.id);

  if (updateError) {
    return NextResponse.json({ erro: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: created.user.id });
}

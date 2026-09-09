import { NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Especificação vigente do INFO REQUEST LIST — a régua contra a qual cada
 * envio do ente é medido.
 *
 * Fica no banco, versionada, e não é lida da aba LEIA do arquivo recebido:
 * o ente poderia alterar a criticidade dos campos ao mexer na própria cópia,
 * e passaria a ser avaliado por uma régua que não é a nossa.
 */
export async function GET() {
  const profile = await getProfileAtual();
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Sem acesso ao SADA." }, { status: 403 });
  }

  const sb = getSupabaseAdmin();
  const { data: versao, error: erroVersao } = await sb
    .from("sada_spec_versao")
    .select("id, nome, arquivo_nome, created_at")
    .eq("vigente", true)
    .maybeSingle();
  if (erroVersao) return NextResponse.json({ erro: erroVersao.message }, { status: 500 });
  if (!versao) {
    return NextResponse.json(
      {
        erro:
          "Nenhuma especificação vigente. Rode supabase/sada-spec-e-envios.sql e " +
          "o seed gerado por scripts/sada-spec-gerar.cjs.",
      },
      { status: 409 },
    );
  }

  const { data: campos, error } = await sb
    .from("sada_spec_campo")
    .select("aba, campo, ordem, criticidade, formato, descricao, regras")
    .eq("versao_id", versao.id)
    .order("aba")
    .order("ordem");
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({ versao, campos: campos ?? [] });
}

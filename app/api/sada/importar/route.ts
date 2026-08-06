import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { TIPOS_SADA } from "@/lib/sada/import";

export const runtime = "nodejs";

/** Início da importação: cria o lote vigente e marca os anteriores do mesmo
 * ente+tipo como não-vigentes (retrato + histórico). Retorna o importacaoId. */
export async function POST(req: NextRequest) {
  const profile = await getProfileAtual();
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Sem acesso ao SADA." }, { status: 403 });
  }

  const { cnpj, tipo, arquivoNome } = (await req.json()) || {};
  if (!cnpj || !TIPOS_SADA.includes(tipo)) {
    return NextResponse.json({ erro: "Informe CNPJ e um tipo válido." }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const ins = await sb
    .from("sada_importacoes")
    .insert({ cnpj_orgao: cnpj, tipo, arquivo_nome: arquivoNome ?? null, vigente: true })
    .select("id")
    .single();
  if (ins.error) return NextResponse.json({ erro: ins.error.message }, { status: 500 });

  const upd = await sb
    .from("sada_importacoes")
    .update({ vigente: false })
    .eq("cnpj_orgao", cnpj).eq("tipo", tipo).neq("id", ins.data.id);
  if (upd.error) return NextResponse.json({ erro: upd.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, importacaoId: ins.data.id });
}

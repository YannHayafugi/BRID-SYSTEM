import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { TABELA_SADA, TipoSada, TIPOS_SADA } from "@/lib/sada/import";

export const runtime = "nodejs";

/** Recebe um lote de linhas já convertidas pelo navegador e as insere na
 * tabela do tipo, carimbando o importacao_id. Mantido pequeno (< limite do
 * Vercel): o cliente envia em blocos de ~1000 linhas. */
export async function POST(req: NextRequest) {
  const profile = await getProfileAtual();
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Sem acesso ao SADA." }, { status: 403 });
  }

  const { importacaoId, tipo, linhas } = (await req.json()) || {};
  if (!importacaoId || !TIPOS_SADA.includes(tipo) || !Array.isArray(linhas)) {
    return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  }
  if (linhas.length === 0) return NextResponse.json({ ok: true, inseridas: 0 });
  if (linhas.length > 5000) {
    return NextResponse.json({ erro: "Lote grande demais (máx. 5000)." }, { status: 400 });
  }

  const tabela = TABELA_SADA[tipo as TipoSada];
  const registros = linhas.map((l: Record<string, unknown>) => ({ ...l, importacao_id: importacaoId }));

  const sb = getSupabaseAdmin();
  const { error } = await sb.from(tabela).insert(registros);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, inseridas: registros.length });
}

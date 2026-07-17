import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual, getSupabaseRouteClient } from "@/lib/supabase/route";
import { removerArquivos } from "@/lib/processos/arquivos";

export const runtime = "nodejs";

/** Edita o título do processo e, opcionalmente, o órgão vinculado a ele. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const { titulo, orgaoId } = (await req.json().catch(() => ({}))) as { titulo?: string; orgaoId?: string };
  if (!titulo || !titulo.trim()) {
    return NextResponse.json({ erro: "Informe o título do processo." }, { status: 400 });
  }
  if (!orgaoId) {
    return NextResponse.json({ erro: "Informe o órgão do processo." }, { status: 400 });
  }

  const supabase = getSupabaseRouteClient();
  const { data, error } = await supabase
    .from("gp_processos")
    .update({ titulo: titulo.trim(), orgao_id: orgaoId, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select("id, titulo, orgao_id")
    .single();
  if (error || !data) {
    return NextResponse.json({ erro: error?.message || "Processo não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, titulo: data.titulo, orgaoId: data.orgao_id });
}

/** Exclui o processo, seus arquivos exclusivos no storage e devolve ao drop
 * os ofícios do catálogo que estavam vinculados a ele. RLS garante que só o
 * dono (ou admin) consegue excluir. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const supabase = getSupabaseRouteClient();
  const { data: processo } = await supabase
    .from("gp_processos")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!processo) {
    return NextResponse.json({ erro: "Processo não encontrado." }, { status: 404 });
  }

  // arquivos exclusivos do processo (prefixo {id}/...); ofícios do catálogo
  // (prefixo oficios/...) são compartilhados e permanecem no storage
  const caminhos: string[] = Object.values(processo.arquivos || {}) as string[];
  for (const info of Object.values(processo.documentos || {}) as { arquivo?: string }[]) {
    if (info?.arquivo?.startsWith(`${params.id}/`)) caminhos.push(info.arquivo);
  }
  await removerArquivos(caminhos);

  // ofícios vinculados voltam ao drop
  await supabase.from("gp_oficios").update({ job_id: null }).eq("job_id", params.id);

  const { error } = await supabase.from("gp_processos").delete().eq("id", params.id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

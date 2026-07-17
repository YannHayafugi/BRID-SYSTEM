import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual, getSupabaseRouteClient } from "@/lib/supabase/route";
import { removerArquivos } from "@/lib/processos/arquivos";

export const runtime = "nodejs";

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

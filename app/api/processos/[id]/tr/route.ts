import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual, getSupabaseRouteClient } from "@/lib/supabase/route";
import { uploadArquivo } from "@/lib/processos/arquivos";

export const runtime = "nodejs";

const EXTS_TR = [".pdf", ".docx", ".txt", ".md"];

/** Anexa (ou substitui) o TR do processo. Avança a fase para
 * "TR/ETP recebido e validado" se o processo ainda estava na abertura. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const supabase = getSupabaseRouteClient();
  const { data: processo } = await supabase
    .from("gp_processos")
    .select("id, etapa, arquivos")
    .eq("id", params.id)
    .single();
  if (!processo) {
    return NextResponse.json({ erro: "Processo não encontrado." }, { status: 404 });
  }

  const form = await req.formData();
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof Blob) || !(arquivo as File).name) {
    return NextResponse.json({ erro: "Envie o TR no campo 'arquivo'." }, { status: 400 });
  }

  const nome = (arquivo as File).name;
  const ext = nome.slice(nome.lastIndexOf(".")).toLowerCase();
  if (!EXTS_TR.includes(ext)) {
    return NextResponse.json({ erro: "Envie um TR em PDF, DOCX ou TXT." }, { status: 400 });
  }

  const caminho = `${params.id}/TR${ext}`;
  await uploadArquivo(
    caminho,
    Buffer.from(await arquivo.arrayBuffer()),
    ext === ".pdf" ? "application/pdf" : "application/octet-stream"
  );

  const arquivos = { ...(processo.arquivos || {}), tr: caminho };
  const campos: Record<string, unknown> = {
    arquivos,
    tr_nome: nome,
    updated_at: new Date().toISOString(),
  };
  if (processo.etapa < 1) campos.etapa = 1;

  const { error } = await supabase.from("gp_processos").update(campos).eq("id", params.id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, etapa: campos.etapa ?? processo.etapa });
}

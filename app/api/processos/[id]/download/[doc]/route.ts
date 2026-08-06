import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual, getSupabaseRouteClient } from "@/lib/supabase/route";
import { baixarArquivo, respostaArquivo, DOCX_MIME } from "@/lib/processos/arquivos";

export const runtime = "nodejs";

/** Download de um documento do processo: tr | proposta | resumo | oficio.
 * A leitura do registro passa pelo RLS (dono ou admin); o arquivo em si vem
 * do bucket privado via cliente admin. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; doc: string } }
) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const supabase = getSupabaseRouteClient();
  const { data: p } = await supabase
    .from("gp_processos")
    .select("titulo, tr_nome, arquivos, documentos")
    .eq("id", params.id)
    .single();
  if (!p) return NextResponse.json({ erro: "Processo não encontrado." }, { status: 404 });

  const arquivos = (p.arquivos || {}) as Record<string, string>;
  const documentos = (p.documentos || {}) as Record<string, { nome?: string; arquivo?: string }>;

  let caminho: string | undefined;
  let nome: string;
  let mime = "application/octet-stream";

  switch (params.doc) {
    case "tr":
      caminho = arquivos.tr;
      nome = p.tr_nome || "TR.pdf";
      // O TR pode ter sido anexado em PDF, DOCX, TXT ou MD (ver EXTS_TR em
      // app/api/processos/[id]/tr/route.ts) — sem isso o content-type ficava
      // sempre como octet-stream, quebrando a detecção automática de tipo.
      if (caminho?.endsWith(".docx")) mime = DOCX_MIME;
      else if (caminho?.endsWith(".pdf")) mime = "application/pdf";
      break;
    case "proposta":
      caminho = arquivos.proposta;
      nome = `Proposta - ${p.titulo.slice(0, 60)}.docx`;
      mime = DOCX_MIME;
      break;
    case "resumo":
      caminho = arquivos.resumo;
      nome = `Resumo - ${p.titulo.slice(0, 60)}.docx`;
      mime = DOCX_MIME;
      break;
    case "oficio":
      caminho = documentos.oficio?.arquivo;
      nome = documentos.oficio?.nome || "Oficio.docx";
      break;
    default:
      return NextResponse.json({ erro: "Documento inválido." }, { status: 404 });
  }

  if (!caminho) return NextResponse.json({ erro: "Documento não encontrado." }, { status: 404 });

  try {
    const conteudo = await baixarArquivo(caminho);
    return respostaArquivo(conteudo, nome, mime);
  } catch {
    return NextResponse.json({ erro: "Arquivo não encontrado no storage." }, { status: 404 });
  }
}

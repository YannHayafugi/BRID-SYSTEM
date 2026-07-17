import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getProfileAtual, getSupabaseRouteClient } from "@/lib/supabase/route";
import { montarOficio } from "@/lib/oficio/oficioDocx";
import { OficioData } from "@/lib/oficio/tipos";
import { uploadArquivo, nomeDownload, DOCX_MIME } from "@/lib/processos/arquivos";

export const runtime = "nodejs";

/** Gera o ofício FIA (.docx), devolve para download e persiste no catálogo
 * gp_oficios + storage (alimenta o drop do Follow-up). */
export async function POST(req: NextRequest) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const dados = (await req.json().catch(() => null)) as OficioData | null;
  if (!dados?.destinatario_nome || !dados?.numero_contrato || !dados?.assunto) {
    return NextResponse.json(
      { erro: "Destinatário, nº do contrato e assunto são obrigatórios." },
      { status: 400 }
    );
  }

  let conteudo: Buffer;
  try {
    conteudo = await montarOficio(dados);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: `Falha ao gerar o ofício: ${msg}` }, { status: 500 });
  }

  const nome = nomeDownload(`Oficio - Contrato ${dados.numero_contrato.replace(/\//g, "-")}.docx`);

  // Persistência (melhor esforço): o download funciona mesmo se o catálogo falhar.
  let oficioId = "";
  try {
    oficioId = randomUUID().replace(/-/g, "").slice(0, 12);
    const caminho = `oficios/${oficioId}/${nome}`;
    await uploadArquivo(caminho, conteudo, DOCX_MIME);
    const supabase = getSupabaseRouteClient();
    const { error } = await supabase.from("gp_oficios").insert({
      id: oficioId,
      assunto: dados.assunto,
      destinatario: dados.destinatario_nome,
      contrato: dados.numero_contrato,
      data: new Date().toISOString(),
      arquivo: caminho,
      criado_por: profile.id,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.warn(`[aviso] ofício gerado mas não persistido: ${e}`);
    oficioId = "";
  }

  return new Response(new Uint8Array(conteudo), {
    status: 200,
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `attachment; filename="${nome}"`,
      "X-Oficio-Id": oficioId,
    },
  });
}

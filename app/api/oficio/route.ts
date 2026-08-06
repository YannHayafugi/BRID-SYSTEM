import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getProfileAtual, getSupabaseRouteClient } from "@/lib/supabase/route";
import { montarOficio } from "@/lib/oficio/oficioDocx";
import { OficioData } from "@/lib/oficio/tipos";
import { uploadArquivo, nomeDownload, DOCX_MIME } from "@/lib/processos/arquivos";

export const runtime = "nodejs";

/** Gera o ofício FIA (.docx), devolve para download e persiste no catálogo
 * gp_oficios + storage (alimenta o drop do Follow-up).
 *
 * D14: no fluxo TR > Proposta > Ofício, o Ofício de um processo do Follow-up
 * só pode ser emitido depois que a Proposta foi aprovada (processoId opcional
 * no corpo — quando presente, valida a aprovação e já vincula o ofício ao
 * processo, avançando a fase). */
export async function POST(req: NextRequest) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as (OficioData & { processoId?: string }) | null;
  const dados = body;
  if (!dados?.destinatario_nome || !dados?.numero_contrato || !dados?.assunto) {
    return NextResponse.json(
      { erro: "Destinatário, nº do contrato e assunto são obrigatórios." },
      { status: 400 }
    );
  }

  const processoId = dados.processoId?.trim() || "";
  const supabase = getSupabaseRouteClient();

  if (processoId) {
    const { data: processo, error: erroProcesso } = await supabase
      .from("gp_processos")
      .select("proposta_aprovada, etapa")
      .eq("id", processoId)
      .single();
    if (erroProcesso || !processo) {
      return NextResponse.json({ erro: "Processo não encontrado." }, { status: 404 });
    }
    if (!processo.proposta_aprovada) {
      return NextResponse.json(
        { erro: "O Ofício só pode ser emitido depois que a Proposta for aprovada." },
        { status: 400 }
      );
    }
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
    const { error } = await supabase.from("gp_oficios").insert({
      id: oficioId,
      assunto: dados.assunto,
      destinatario: dados.destinatario_nome,
      contrato: dados.numero_contrato,
      data: new Date().toISOString(),
      arquivo: caminho,
      criado_por: profile.id,
      job_id: processoId || null,
    });
    if (error) throw new Error(error.message);

    if (processoId) {
      const { data: processoAtual } = await supabase
        .from("gp_processos")
        .select("etapa")
        .eq("id", processoId)
        .single();
      const etapaAtual = processoAtual?.etapa ?? 0;
      await supabase
        .from("gp_processos")
        .update({
          documentos: { oficio: { nome, arquivo: caminho, data: new Date().toISOString() } },
          etapa: etapaAtual < 3 ? 3 : etapaAtual,
          updated_at: new Date().toISOString(),
        })
        .eq("id", processoId);
    }
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

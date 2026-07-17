import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual, getSupabaseRouteClient } from "@/lib/supabase/route";
import { ETAPAS_FLUXO } from "@/lib/processos/etapas";
import { uploadArquivo } from "@/lib/processos/arquivos";

export const runtime = "nodejs";

const EXTS_OFICIO = [".pdf", ".docx", ".doc", ".txt", ".png", ".jpg", ".jpeg"];

/** Lista os processos do Follow-up (RLS: usuário vê os próprios; admin vê todos). */
export async function GET() {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const supabase = getSupabaseRouteClient();
  const { data, error } = await supabase
    .from("gp_processos")
    .select("*, orgao:gp_orgaos(id, razao_social, tipo_ente, cidade, uf)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const processos = (data || []).map((p) => ({
    id: p.id,
    titulo: p.titulo,
    orgao: p.orgao,
    data: p.created_at,
    tr_nome: p.tr_nome || "",
    etapa: p.etapa,
    documentos: p.documentos || {},
    arquivos: Object.keys(p.arquivos || {}),
    cadastro_tr_id: p.cadastro_tr_id,
  }));

  return NextResponse.json({ ok: true, processos, etapas: ETAPAS_FLUXO });
}

/** Abre um processo no Follow-up. Aceita multipart com:
 *  titulo (obrigatório), orgao_id (opcional — D6), oficio_id (ofício do catálogo)
 *  ou arquivo (ofício externo). */
export async function POST(req: NextRequest) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const form = await req.formData();
  const titulo = String(form.get("titulo") || "").trim();
  const orgaoId = String(form.get("orgao_id") || "").trim();
  const oficioId = String(form.get("oficio_id") || "").trim();
  const arquivo = form.get("arquivo");

  if (!titulo) {
    return NextResponse.json({ erro: "Informe o título do processo." }, { status: 400 });
  }
  if (!orgaoId) {
    return NextResponse.json({ erro: "Selecione o órgão (cliente) do processo." }, { status: 400 });
  }

  const supabase = getSupabaseRouteClient();
  const documentos: Record<string, unknown> = {};

  // Ofício do catálogo (drop) — vincula e sai da lista de disponíveis
  if (oficioId) {
    const { data: oficio } = await supabase.from("gp_oficios").select("*").eq("id", oficioId).single();
    if (!oficio) {
      return NextResponse.json({ erro: "Ofício selecionado não encontrado." }, { status: 404 });
    }
    documentos.oficio = { nome: oficio.arquivo.split("/").pop(), arquivo: oficio.arquivo, data: oficio.data };
  }

  const { data: criado, error } = await supabase
    .from("gp_processos")
    .insert({
      criado_por: profile.id,
      titulo,
      orgao_id: orgaoId || null,
      etapa: 0,
      documentos,
      arquivos: {},
    })
    .select("id")
    .single();
  if (error || !criado) {
    return NextResponse.json({ erro: error?.message || "Falha ao criar o processo." }, { status: 500 });
  }

  // Ofício externo (upload direto no formulário)
  if (!oficioId && arquivo instanceof Blob && (arquivo as File).name) {
    const nome = (arquivo as File).name;
    const ext = nome.slice(nome.lastIndexOf(".")).toLowerCase();
    if (!EXTS_OFICIO.includes(ext)) {
      return NextResponse.json({ erro: "Formato do ofício não suportado." }, { status: 400 });
    }
    const caminho = `${criado.id}/DOC_oficio${ext}`;
    await uploadArquivo(caminho, Buffer.from(await arquivo.arrayBuffer()));
    await supabase
      .from("gp_processos")
      .update({ documentos: { oficio: { nome, arquivo: caminho, data: new Date().toISOString() } } })
      .eq("id", criado.id);
  }

  // marca o ofício do catálogo como usado (some do drop)
  if (oficioId) {
    await supabase.from("gp_oficios").update({ job_id: criado.id }).eq("id", oficioId);
  }

  return NextResponse.json({ ok: true, id: criado.id, etapa: 0, nome: ETAPAS_FLUXO[0].nome });
}

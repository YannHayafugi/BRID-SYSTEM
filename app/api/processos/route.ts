import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual, getSupabaseRouteClient } from "@/lib/supabase/route";
import { ETAPAS_FLUXO } from "@/lib/processos/etapas";

export const runtime = "nodejs";

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
    proposta_aprovada: !!p.proposta_aprovada,
  }));

  return NextResponse.json({ ok: true, processos, etapas: ETAPAS_FLUXO });
}

/** Abre um processo no Follow-up. Fluxo de documentos é TR > Proposta > Ofício
 *  (D14) — o processo nasce só com título e órgão; o TR entra em seguida pelo
 *  card, e o Ofício só é liberado depois que a Proposta é aprovada. */
export async function POST(req: NextRequest) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const form = await req.formData();
  const titulo = String(form.get("titulo") || "").trim();
  const orgaoId = String(form.get("orgao_id") || "").trim();

  if (!titulo) {
    return NextResponse.json({ erro: "Informe o título do processo." }, { status: 400 });
  }
  if (!orgaoId) {
    return NextResponse.json({ erro: "Selecione o órgão (cliente) do processo." }, { status: 400 });
  }

  const supabase = getSupabaseRouteClient();
  const { data: criado, error } = await supabase
    .from("gp_processos")
    .insert({
      criado_por: profile.id,
      titulo,
      orgao_id: orgaoId,
      etapa: 0,
      documentos: {},
      arquivos: {},
    })
    .select("id")
    .single();
  if (error || !criado) {
    return NextResponse.json({ erro: error?.message || "Falha ao criar o processo." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: criado.id, etapa: 0, nome: ETAPAS_FLUXO[0].nome });
}

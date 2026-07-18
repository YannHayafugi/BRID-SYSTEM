import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual, getSupabaseRouteClient } from "@/lib/supabase/route";
import { ETAPAS_FLUXO } from "@/lib/processos/etapas";

export const runtime = "nodejs";

/** Lista os processos do Follow-up (RLS: usuário vê os próprios; admin vê todos).
 * D44: com ?meus=1, devolve apenas os criados pelo próprio usuário — vale
 * para todos, inclusive admin (usado no Histórico). */
export async function GET(req: NextRequest) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }
  const apenasMeus = req.nextUrl.searchParams.get("meus") === "1";

  // D29: "criado por" só é exposto para administradores — só neste caso o
  // select embute o criador (RLS já garante que não-admin só vê os próprios
  // processos, então mostrar quem criou seria redundante para eles).
  const ehAdmin = profile.perfil === "admin";
  // D41: também traz o status da análise de TR vinculada (em_analise =
  // rascunho pronto para revisar, concluida = relatório já gerado), para o
  // botão "Analisar TR" distinguir os dois estados.
  const campos = ehAdmin
    ? "*, orgao:gp_orgaos(id, razao_social, tipo_ente, cidade, uf), criador:gp_profiles!gp_processos_criado_por_fkey(id, nome_completo, email), cadastro_tr:gp_cadastros_tr(status)"
    : "*, orgao:gp_orgaos(id, razao_social, tipo_ente, cidade, uf), cadastro_tr:gp_cadastros_tr(status)";

  const supabase = getSupabaseRouteClient();
  let consulta = supabase
    .from("gp_processos")
    .select(campos)
    .order("created_at", { ascending: false });
  if (apenasMeus) consulta = consulta.eq("criado_por", profile.id);
  const { data, error } = await consulta;
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const processos = (data || []).map((p: any) => ({
    id: p.id,
    titulo: p.titulo,
    orgao: p.orgao,
    data: p.created_at,
    atualizado_em: p.updated_at,
    tr_nome: p.tr_nome || "",
    etapa: p.etapa,
    documentos: p.documentos || {},
    arquivos: Object.keys(p.arquivos || {}),
    cadastro_tr_id: p.cadastro_tr_id,
    cadastro_tr_status: p.cadastro_tr?.status || null,
    proposta_aprovada: !!p.proposta_aprovada,
    historico_etapas: p.historico_etapas || [],
    criado_por: ehAdmin
      ? { id: p.criador?.id ?? p.criado_por, nome: p.criador?.nome_completo || p.criador?.email || "—" }
      : null,
  }));

  return NextResponse.json({ ok: true, processos, etapas: ETAPAS_FLUXO, souAdmin: ehAdmin, perfil: profile.perfil });
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

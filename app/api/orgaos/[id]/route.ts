import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual, getSupabaseRouteClient } from "@/lib/supabase/route";
import { orgaoValido, somenteDigitos, TipoEnte } from "@/lib/orgaos/types";

export const runtime = "nodejs";

/** Detalhe de um órgão + seus contatos. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const supabase = getSupabaseRouteClient();

  const { data: orgao, error: erroOrgao } = await supabase
    .from("gp_orgaos")
    .select("*")
    .eq("id", params.id)
    .single();
  if (erroOrgao || !orgao) {
    return NextResponse.json({ erro: "Órgão não encontrado." }, { status: 404 });
  }

  const { data: contatos, error: erroContatos } = await supabase
    .from("gp_orgaos_contatos")
    .select("*")
    .eq("orgao_id", params.id)
    .order("created_at", { ascending: true });
  if (erroContatos) {
    return NextResponse.json({ erro: erroContatos.message }, { status: 500 });
  }

  // Processos (Ações) deste órgão — usados na timeline de fases da página de
  // detalhe. D29: "criado por" só é embutido para administradores.
  const ehAdmin = profile.perfil === "admin";
  // D41: também traz o status da análise de TR vinculada (em_analise =
  // rascunho pronto para revisar, concluida = relatório já gerado).
  const campos = ehAdmin
    ? "id, titulo, etapa, arquivos, documentos, proposta_aprovada, historico_etapas, cadastro_tr_id, created_at, criador:gp_profiles!gp_processos_criado_por_fkey(id, nome_completo, email), cadastro_tr:gp_cadastros_tr(status)"
    : "id, titulo, etapa, arquivos, documentos, proposta_aprovada, historico_etapas, cadastro_tr_id, created_at, cadastro_tr:gp_cadastros_tr(status)";

  const { data: processos, error: erroProcessos } = await supabase
    .from("gp_processos")
    .select(campos)
    .eq("orgao_id", params.id)
    .order("created_at", { ascending: false });
  if (erroProcessos) {
    return NextResponse.json({ erro: erroProcessos.message }, { status: 500 });
  }

  const processosMapeados = (processos || []).map((p: any) => ({
    id: p.id,
    titulo: p.titulo,
    data: p.created_at,
    etapa: p.etapa,
    documentos: p.documentos || {},
    arquivos: Object.keys(p.arquivos || {}),
    cadastro_tr_id: p.cadastro_tr_id,
    cadastro_tr_status: p.cadastro_tr?.status || null,
    proposta_aprovada: !!p.proposta_aprovada,
    historico_etapas: p.historico_etapas || [],
    criado_por: ehAdmin
      ? { id: p.criador?.id ?? null, nome: p.criador?.nome_completo || p.criador?.email || "—" }
      : null,
  }));

  return NextResponse.json({
    ok: true,
    orgao: { ...orgao, contatos: contatos || [] },
    processos: processosMapeados,
    souAdmin: ehAdmin,
    perfil: profile.perfil,
  });
}

interface EditarOrgaoBody {
  tipoEnte: TipoEnte;
  razaoSocial: string;
  cnpj: string;
  cidade: string;
  uf: string;
}

/** Edita os dados cadastrais do órgão (tipo, razão social, CNPJ, cidade, UF). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const body = (await req.json()) as EditarOrgaoBody;
  const faltando = orgaoValido(body);
  if (faltando.length > 0) {
    return NextResponse.json(
      { erro: "Campos obrigatórios não preenchidos: " + faltando.join(", ") },
      { status: 400 }
    );
  }

  const supabase = getSupabaseRouteClient();

  const cnpjDigitos = somenteDigitos(body.cnpj);
  const { data: existente } = await supabase
    .from("gp_orgaos")
    .select("id")
    .eq("cnpj", cnpjDigitos)
    .neq("id", params.id)
    .maybeSingle();
  if (existente) {
    return NextResponse.json(
      { erro: "Já existe outro órgão cadastrado com este CNPJ." },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("gp_orgaos")
    .update({
      tipo_ente: body.tipoEnte,
      razao_social: body.razaoSocial.trim(),
      cnpj: cnpjDigitos,
      cidade: body.cidade.trim(),
      uf: body.uf.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .select("*")
    .single();

  if (error || !data) {
    const duplicado = (error as any)?.code === "23505";
    return NextResponse.json(
      {
        erro: duplicado
          ? "Já existe outro órgão cadastrado com este CNPJ."
          : "Falha ao salvar as alterações: " + (error?.message || "erro desconhecido"),
      },
      { status: duplicado ? 409 : 500 }
    );
  }

  return NextResponse.json({ ok: true, orgao: data });
}

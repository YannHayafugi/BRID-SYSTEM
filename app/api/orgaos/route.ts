import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual, getSupabaseRouteClient } from "@/lib/supabase/route";
import { contatoValido, NovoContatoInput, orgaoValido, somenteDigitos, TipoEnte } from "@/lib/orgaos/types";

export const runtime = "nodejs";

interface NovoOrgaoBody {
  tipoEnte: TipoEnte;
  razaoSocial: string;
  cnpj: string;
  cidade: string;
  uf: string;
  contatos?: NovoContatoInput[];
}

/** Lista órgãos cadastrados, em ordem alfabética por razão social, com
 * filtros isolados e combináveis: q (busca em razão social), tipo (tipo do
 * ente) e de/ate (intervalo de data de cadastro). */
export async function GET(req: NextRequest) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const tipo = searchParams.get("tipo")?.trim();
  const de = searchParams.get("de")?.trim();
  const ate = searchParams.get("ate")?.trim();

  const supabase = getSupabaseRouteClient();
  // D15: cada órgão traz suas "Ações" (processos do Follow-up) para o card —
  // arquivos/documentos/proposta_aprovada alimentam o progresso por ação.
  let query = supabase
    .from("gp_orgaos")
    .select("*, processos:gp_processos(id, titulo, etapa, arquivos, documentos, proposta_aprovada)")
    .order("razao_social", { ascending: true });

  if (q) query = query.ilike("razao_social", `%${q}%`);
  if (tipo) query = query.eq("tipo_ente", tipo);
  if (de) query = query.gte("created_at", `${de}T00:00:00`);
  if (ate) query = query.lte("created_at", `${ate}T23:59:59`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const orgaos = (data || []).map((o) => ({
    ...o,
    processos: (o.processos || []).map((p: any) => ({
      id: p.id,
      titulo: p.titulo,
      etapa: p.etapa,
      arquivos: Object.keys(p.arquivos || {}),
      documentos: p.documentos || {},
      proposta_aprovada: !!p.proposta_aprovada,
    })),
  }));

  return NextResponse.json({ ok: true, orgaos });
}

/** Cadastra um novo órgão. Tipo do ente, razão social, cidade e UF são
 * obrigatórios. Contatos são opcionais nesta etapa (podem ser adicionados
 * depois), mas é possível já incluir um ou mais no próprio cadastro. */
export async function POST(req: NextRequest) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const body = (await req.json()) as NovoOrgaoBody;

  const faltando = orgaoValido(body);
  if (faltando.length > 0) {
    return NextResponse.json(
      { erro: "Campos obrigatórios não preenchidos: " + faltando.join(", ") },
      { status: 400 }
    );
  }

  // Contatos são opcionais no cadastro, mas se o usuário começou a
  // preencher um bloco de contato, validamos os campos obrigatórios dele.
  const contatos = (body.contatos || []).filter(
    (c) => c.nomeCompleto?.trim() || c.cargo?.trim() || c.email?.trim() || c.telefone?.trim()
  );
  for (const c of contatos) {
    const faltandoContato = contatoValido(c);
    if (faltandoContato.length > 0) {
      return NextResponse.json(
        { erro: "Contato incompleto — faltam: " + faltandoContato.join(", ") },
        { status: 400 }
      );
    }
  }

  const supabase = getSupabaseRouteClient();

  const cnpjDigitos = somenteDigitos(body.cnpj);
  const { data: existente } = await supabase
    .from("gp_orgaos")
    .select("id")
    .eq("cnpj", cnpjDigitos)
    .maybeSingle();
  if (existente) {
    return NextResponse.json(
      { erro: "Já existe um órgão cadastrado com este CNPJ." },
      { status: 409 }
    );
  }

  const { data: orgao, error: erroOrgao } = await supabase
    .from("gp_orgaos")
    .insert({
      criado_por: profile.id,
      tipo_ente: body.tipoEnte,
      razao_social: body.razaoSocial.trim(),
      cnpj: cnpjDigitos,
      cidade: body.cidade.trim(),
      uf: body.uf.trim(),
    })
    .select("*")
    .single();

  if (erroOrgao || !orgao) {
    // 23505 = violação de unicidade — segunda camada de proteção contra
    // corrida entre a checagem acima e o insert (ver índice único no schema).
    const duplicado = (erroOrgao as any)?.code === "23505";
    return NextResponse.json(
      {
        erro: duplicado
          ? "Já existe um órgão cadastrado com este CNPJ."
          : "Falha ao cadastrar o órgão: " + (erroOrgao?.message || "erro desconhecido"),
      },
      { status: duplicado ? 409 : 500 }
    );
  }

  if (contatos.length > 0) {
    const { error: erroContatos } = await supabase.from("gp_orgaos_contatos").insert(
      contatos.map((c) => ({
        orgao_id: orgao.id,
        nome_completo: c.nomeCompleto.trim(),
        cargo: c.cargo.trim(),
        telefone: c.telefone?.trim() || null,
        email: c.email.trim(),
      }))
    );
    if (erroContatos) {
      return NextResponse.json(
        { erro: "Órgão cadastrado, mas falhou ao salvar os contatos: " + erroContatos.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, orgao });
}

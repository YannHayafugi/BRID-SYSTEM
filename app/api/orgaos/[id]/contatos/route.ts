import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual, getSupabaseRouteClient } from "@/lib/supabase/route";
import { contatoValido, NovoContatoInput } from "@/lib/orgaos/types";

export const runtime = "nodejs";

/** Adiciona um novo contato a um órgão já cadastrado — usado tanto pela
 * tela de órgãos quanto pelo botão "Adicionar contato" nas telas de análise
 * de TR e geração de proposta. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const body = (await req.json()) as NovoContatoInput;
  const faltando = contatoValido(body);
  if (faltando.length > 0) {
    return NextResponse.json(
      { erro: "Campos obrigatórios do contato não preenchidos: " + faltando.join(", ") },
      { status: 400 }
    );
  }

  const supabase = getSupabaseRouteClient();

  const { data: orgao, error: erroOrgao } = await supabase
    .from("gp_orgaos")
    .select("id")
    .eq("id", params.id)
    .single();
  if (erroOrgao || !orgao) {
    return NextResponse.json({ erro: "Órgão não encontrado." }, { status: 404 });
  }

  const { data: contato, error } = await supabase
    .from("gp_orgaos_contatos")
    .insert({
      orgao_id: params.id,
      nome_completo: body.nomeCompleto.trim(),
      cargo: body.cargo.trim(),
      telefone: body.telefone?.trim() || null,
      email: body.email.trim(),
    })
    .select("*")
    .single();

  if (error || !contato) {
    return NextResponse.json(
      { erro: "Falha ao salvar o contato: " + (error?.message || "erro desconhecido") },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, contato });
}

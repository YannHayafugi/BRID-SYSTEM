import { NextRequest, NextResponse } from "next/server";
import { ResultadoAnaliseTR } from "@/lib/tr/types";
import { getProfileAtual, getSupabaseRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";

/** D40: rascunho da análise de TR — salvo automaticamente assim que a IA
 * termina, antes de qualquer ciência/comentário/contato ser preenchido, para
 * que fechar e reabrir o modal (mesmo em outro dia) não exija rodar a IA de
 * novo. Vira "concluida" quando o relatório final é gerado (ver /api/tr/report). */

interface RascunhoBody {
  orgaoId: string;
  processoId?: string;
  nomeArquivoTr: string;
  resultado: ResultadoAnaliseTR;
}

/** Busca o rascunho (ou análise já concluída) vinculado a um processo. */
export async function GET(req: NextRequest) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const processoId = req.nextUrl.searchParams.get("processo");
  if (!processoId) {
    return NextResponse.json({ erro: "Informe o processo." }, { status: 400 });
  }

  const supabase = getSupabaseRouteClient();
  const { data: processo } = await supabase
    .from("gp_processos")
    .select("cadastro_tr_id")
    .eq("id", processoId)
    .single();

  if (!processo?.cadastro_tr_id) {
    return NextResponse.json({ ok: true, rascunho: null });
  }

  const { data: cadastro } = await supabase
    .from("gp_cadastros_tr")
    .select("id, status, resultado_bruto_ia, nome_arquivo_tr")
    .eq("id", processo.cadastro_tr_id)
    .single();

  return NextResponse.json({ ok: true, rascunho: cadastro || null });
}

/** Salva (cria ou atualiza) o rascunho com o resultado bruto da IA. */
export async function POST(req: NextRequest) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Partial<RascunhoBody>;
  if (!body.orgaoId || !body.resultado || !body.nomeArquivoTr) {
    return NextResponse.json({ erro: "Dados incompletos para salvar o rascunho." }, { status: 400 });
  }

  const supabase = getSupabaseRouteClient();

  // Se o processo já tem um rascunho (ainda não finalizado), atualiza em vez
  // de criar um registro novo a cada reanálise.
  if (body.processoId) {
    const { data: processo } = await supabase
      .from("gp_processos")
      .select("cadastro_tr_id")
      .eq("id", body.processoId)
      .single();

    if (processo?.cadastro_tr_id) {
      const { data: existente } = await supabase
        .from("gp_cadastros_tr")
        .select("id, status")
        .eq("id", processo.cadastro_tr_id)
        .single();

      if (existente && existente.status === "em_analise") {
        const { error: erroUpdate } = await supabase
          .from("gp_cadastros_tr")
          .update({
            resultado_bruto_ia: body.resultado,
            nome_arquivo_tr: body.nomeArquivoTr,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existente.id);
        if (erroUpdate) {
          return NextResponse.json({ erro: erroUpdate.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true, cadastroId: existente.id });
      }
    }
  }

  const { data: orgao, error: erroOrgao } = await supabase
    .from("gp_orgaos")
    .select("tipo_ente, razao_social, uf")
    .eq("id", body.orgaoId)
    .single();
  if (erroOrgao || !orgao) {
    return NextResponse.json({ erro: "Órgão não encontrado." }, { status: 404 });
  }

  const { data: cadastro, error: erroCadastro } = await supabase
    .from("gp_cadastros_tr")
    .insert({
      criado_por: profile.id,
      orgao_id: body.orgaoId,
      classificacao: orgao.tipo_ente,
      nome_ente: orgao.razao_social,
      uf: orgao.uf,
      // Contato ainda não foi preenchido nesta etapa — só é exigido para
      // gerar o relatório final (ver /api/tr/report).
      nome_responsavel: "",
      cargo: "",
      email: "",
      nome_arquivo_tr: body.nomeArquivoTr,
      resultado_bruto_ia: body.resultado,
    })
    .select("id")
    .single();

  if (erroCadastro || !cadastro) {
    return NextResponse.json(
      { erro: "Falha ao salvar o rascunho: " + (erroCadastro?.message || "erro desconhecido") },
      { status: 500 }
    );
  }

  if (body.processoId) {
    await supabase
      .from("gp_processos")
      .update({ cadastro_tr_id: cadastro.id, updated_at: new Date().toISOString() })
      .eq("id", body.processoId);
  }

  return NextResponse.json({ ok: true, cadastroId: cadastro.id });
}

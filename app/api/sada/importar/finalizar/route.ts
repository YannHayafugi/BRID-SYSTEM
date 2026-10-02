import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Fecha o lote: grava contagem e faixa de anos, PASSA A VIGÊNCIA para ele,
 * aposenta os lotes que cobrem os mesmos anos e atualiza as materialized views.
 *
 * A troca da vigência é aqui, e não na abertura, porque só agora existe um
 * retrato completo para pôr no lugar do anterior. Enquanto a carga rodava, o
 * dashboard seguiu mostrando o lote antigo, inteiro.
 *
 * Se algo falhou no meio, o cliente chama com cancelar=true: o lote é removido
 * (o cascade limpa as linhas já inseridas) e o anterior continua vigente,
 * porque nunca foi aposentado.
 */
export async function POST(req: NextRequest) {
  const profile = await getProfileAtual();
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Sem acesso ao SADA." }, { status: 403 });
  }

  const { importacaoId, total, anoInicio, anoFim, cancelar } = (await req.json()) || {};
  if (!importacaoId) return NextResponse.json({ erro: "importacaoId ausente." }, { status: 400 });

  const sb = getSupabaseAdmin();

  if (cancelar) {
    await sb.from("sada_importacoes").delete().eq("id", importacaoId);
    return NextResponse.json({ ok: true, cancelado: true });
  }

  // O ente e o tipo saem do próprio lote: o cliente não precisa reenviá-los, e
  // assim não há como aposentar o lote de outro ente por engano.
  const { data: lote, error: erroLote } = await sb
    .from("sada_importacoes")
    .select("cnpj_orgao, tipo")
    .eq("id", importacaoId)
    .maybeSingle();
  if (erroLote) return NextResponse.json({ erro: erroLote.message }, { status: 500 });
  if (!lote) return NextResponse.json({ erro: "Lote não encontrado." }, { status: 404 });

  const ini = Number.isInteger(anoInicio) ? Number(anoInicio) : null;
  const fim = Number.isInteger(anoFim) ? Number(anoFim) : null;

  const upd = await sb
    .from("sada_importacoes")
    .update({ linhas_importadas: total ?? 0, ano_inicio: ini, ano_fim: fim, vigente: true })
    .eq("id", importacaoId);
  if (upd.error) return NextResponse.json({ erro: upd.error.message }, { status: 500 });

  // Só agora os anteriores saem de cena — e só os que cobrem os mesmos anos.
  // Importar 2026 não pode derrubar o lote que contém 2015–2025. Lote sem
  // faixa gravada entra também: sem saber o que cobre, mantê-lo vigente
  // arriscaria dobrar os números no dashboard.
  let aposentar = sb
    .from("sada_importacoes")
    .update({ vigente: false })
    .eq("cnpj_orgao", lote.cnpj_orgao)
    .eq("tipo", lote.tipo)
    .neq("id", importacaoId);
  if (ini !== null && fim !== null) {
    aposentar = aposentar.or(
      `and(ano_inicio.lte.${fim},ano_fim.gte.${ini}),ano_inicio.is.null,ano_fim.is.null`,
    );
  }
  const apo = await aposentar;
  if (apo.error) return NextResponse.json({ erro: apo.error.message }, { status: 500 });

  const rf = await sb.rpc("sada_refresh_mvs");
  if (rf.error) return NextResponse.json({ ok: true, avisoRefresh: rf.error.message });

  return NextResponse.json({ ok: true });
}

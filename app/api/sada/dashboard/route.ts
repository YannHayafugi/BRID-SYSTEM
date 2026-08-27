import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { cnpjsDoFiltro } from "@/lib/sada/clientes";

export const runtime = "nodejs";

/**
 * Dados agregados do dashboard do SADA (Sistema de Análise de Dívida Ativa).
 * As tabelas sada_* têm RLS sem políticas, então a leitura usa o cliente admin
 * (service role) e a permissão é validada aqui, por sessão — padrão do app.
 * Sem `?cliente=`, agrega todos os entes vigentes. Com cliente, soma só os
 * CNPJs vinculados a ele em sada_ente_cnpj — a prefeitura costuma operar sob
 * vários (prefeitura, autarquias, fundos), e cada um é um cnpj_orgao distinto.
 */
export async function GET(req: NextRequest) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }
  // Acesso ao SADA: superadmin ou usuário liberado (pode_ver_sada).
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Você não tem acesso ao módulo SADA." }, { status: 403 });
  }

  let cnpjs: string[] | null;
  try {
    cnpjs = await cnpjsDoFiltro(new URL(req.url).searchParams.get("cliente"));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }

  const sb = getSupabaseAdmin();
  const num = (v: unknown) => Number(v ?? 0);

  // Recorte por cliente, aplicado consulta a consulta. Um helper genérico
  // seria mais curto, mas estoura a inferência de tipos do supabase-js
  // (TS2589, "type instantiation is excessively deep").
  //
  // Cliente sem CNPJ vinculado dá lista vazia, e o `.in` então não casa nada —
  // que é o certo: melhor dashboard zerado do que a base inteira exibida como
  // se fosse daquele cliente.
  const entes = cnpjs;
  const qRecuperacao = sb.from("sada_vw_recuperacao_da")
    .select("sigla, estoque_atual, arrecadado_da, pct_recuperacao, arrecadado_caixa");
  const qEstoque = sb.from("sada_vw_estoque_ano").select("ano, principal");
  const qArrec = sb.from("sada_vw_arrecadacao_ano").select("origem, ano_arrec, valor");
  const qRanking = sb.from("sada_vw_ranking_tributos").select("sigla, estoque_total, arrecadado_da");
  const qDevedores = sb.from("sada_vw_top_devedores").select("cnpj_cpf, divida_total, qtd_titulos");

  const [recuperacao, estoqueAno, arrecAno, ranking, devedores, pendentes] = await Promise.all([
    // Base PRINCIPAL nos dois lados. O campo `total` (com encargos) só existe
    // em parte das safras — somá-lo descartava silenciosamente o resto.
    // `arrecadado_caixa` é o valor efetivamente recebido, com encargos.
    entes ? qRecuperacao.in("cnpj_orgao", entes) : qRecuperacao,
    entes ? qEstoque.in("cnpj_orgao", entes) : qEstoque,
    entes ? qArrec.in("cnpj_orgao", entes) : qArrec,
    entes ? qRanking.in("cnpj_orgao", entes) : qRanking,
    (entes ? qDevedores.in("cnpj_orgao", entes) : qDevedores)
      .order("divida_total", { ascending: false }).limit(10),
    // Fila de vínculo: nunca filtrada por cliente — são justamente os CNPJs
    // que ainda não pertencem a nenhum.
    sb.from("sada_entes_pendentes").select("cnpj_orgao"),
  ]);

  const err = [recuperacao, estoqueAno, arrecAno, ranking, devedores, pendentes].find((r) => r.error);
  if (err?.error) {
    return NextResponse.json({ erro: err.error.message }, { status: 500 });
  }

  // Estoque por ano (soma dos tributos), em principal
  const estoquePorAnoMap = new Map<number, number>();
  for (const r of estoqueAno.data ?? []) {
    estoquePorAnoMap.set(num(r.ano), (estoquePorAnoMap.get(num(r.ano)) ?? 0) + num(r.principal));
  }
  const estoquePorAno = Array.from(estoquePorAnoMap, ([ano, total]) => ({ ano, total }))
    .sort((a, b) => a.ano - b.ano);

  // Arrecadação por ano, separando normal x dívida ativa
  const arrecMap = new Map<number, { normal: number; da: number }>();
  for (const r of arrecAno.data ?? []) {
    const ano = num(r.ano_arrec);
    const cur = arrecMap.get(ano) ?? { normal: 0, da: 0 };
    if (r.origem === "divida_ativa") cur.da += num(r.valor);
    else cur.normal += num(r.valor);
    arrecMap.set(ano, cur);
  }
  const arrecadacaoPorAno = Array.from(arrecMap, ([ano, v]) => ({ ano, ...v }))
    .sort((a, b) => a.ano - b.ano);

  // Recuperação por tributo (ordenada pelo tamanho da carteira)
  const recuperacaoPorTributo = (recuperacao.data ?? [])
    .map((r) => ({
      sigla: r.sigla as string,
      estoque: num(r.estoque_atual),
      arrecadado: num(r.arrecadado_da),
      caixa: num(r.arrecadado_caixa),
      pct: num(r.pct_recuperacao),
    }))
    .sort((a, b) => b.estoque + b.arrecadado - (a.estoque + a.arrecadado));

  const rankingTributos = (ranking.data ?? [])
    .map((r) => ({ sigla: r.sigla as string, estoque: num(r.estoque_total) }))
    .sort((a, b) => b.estoque - a.estoque);

  const topDevedores = (devedores.data ?? []).map((r) => ({
    cnpj_cpf: r.cnpj_cpf as string,
    divida: num(r.divida_total),
    titulos: num(r.qtd_titulos),
  }));

  // KPIs globais. A taxa compara principal com principal; o valor exibido como
  // "recuperado" é o caixa (com encargos), que é o que de fato entrou.
  const estoqueTotal = recuperacaoPorTributo.reduce((s, r) => s + r.estoque, 0);
  const arrecadadoPrincipal = recuperacaoPorTributo.reduce((s, r) => s + r.arrecadado, 0);
  const arrecadadoTotal = recuperacaoPorTributo.reduce((s, r) => s + r.caixa, 0);
  const recuperacaoGlobal = estoqueTotal + arrecadadoPrincipal > 0
    ? Math.round((10000 * arrecadadoPrincipal) / (arrecadadoPrincipal + estoqueTotal)) / 100
    : 0;

  return NextResponse.json({
    kpis: {
      estoqueTotal,
      arrecadadoTotal,
      recuperacaoGlobal,
      anos: estoquePorAno.length ? { de: estoquePorAno[0].ano, ate: estoquePorAno.at(-1)!.ano } : null,
      entesPendentes: (pendentes.data ?? []).length,
    },
    estoquePorAno,
    arrecadacaoPorAno,
    recuperacaoPorTributo,
    rankingTributos,
    topDevedores,
  });
}

import { NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Dados agregados do dashboard do SADA (Sistema de Análise de Dívida Ativa).
 * As tabelas sada_* têm RLS sem políticas, então a leitura usa o cliente admin
 * (service role) e a permissão é validada aqui, por sessão — padrão do app.
 * Agrega todos os entes vigentes (o filtro por CNPJ entra numa próxima fase).
 */
export async function GET() {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }
  // Acesso ao SADA: superadmin ou usuário liberado (pode_ver_sada).
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Você não tem acesso ao módulo SADA." }, { status: 403 });
  }

  const sb = getSupabaseAdmin();
  const num = (v: unknown) => Number(v ?? 0);

  const [recuperacao, estoqueAno, arrecAno, ranking, devedores, pendentes] = await Promise.all([
    // Base PRINCIPAL nos dois lados. O campo `total` (com encargos) só existe
    // em parte das safras — somá-lo descartava silenciosamente o resto.
    // `arrecadado_caixa` é o valor efetivamente recebido, com encargos.
    sb.from("sada_vw_recuperacao_da")
      .select("sigla, estoque_atual, arrecadado_da, pct_recuperacao, arrecadado_caixa"),
    sb.from("sada_vw_estoque_ano").select("ano, principal"),
    sb.from("sada_vw_arrecadacao_ano").select("origem, ano_arrec, valor"),
    sb.from("sada_vw_ranking_tributos").select("sigla, estoque_total, arrecadado_da"),
    sb.from("sada_vw_top_devedores").select("cnpj_cpf, divida_total, qtd_titulos")
      .order("divida_total", { ascending: false }).limit(10),
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

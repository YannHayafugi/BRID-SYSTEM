import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { TIPOS_SADA } from "@/lib/sada/import";
import { somenteDigitos } from "@/lib/mascaras";

export const runtime = "nodejs";

/** Início da importação: cria o lote vigente e aposenta os anteriores do mesmo
 * ente+tipo QUE COBREM OS MESMOS ANOS (retrato + histórico).
 *
 * Antes a invalidação era por ente+tipo, sem olhar o ano — o que contrariava o
 * documentado no schema e, numa importação parcial (o modo "abas escolhidas"
 * permite mandar só 2025), aposentava o lote que continha 2015–2024. As linhas
 * seguiam na tabela, mas sumiam de todo dashboard: as materialized views fazem
 * `join sada_importacoes ... and i.vigente`. */
export async function POST(req: NextRequest) {
  const profile = await getProfileAtual();
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Sem acesso ao SADA." }, { status: 403 });
  }

  const { cnpj: cnpjBruto, tipo, arquivoNome, anos } = (await req.json()) || {};
  const cnpj = somenteDigitos(cnpjBruto ?? "");
  if (!cnpj || !TIPOS_SADA.includes(tipo)) {
    return NextResponse.json({ erro: "Informe CNPJ e um tipo válido." }, { status: 400 });
  }

  // Anos cobertos por esta importação. O cliente já conhece a lista antes de
  // enviar as linhas (leu as abas). Ausente = comportamento antigo.
  const anosValidos: number[] = Array.isArray(anos)
    ? anos.filter((a: unknown) => Number.isInteger(a)).map(Number)
    : [];
  const anoMin = anosValidos.length ? Math.min(...anosValidos) : null;
  const anoMax = anosValidos.length ? Math.max(...anosValidos) : null;

  const sb = getSupabaseAdmin();
  const ins = await sb
    .from("sada_importacoes")
    .insert({ cnpj_orgao: cnpj, tipo, arquivo_nome: arquivoNome ?? null, vigente: true })
    .select("id")
    .single();
  if (ins.error) return NextResponse.json({ erro: ins.error.message }, { status: 500 });

  let aposentar = sb
    .from("sada_importacoes")
    .update({ vigente: false })
    .eq("cnpj_orgao", cnpj).eq("tipo", tipo).neq("id", ins.data.id);

  if (anoMin !== null && anoMax !== null) {
    // Só os lotes cuja faixa cruza a desta importação. Lote sem faixa gravada
    // (importação antiga ou interrompida) entra também: sem saber o que ele
    // cobre, mantê-lo vigente arriscaria dobrar os números no dashboard.
    aposentar = aposentar.or(
      `and(ano_inicio.lte.${anoMax},ano_fim.gte.${anoMin}),ano_inicio.is.null,ano_fim.is.null`,
    );
  }

  const upd = await aposentar;
  if (upd.error) return NextResponse.json({ erro: upd.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, importacaoId: ins.data.id });
}

import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { TIPOS_SADA } from "@/lib/sada/import";
import { somenteDigitos } from "@/lib/mascaras";

export const runtime = "nodejs";

/**
 * Início da importação: abre o lote. Ele nasce NÃO VIGENTE.
 *
 * A troca da vigência (e a aposentadoria dos lotes que cobrem os mesmos anos)
 * acontece só em /finalizar, quando todas as linhas já entraram — a mesma
 * regra que o caminho do servidor usa em lib/sada/ingestao.ts.
 *
 * Antes era aqui: o lote nascia vigente e os anteriores eram aposentados
 * ANTES da primeira linha ser inserida. Duas consequências, as duas ruins:
 * durante os minutos da carga o ente aparecia com dados parciais, e se a
 * importação falhasse no meio o lote novo era apagado sem ninguém reativar o
 * antigo — o ente ficava sem dashboard até alguém importar de novo.
 */
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

  // Anos cobertos por esta importação. O cliente já os conhece antes de enviar
  // as linhas (leu as abas), e gravá-los aqui deixa o lote identificável
  // mesmo se a carga for interrompida — é o que permite limpar sobras depois.
  const anosValidos: number[] = Array.isArray(anos)
    ? anos.filter((a: unknown) => Number.isInteger(a)).map(Number)
    : [];
  const anoMin = anosValidos.length ? Math.min(...anosValidos) : null;
  const anoMax = anosValidos.length ? Math.max(...anosValidos) : null;

  const sb = getSupabaseAdmin();
  const ins = await sb
    .from("sada_importacoes")
    .insert({
      cnpj_orgao: cnpj,
      tipo,
      arquivo_nome: arquivoNome ?? null,
      ano_inicio: anoMin,
      ano_fim: anoMax,
      vigente: false,
    })
    .select("id")
    .single();
  if (ins.error) return NextResponse.json({ erro: ins.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, importacaoId: ins.data.id });
}

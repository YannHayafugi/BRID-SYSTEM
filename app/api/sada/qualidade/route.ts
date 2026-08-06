import { NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Verificações de qualidade da base SADA (view sada_vw_qualidade). */
export async function GET() {
  const profile = await getProfileAtual();
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Sem acesso ao SADA." }, { status: 403 });
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("sada_vw_qualidade")
    .select("categoria, tabela, problema, qtd, base");
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const checks = (data ?? [])
    .map((c) => {
      const qtd = Number(c.qtd ?? 0);
      const base = Number(c.base ?? 0);
      return {
        categoria: c.categoria as string,
        tabela: c.tabela as string,
        problema: c.problema as string,
        qtd,
        base,
        pct: base > 0 ? Math.round((10000 * qtd) / base) / 100 : 0,
      };
    })
    .sort((a, b) => b.qtd - a.qtd);

  const comProblema = checks.filter((c) => c.qtd > 0).length;
  const totalOcorrencias = checks.reduce((s, c) => s + c.qtd, 0);

  return NextResponse.json({ checks, resumo: { comProblema, totalOcorrencias } });
}

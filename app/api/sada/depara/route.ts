import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { TIPOS_SADA, TipoSada } from "@/lib/sada/import";
import { AbaEscolhida, Mapa, MAPA_PADRAO, validarMapa } from "@/lib/sada/depara";

export const runtime = "nodejs";

/**
 * DE/PARA de colunas por ente + tipo de planilha.
 *
 * Leitura liberada a quem já usa o SADA (a tela de importação precisa carregar
 * o mapa). Escrita é só de superadmin: um mapa errado traduz a planilha inteira
 * para as colunas erradas e o estrago passa despercebido, porque os dados
 * entram sem erro de banco.
 */

function semAcesso(profile: { is_superadmin?: boolean; pode_ver_sada?: boolean } | null) {
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Sem acesso ao SADA." }, { status: 403 });
  }
  return null;
}

/** GET /api/sada/depara?cnpj=...&tipo=...
 *  `padrao: true` significa que não há cadastro e o importador vai usar o
 *  layout posicional histórico — a tela mostra isso explicitamente. */
export async function GET(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;

  const { searchParams } = new URL(req.url);
  const cnpj = (searchParams.get("cnpj") ?? "").trim();
  const tipo = searchParams.get("tipo") ?? "";
  if (!cnpj || !TIPOS_SADA.includes(tipo as TipoSada)) {
    return NextResponse.json({ erro: "Informe cnpj e um tipo válido." }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("sada_depara")
    .select("cnpj_orgao, tipo, abas_modo, abas, mapa, observacao, updated_at")
    .eq("cnpj_orgao", cnpj)
    .eq("tipo", tipo)
    .maybeSingle();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  if (!data) {
    return NextResponse.json({
      padrao: true,
      depara: {
        cnpj_orgao: cnpj,
        tipo,
        abas_modo: "ano_no_nome",
        abas: null,
        mapa: MAPA_PADRAO[tipo as TipoSada],
        observacao: null,
      },
    });
  }
  return NextResponse.json({ padrao: false, depara: data });
}

/** PUT /api/sada/depara — cria ou substitui o mapa do ente+tipo. */
export async function PUT(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;
  if (!profile!.is_superadmin) {
    return NextResponse.json(
      { erro: "Só superadmin pode alterar o DE/PARA." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    cnpj?: string;
    tipo?: string;
    mapa?: Mapa;
    abasModo?: string;
    abas?: AbaEscolhida[] | null;
    observacao?: string | null;
  } | null;

  const cnpj = (body?.cnpj ?? "").trim();
  const tipo = body?.tipo ?? "";
  const mapa = body?.mapa;
  const abasModo = body?.abasModo ?? "ano_no_nome";

  if (!cnpj || !TIPOS_SADA.includes(tipo as TipoSada)) {
    return NextResponse.json({ erro: "Informe cnpj e um tipo válido." }, { status: 400 });
  }
  if (!mapa || typeof mapa !== "object" || Array.isArray(mapa)) {
    return NextResponse.json({ erro: "Mapa inválido." }, { status: 400 });
  }
  if (abasModo !== "ano_no_nome" && abasModo !== "abas_escolhidas") {
    return NextResponse.json({ erro: "Modo de abas inválido." }, { status: 400 });
  }

  // Revalida no servidor: a tela já valida, mas o PUT é uma superfície pública.
  const v = validarMapa(tipo as TipoSada, mapa);
  if (!v.ok) {
    return NextResponse.json({ erro: v.erros.join(" ") }, { status: 400 });
  }

  let abas: AbaEscolhida[] | null = null;
  if (abasModo === "abas_escolhidas") {
    const lista = Array.isArray(body?.abas) ? body!.abas! : [];
    if (lista.length === 0) {
      return NextResponse.json(
        { erro: "Escolha ao menos uma aba e informe o ano de cada uma." },
        { status: 400 },
      );
    }
    for (const a of lista) {
      if (!a?.nome || !Number.isInteger(a?.ano) || a.ano < 1900 || a.ano > 2200) {
        return NextResponse.json(
          { erro: `Aba "${a?.nome ?? "?"}" está sem ano válido.` },
          { status: 400 },
        );
      }
    }
    abas = lista.map((a) => ({ nome: String(a.nome), ano: a.ano }));
  }

  const sb = getSupabaseAdmin();
  const { error } = await sb.from("sada_depara").upsert(
    {
      cnpj_orgao: cnpj,
      tipo,
      abas_modo: abasModo,
      abas,
      mapa,
      observacao: body?.observacao ?? null,
      criado_por: profile!.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cnpj_orgao,tipo" },
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, avisos: v.avisos });
}

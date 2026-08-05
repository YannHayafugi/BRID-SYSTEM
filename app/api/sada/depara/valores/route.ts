import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { CampoValor, chaveValor } from "@/lib/sada/depara";

export const runtime = "nodejs";

/**
 * DE/PARA de VALORES — normaliza o vocabulário do ente (sigla do tributo,
 * fase) para um valor canônico.
 *
 * O escopo é o ente inteiro, sem `tipo`: a sigla precisa casar entre dívida
 * ativa, lançamentos e recebimentos, senão o ranking por tributo e a taxa de
 * recuperação passam a contar o mesmo tributo como se fossem dois.
 *
 * `valor_origem` é gravado normalizado (chaveValor: sem acento, maiúsculo,
 * espaços colapsados) para que "iptu", "IPTU " e "Iptu" não virem três linhas.
 */

const CAMPOS: CampoValor[] = ["sigla", "fase"];

function semAcesso(profile: { is_superadmin?: boolean; pode_ver_sada?: boolean } | null) {
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Sem acesso ao SADA." }, { status: 403 });
  }
  return null;
}

/** GET /api/sada/depara/valores?cnpj=...[&campo=sigla] */
export async function GET(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;

  const { searchParams } = new URL(req.url);
  const cnpj = (searchParams.get("cnpj") ?? "").trim();
  const campo = searchParams.get("campo");
  if (!cnpj) return NextResponse.json({ erro: "Informe o cnpj." }, { status: 400 });
  if (campo && !CAMPOS.includes(campo as CampoValor)) {
    return NextResponse.json({ erro: "Campo inválido." }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  let q = sb
    .from("sada_depara_valor")
    .select("campo, valor_origem, valor_canonico")
    .eq("cnpj_orgao", cnpj);
  if (campo) q = q.eq("campo", campo);

  const { data, error } = await q.order("campo").order("valor_origem");
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({ pares: data ?? [] });
}

/**
 * PUT /api/sada/depara/valores — substitui TODOS os pares do ente para um
 * campo. Substituição total (e não upsert linha a linha) porque a tela edita
 * a lista inteira: assim remover uma linha na tela remove de fato no banco.
 */
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
    campo?: string;
    pares?: { valor_origem?: string; valor_canonico?: string }[];
  } | null;

  const cnpj = (body?.cnpj ?? "").trim();
  const campo = body?.campo ?? "";
  if (!cnpj) return NextResponse.json({ erro: "Informe o cnpj." }, { status: 400 });
  if (!CAMPOS.includes(campo as CampoValor)) {
    return NextResponse.json({ erro: "Campo inválido." }, { status: 400 });
  }

  const entrada = Array.isArray(body?.pares) ? body!.pares! : [];
  const porOrigem = new Map<string, string>();
  for (const p of entrada) {
    const origem = chaveValor(p?.valor_origem);
    const canonico = String(p?.valor_canonico ?? "").trim();
    // Linha em branco é descarte silencioso: a tela deixa campos vazios
    // enquanto o usuário digita. Par que não traduz nada também não vale linha.
    if (!origem || !canonico) continue;
    if (origem === chaveValor(canonico)) continue;
    porOrigem.set(origem, canonico);
  }

  const sb = getSupabaseAdmin();
  const del = await sb
    .from("sada_depara_valor")
    .delete()
    .eq("cnpj_orgao", cnpj)
    .eq("campo", campo);
  if (del.error) return NextResponse.json({ erro: del.error.message }, { status: 500 });

  if (porOrigem.size > 0) {
    const registros = Array.from(porOrigem, ([valor_origem, valor_canonico]) => ({
      cnpj_orgao: cnpj,
      campo,
      valor_origem,
      valor_canonico,
    }));
    const ins = await sb.from("sada_depara_valor").insert(registros);
    if (ins.error) return NextResponse.json({ erro: ins.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, gravados: porOrigem.size });
}

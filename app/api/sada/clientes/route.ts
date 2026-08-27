import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { somenteDigitos } from "@/lib/mascaras";

export const runtime = "nodejs";

/**
 * Clientes do SADA e seus CNPJs.
 *
 * Leitura liberada a quem usa o SADA (o dashboard precisa montar o seletor).
 * Escrita é só de superadmin: vincular o CNPJ ao cliente errado faz a dívida
 * de um município aparecer somada na de outro.
 */

function semAcesso(profile: { is_superadmin?: boolean; pode_ver_sada?: boolean } | null) {
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Sem acesso ao SADA." }, { status: 403 });
  }
  return null;
}

/** GET /api/sada/clientes — clientes com seus CNPJs + a fila de pendentes. */
export async function GET() {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;

  const sb = getSupabaseAdmin();
  const [vinculos, orgaos, pendentes] = await Promise.all([
    sb.from("sada_ente_cnpj").select("id, orgao_id, cnpj_orgao, apelido"),
    sb.from("gp_orgaos").select("id, razao_social, cidade, uf").order("razao_social"),
    sb.from("sada_entes_pendentes").select("cnpj_orgao, qtd_lotes, primeira_importacao"),
  ]);

  const err = [vinculos, orgaos, pendentes].find((r) => r.error);
  if (err?.error) return NextResponse.json({ erro: err.error.message }, { status: 500 });

  // Junta em memória em vez de usar embed do PostgREST: são duas tabelas
  // pequenas e o join explícito não depende do relacionamento estar exposto.
  const porOrgao = new Map<string, { id: number; cnpj: string; apelido: string | null }[]>();
  for (const v of vinculos.data ?? []) {
    const lista = porOrgao.get(String(v.orgao_id)) ?? [];
    lista.push({ id: Number(v.id), cnpj: String(v.cnpj_orgao), apelido: (v.apelido as string) ?? null });
    porOrgao.set(String(v.orgao_id), lista);
  }

  const clientes = (orgaos.data ?? [])
    .map((o) => ({
      id: String(o.id),
      razaoSocial: String(o.razao_social),
      cidade: String(o.cidade ?? ""),
      uf: String(o.uf ?? ""),
      cnpjs: porOrgao.get(String(o.id)) ?? [],
    }))
    // Só interessam no seletor os que têm dado no SADA.
    .filter((c) => c.cnpjs.length > 0);

  const fila = (pendentes.data ?? []).map((p) => ({
    cnpj: String(p.cnpj_orgao),
    qtdLotes: Number(p.qtd_lotes ?? 0),
    primeiraImportacao: p.primeira_importacao as string | null,
  }));

  return NextResponse.json({ clientes, pendentes: fila });
}

/** POST /api/sada/clientes — vincula um CNPJ a um cliente. */
export async function POST(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;
  if (!profile!.is_superadmin) {
    return NextResponse.json({ erro: "Só superadmin pode vincular CNPJ a cliente." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    { orgaoId?: string; cnpj?: string; apelido?: string | null } | null;

  const orgaoId = (body?.orgaoId ?? "").trim();
  const cnpj = somenteDigitos(body?.cnpj ?? "");
  if (!orgaoId || !cnpj) {
    return NextResponse.json({ erro: "Informe o cliente e o CNPJ." }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { error } = await sb.from("sada_ente_cnpj").insert({
    orgao_id: orgaoId,
    cnpj_orgao: cnpj,
    apelido: body?.apelido?.trim() || null,
    created_by: profile!.id,
  });

  if (error) {
    // 23505 = unique violation: o CNPJ já pertence a algum cliente. Trocar de
    // dono é desvincular e vincular de novo, para a mudança ser deliberada.
    const duplicado = (error as { code?: string }).code === "23505";
    return NextResponse.json(
      { erro: duplicado ? "Este CNPJ já está vinculado a um cliente." : error.message },
      { status: duplicado ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/sada/clientes?id=... — desfaz um vínculo. */
export async function DELETE(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;
  if (!profile!.is_superadmin) {
    return NextResponse.json({ erro: "Só superadmin pode desvincular." }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "Informe o id do vínculo." }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { error } = await sb.from("sada_ente_cnpj").delete().eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

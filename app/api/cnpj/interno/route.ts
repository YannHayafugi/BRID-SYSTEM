import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { somenteDigitos } from "@/lib/mascaras";

export const runtime = "nodejs";

/**
 * GET /api/cnpj/interno?cnpj=...
 *
 * O que o sistema sabe sobre um documento. O mesmo CNPJ pode aparecer nos dois
 * papéis, e a tela mostra ambos:
 *
 *   como ENTE          — cliente vinculado, lotes importados, DE/PARA
 *                        cadastrado, envios do INFO REQUEST LIST, qualidade
 *   como CONTRIBUINTE  — dívida ativa em nome dele, em qualquer ente
 *
 * Aceita CPF também: como contribuinte, pessoa física é a maioria da carteira.
 */
export async function GET(req: NextRequest) {
  const profile = await getProfileAtual();
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Sem acesso ao SADA." }, { status: 403 });
  }

  const doc = somenteDigitos(new URL(req.url).searchParams.get("cnpj") ?? "");
  if (doc.length !== 11 && doc.length !== 14) {
    return NextResponse.json({ erro: "Informe um CPF (11) ou CNPJ (14 dígitos)." }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const [vinculo, orgaos, lotes, mapas, envios, qualidade, devedor] = await Promise.all([
    sb.from("sada_ente_cnpj").select("orgao_id, apelido").eq("cnpj_orgao", doc).maybeSingle(),
    sb.from("gp_orgaos").select("id, razao_social, cnpj, cidade, uf"),
    sb.from("sada_importacoes")
      .select("id, tipo, vigente, arquivo_nome, linhas_importadas, ano_inicio, ano_fim, created_at")
      .eq("cnpj_orgao", doc).order("created_at", { ascending: false }).limit(50),
    sb.from("sada_depara").select("tipo, nome, abas_modo, updated_at").eq("cnpj_orgao", doc),
    sb.from("sada_envio")
      .select("id, arquivo_nome, enviado_em, indice_completude")
      .eq("cnpj_orgao", doc).order("enviado_em", { ascending: false }).limit(10),
    sb.from("sada_vw_qualidade")
      .select("codigo, categoria, tabela, problema, qtd, base").eq("cnpj_orgao", doc),
    sb.from("sada_vw_top_devedores")
      .select("cnpj_orgao, divida_total, qtd_titulos").eq("cnpj_cpf", doc),
  ]);

  const err = [vinculo, orgaos, lotes, mapas, envios, qualidade, devedor].find((r) => r.error);
  if (err?.error) return NextResponse.json({ erro: err.error.message }, { status: 500 });

  const digitos = (v: unknown) => somenteDigitos(String(v ?? ""));
  const listaOrgaos = orgaos.data ?? [];

  // Cliente pelo vínculo explícito; se não houver, tenta casar pelo CNPJ do
  // próprio cadastro. O vínculo tem precedência: uma autarquia nunca casaria
  // pelo CNPJ do município, e é justamente para isso que sada_ente_cnpj existe.
  const porVinculo = vinculo.data
    ? listaOrgaos.find((o) => String(o.id) === String(vinculo.data!.orgao_id))
    : null;
  const porCnpj = listaOrgaos.find((o) => digitos(o.cnpj) === doc);
  const cliente = porVinculo ?? porCnpj ?? null;

  const checks = (qualidade.data ?? []).map((c) => ({
    codigo: c.codigo as string,
    categoria: c.categoria as string,
    problema: c.problema as string,
    qtd: Number(c.qtd ?? 0),
    base: Number(c.base ?? 0),
  }));

  // Nome do ente em cada linha de dívida: o documento pode dever a mais de um.
  const nomePorCnpj = new Map(listaOrgaos.map((o) => [digitos(o.cnpj), String(o.razao_social)]));

  return NextResponse.json({
    documento: doc,
    tipoDocumento: doc.length === 14 ? "CNPJ" : "CPF",
    comoEnte: {
      cliente: cliente
        ? { id: String(cliente.id), razaoSocial: String(cliente.razao_social),
            cidade: String(cliente.cidade ?? ""), uf: String(cliente.uf ?? "") }
        : null,
      vinculoExplicito: !!vinculo.data,
      apelido: (vinculo.data?.apelido as string) ?? null,
      lotes: lotes.data ?? [],
      mapas: mapas.data ?? [],
      envios: envios.data ?? [],
      qualidade: {
        comProblema: checks.filter((c) => c.qtd > 0).length,
        totalOcorrencias: checks.reduce((s, c) => s + c.qtd, 0),
        checks: checks.filter((c) => c.qtd > 0).sort((a, b) => b.qtd - a.qtd).slice(0, 10),
      },
    },
    comoContribuinte: (devedor.data ?? []).map((d) => ({
      cnpjOrgao: String(d.cnpj_orgao),
      ente: nomePorCnpj.get(String(d.cnpj_orgao)) ?? null,
      dividaTotal: Number(d.divida_total ?? 0),
      qtdTitulos: Number(d.qtd_titulos ?? 0),
    })),
  });
}

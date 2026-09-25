import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { TIPOS_SADA, TipoSada } from "@/lib/sada/import";
import {
  AbaEscolhida,
  AbasModo,
  camposDoTipo,
  Mapa,
  MAPA_PADRAO,
  podeDispensar,
  validarMapa,
} from "@/lib/sada/depara";
import { somenteDigitos } from "@/lib/mascaras";

export const runtime = "nodejs";

/** Nome do mapa quando o ente tem só um. Mantém compatível o cadastro antigo,
 *  criado quando `sada_depara` era única por (cnpj_orgao, tipo).
 *  Não exportado: route.ts do Next.js só aceita exportar os handlers e a config. */
const NOME_PADRAO = "Padrão";

const MODOS: AbasModo[] = ["ano_no_nome", "abas_escolhidas", "ano_na_coluna"];

/**
 * DE/PARA de colunas por ente + tipo de planilha.
 *
 * Leitura liberada a quem já usa o SADA (a tela de importação precisa carregar
 * o mapa). Escrita do MAPA é só de superadmin: um mapa errado traduz a planilha
 * inteira para as colunas erradas e o estrago passa despercebido, porque os
 * dados entram sem erro de banco.
 *
 * A dispensa de campo obrigatório (PATCH) é o único ponto aberto também a
 * admin: ela não muda para onde os dados vão, só admite que aquele ente não
 * manda determinada coluna.
 */

function semAcesso(profile: { is_superadmin?: boolean; pode_ver_sada?: boolean } | null) {
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Sem acesso ao SADA." }, { status: 403 });
  }
  return null;
}

const COLUNAS =
  "cnpj_orgao, tipo, nome, abas_modo, abas, mapa, campos_opcionais, observacao, updated_at, criado_por";

/** GET /api/sada/depara?listar=1 — todos os mapas cadastrados, para a tela de
 *  manutenção. Traz quem salvou e quando, e o nome do ente quando o CNPJ já
 *  está vinculado a um cliente. */
async function listarMapas() {
  const sb = getSupabaseAdmin();
  const { data: mapas, error } = await sb
    .from("sada_depara")
    .select(COLUNAS)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const lista = mapas ?? [];
  // Junções em memória: são três tabelas pequenas, e o join explícito não
  // depende de o relacionamento estar exposto no PostgREST.
  const [vinculos, orgaos, perfis] = await Promise.all([
    sb.from("sada_ente_cnpj").select("cnpj_orgao, orgao_id, apelido"),
    sb.from("gp_orgaos").select("id, razao_social"),
    sb.from("gp_profiles").select("id, nome_completo, email"),
  ]);

  const nomeOrgao = new Map((orgaos.data ?? []).map((o) => [String(o.id), String(o.razao_social)]));
  const porCnpj = new Map<string, string>();
  for (const v of vinculos.data ?? []) {
    const rotulo = (v.apelido as string) || nomeOrgao.get(String(v.orgao_id)) || "";
    if (rotulo) porCnpj.set(String(v.cnpj_orgao), rotulo);
  }
  const porPerfil = new Map(
    (perfis.data ?? []).map((p) => [String(p.id), String(p.nome_completo || p.email || "")]),
  );

  return NextResponse.json({
    mapas: lista.map((d) => ({
      cnpjOrgao: String(d.cnpj_orgao),
      ente: porCnpj.get(String(d.cnpj_orgao)) ?? null,
      tipo: String(d.tipo),
      nome: String(d.nome),
      abasModo: String(d.abas_modo),
      abas: (d.abas as AbaEscolhida[] | null) ?? null,
      camposOpcionais: (d.campos_opcionais as string[] | null) ?? [],
      // Quantos campos de destino o mapa preenche — dá uma ideia do tamanho
      // sem trazer o mapa inteiro para a listagem.
      campos: Object.keys((d.mapa as Mapa) ?? {}).length,
      observacao: (d.observacao as string) ?? null,
      atualizadoEm: String(d.updated_at),
      porQuem: porPerfil.get(String(d.criado_por)) ?? null,
    })),
  });
}

/** GET /api/sada/depara?cnpj=...&tipo=...
 *  `padrao: true` significa que não há cadastro e o importador vai usar o
 *  layout posicional histórico — a tela mostra isso explicitamente. */
export async function GET(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;

  const { searchParams } = new URL(req.url);
  if (searchParams.get("listar")) return listarMapas();

  // Chave canônica: só dígitos. Antes era `.trim()`, e o mesmo ente digitado
  // "12.345.678/0001-90" numa tela e "12345678000190" na outra virava dois
  // cadastros: o importador não achava o mapa, caía no MAPA_PADRAO e traduzia
  // a planilha por posição sem nenhum erro visível.
  const cnpj = somenteDigitos(searchParams.get("cnpj") ?? "");
  const tipo = searchParams.get("tipo") ?? "";
  const nome = (searchParams.get("nome") ?? "").trim();
  if (!cnpj || !TIPOS_SADA.includes(tipo as TipoSada)) {
    return NextResponse.json({ erro: "Informe cnpj e um tipo válido." }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  // Pode haver mais de um mapa por ente+tipo (ex.: o ente trocou de sistema no
  // meio do ano). `nomes` alimenta o seletor da tela de importação.
  const { data: lista, error } = await sb
    .from("sada_depara")
    .select(COLUNAS)
    .eq("cnpj_orgao", cnpj)
    .eq("tipo", tipo)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const nomes = (lista ?? []).map((d) => String(d.nome));
  // Sem `nome` na query devolve o mais recente — o comportamento de quando só
  // podia existir um mapa por ente+tipo.
  const data = nome
    ? (lista ?? []).find((d) => String(d.nome) === nome) ?? null
    : (lista ?? [])[0] ?? null;

  if (!data) {
    return NextResponse.json({
      padrao: true,
      nomes,
      depara: {
        cnpj_orgao: cnpj,
        tipo,
        nome: NOME_PADRAO,
        abas_modo: "ano_no_nome",
        abas: null,
        mapa: MAPA_PADRAO[tipo as TipoSada],
        campos_opcionais: [],
        observacao: null,
      },
    });
  }
  return NextResponse.json({ padrao: false, nomes, depara: data });
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
    nome?: string;
    mapa?: Mapa;
    abasModo?: string;
    abas?: AbaEscolhida[] | null;
    observacao?: string | null;
  } | null;

  const cnpj = somenteDigitos(body?.cnpj ?? "");
  const tipo = body?.tipo ?? "";
  const nome = (body?.nome ?? "").trim() || NOME_PADRAO;
  const mapa = body?.mapa;
  const abasModo = (body?.abasModo ?? "ano_no_nome") as AbasModo;

  if (!cnpj || !TIPOS_SADA.includes(tipo as TipoSada)) {
    return NextResponse.json({ erro: "Informe cnpj e um tipo válido." }, { status: 400 });
  }
  if (!mapa || typeof mapa !== "object" || Array.isArray(mapa)) {
    return NextResponse.json({ erro: "Mapa inválido." }, { status: 400 });
  }
  if (!MODOS.includes(abasModo)) {
    return NextResponse.json({ erro: "Modo de abas inválido." }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  // A dispensa de obrigatoriedade é mexida só pelo PATCH: aqui ela é lida para
  // não ser perdida ao salvar o mapa, e para a validação respeitá-la.
  const { data: atual } = await sb
    .from("sada_depara")
    .select("campos_opcionais")
    .eq("cnpj_orgao", cnpj)
    .eq("tipo", tipo)
    .eq("nome", nome)
    .maybeSingle();
  const opcionais = (atual?.campos_opcionais as string[] | null) ?? [];

  // Revalida no servidor: a tela já valida, mas o PUT é uma superfície pública.
  const v = validarMapa(tipo as TipoSada, mapa, { abasModo, opcionais });
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
  } else if (abasModo === "ano_na_coluna") {
    // Lista opcional: sem ela entram todas as abas do arquivo. O ano não vem
    // daqui, vem da coluna mapeada, então fica zerado.
    const lista = Array.isArray(body?.abas) ? body!.abas! : [];
    abas = lista.length > 0 ? lista.map((a) => ({ nome: String(a.nome), ano: 0 })) : null;
  }

  const { error } = await sb.from("sada_depara").upsert(
    {
      cnpj_orgao: cnpj,
      tipo,
      nome,
      abas_modo: abasModo,
      abas,
      mapa,
      observacao: body?.observacao ?? null,
      criado_por: profile!.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cnpj_orgao,tipo,nome" },
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, avisos: v.avisos, camposOpcionais: opcionais });
}

/**
 * PATCH /api/sada/depara — dispensa (ou volta a exigir) campos obrigatórios
 * de um mapa já cadastrado.
 *
 * Aberto a admin além de superadmin: não muda para onde os dados vão, só
 * admite que aquele ente não manda determinada coluna. Continua sendo por
 * mapa — não existe dispensa global, senão a trava sumiria para todos os
 * clientes de uma vez.
 */
export async function PATCH(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;
  if (!profile!.is_superadmin && profile!.perfil !== "admin") {
    return NextResponse.json(
      { erro: "Só admin ou superadmin pode dispensar campo obrigatório." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    cnpj?: string;
    tipo?: string;
    nome?: string;
    camposOpcionais?: string[];
  } | null;

  const cnpj = somenteDigitos(body?.cnpj ?? "");
  const tipo = body?.tipo ?? "";
  const nome = (body?.nome ?? "").trim() || NOME_PADRAO;
  if (!cnpj || !TIPOS_SADA.includes(tipo as TipoSada)) {
    return NextResponse.json({ erro: "Informe cnpj e um tipo válido." }, { status: 400 });
  }

  const pedidos = Array.isArray(body?.camposOpcionais) ? body!.camposOpcionais! : [];
  // Só campos que existem no tipo, que são de fato obrigatórios e que podem
  // ser dispensados. `ano` fica de fora: sem ele a linha não tem como entrar.
  const obrigatorios = new Map(
    camposDoTipo(tipo as TipoSada, "ano_na_coluna")
      .filter((c) => c.obrigatorio)
      .map((c) => [c.campo, c]),
  );
  for (const campo of pedidos) {
    if (!obrigatorios.has(campo)) {
      return NextResponse.json(
        { erro: `"${campo}" não é um campo obrigatório deste tipo de planilha.` },
        { status: 400 },
      );
    }
    if (!podeDispensar(campo)) {
      return NextResponse.json(
        { erro: `"${obrigatorios.get(campo)!.rotulo}" não pode ser dispensado.` },
        { status: 400 },
      );
    }
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("sada_depara")
    .update({ campos_opcionais: Array.from(new Set(pedidos)), updated_at: new Date().toISOString() })
    .eq("cnpj_orgao", cnpj)
    .eq("tipo", tipo)
    .eq("nome", nome)
    .select("campos_opcionais")
    .maybeSingle();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { erro: "Salve o mapa primeiro: a dispensa fica gravada nele." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, camposOpcionais: data.campos_opcionais ?? [] });
}

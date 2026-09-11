import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { cnpjsDoFiltro, clienteIdValido, SEM_VINCULO } from "@/lib/sada/clientes";
import { VALIDADE_DIAS } from "@/lib/cnpj/receita";

export const runtime = "nodejs";

const LIMITE_PADRAO = 200;
const LIMITE_MAX = 2000;

/**
 * GET /api/sada/cnpj-status?[cliente=][&pendentes=1][&limite=]
 *
 * Os CNPJs que existem na base de dívida ativa, com a situação cadastral que
 * já temos em cache e a data da última consulta.
 *
 * Ordenado por dívida decrescente: numa base grande nunca se consulta tudo, e
 * o maior devedor é quem muda a leitura da carteira. Quem enriquece primeiro
 * o topo já responde a pergunta de negócio com uma fração das consultas.
 */
export async function GET(req: NextRequest) {
  const profile = await getProfileAtual();
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Sem acesso ao SADA." }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const clienteParam = sp.get("cliente");
  if (clienteParam && !clienteIdValido(clienteParam)) {
    return NextResponse.json({ erro: "Cliente inválido." }, { status: 400 });
  }
  const soPendentes = sp.get("pendentes") === "1";
  const limite = Math.min(
    Math.max(Number(sp.get("limite") ?? LIMITE_PADRAO) || LIMITE_PADRAO, 1),
    LIMITE_MAX,
  );

  let cnpjs: string[] | null;
  try {
    cnpjs = await cnpjsDoFiltro(clienteParam);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
  const entes = cnpjs && cnpjs.length === 0 ? [SEM_VINCULO] : cnpjs;

  const sb = getSupabaseAdmin();

  const qCob = sb.from("sada_vw_cnpj_cobertura")
    .select("cnpj_orgao, documentos_pj, documentos_pf, documentos_invalidos, pj_com_status, divida_pj, divida_pf");
  const qLista = sb.from("sada_vw_cnpj_status")
    .select("cnpj_orgao, documento, qtd_titulos, divida_total, razao_social, situacao, situacao_data, consultado_em");

  const [cobertura, lista] = await Promise.all([
    entes ? qCob.in("cnpj_orgao", entes) : qCob,
    (entes ? qLista.in("cnpj_orgao", entes) : qLista)
      .order("divida_total", { ascending: false })
      .limit(limite + 1),
  ]);

  const err = [cobertura, lista].find((r) => r.error);
  if (err?.error) return NextResponse.json({ erro: err.error.message }, { status: 500 });

  const num = (v: unknown) => Number(v ?? 0);
  const cob = (cobertura.data ?? []).reduce(
    (a, c) => ({
      documentosPj: a.documentosPj + num(c.documentos_pj),
      documentosPf: a.documentosPf + num(c.documentos_pf),
      documentosInvalidos: a.documentosInvalidos + num(c.documentos_invalidos),
      pjComStatus: a.pjComStatus + num(c.pj_com_status),
      dividaPj: a.dividaPj + num(c.divida_pj),
      dividaPf: a.dividaPf + num(c.divida_pf),
    }),
    { documentosPj: 0, documentosPf: 0, documentosInvalidos: 0, pjComStatus: 0, dividaPj: 0, dividaPf: 0 },
  );

  const limiteVelho = Date.now() - VALIDADE_DIAS * 86_400_000;
  const linhas = (lista.data ?? []).slice(0, limite).map((l) => {
    const consultadoEm = (l.consultado_em as string) ?? null;
    const vencido = !consultadoEm || new Date(consultadoEm).getTime() < limiteVelho;
    return {
      cnpjOrgao: String(l.cnpj_orgao),
      documento: String(l.documento),
      qtdTitulos: num(l.qtd_titulos),
      dividaTotal: num(l.divida_total),
      razaoSocial: (l.razao_social as string) ?? null,
      situacao: (l.situacao as string) ?? null,
      situacaoData: (l.situacao_data as string) ?? null,
      consultadoEm,
      /** Nunca consultado ou fora da validade — é o que o botão vai buscar. */
      pendente: vencido,
    };
  });

  return NextResponse.json({
    cobertura: cob,
    validadeDias: VALIDADE_DIAS,
    linhas: soPendentes ? linhas.filter((l) => l.pendente) : linhas,
    truncado: (lista.data ?? []).length > limite,
  });
}

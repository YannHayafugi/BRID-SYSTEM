import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual, getSupabaseRouteClient } from "@/lib/supabase/route";
import { ETAPAS_FLUXO } from "@/lib/processos/etapas";

export const runtime = "nodejs";

/** Muda a fase do processo. D43/D48: admin escolhe qualquer fase, sem
 * restrição de tipo (manual/automática) nem de ordem; editor só pode avançar
 * para a próxima fase; visualizador não troca. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }
  if (profile.perfil !== "admin" && profile.perfil !== "editor") {
    return NextResponse.json(
      { erro: "Apenas administradores e editores podem trocar a fase do processo." },
      { status: 403 }
    );
  }

  const { etapa, dataAutenticacao } = (await req.json().catch(() => ({}))) as {
    etapa?: number;
    dataAutenticacao?: string;
  };
  if (typeof etapa !== "number" || etapa < 0 || etapa >= ETAPAS_FLUXO.length) {
    return NextResponse.json({ erro: "Etapa inválida." }, { status: 400 });
  }
  // Data de autenticação: confirma quando essa mudança de fase foi
  // autenticada (assinada/validada) — obrigatória para toda fase manual.
  if (!dataAutenticacao || !/^\d{4}-\d{2}-\d{2}$/.test(dataAutenticacao)) {
    return NextResponse.json({ erro: "Informe a data de autenticação para avançar de fase." }, { status: 400 });
  }
  const hoje = new Date().toISOString().slice(0, 10);
  if (dataAutenticacao > hoje) {
    return NextResponse.json({ erro: "A data de autenticação não pode ser futura." }, { status: 400 });
  }

  const supabase = getSupabaseRouteClient();

  const { data: processoAtual, error: erroBusca } = await supabase
    .from("gp_processos")
    .select("etapa, historico_etapas")
    .eq("id", params.id)
    .single();
  if (erroBusca || !processoAtual) {
    return NextResponse.json({ erro: "Processo não encontrado." }, { status: 404 });
  }
  // D48: editor só avança para a fase seguinte à atual.
  if (profile.perfil === "editor" && etapa !== processoAtual.etapa + 1) {
    return NextResponse.json(
      { erro: "Editores só podem avançar o processo para a próxima fase." },
      { status: 403 }
    );
  }

  const historico = Array.isArray(processoAtual.historico_etapas) ? processoAtual.historico_etapas : [];
  const novoHistorico = [
    ...historico,
    {
      etapa,
      nome: ETAPAS_FLUXO[etapa].nome,
      data_autenticacao: dataAutenticacao,
      alterado_em: new Date().toISOString(),
      alterado_por: profile.id,
    },
  ];

  const { data, error } = await supabase
    .from("gp_processos")
    .update({ etapa, historico_etapas: novoHistorico, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ erro: "Processo não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, etapa, nome: ETAPAS_FLUXO[etapa].nome, dataAutenticacao });
}

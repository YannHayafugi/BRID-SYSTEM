import { NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { cagr, estimarEncargos, tendenciaLogLinear } from "@/lib/sada/previsao";

export const runtime = "nodejs";

/**
 * Base calibrada para a previsão orçamentária da dívida ativa.
 *
 * Devolve os INSUMOS, não a projeção: o cálculo roda no navegador para a tela
 * responder na hora a cada ajuste de parâmetro. Ver docs/SADA-PREVISAO-ORCAMENTARIA.md.
 */

/** Último exercício completo. O ano corrente entra parcial e distorce taxas. */
function ultimoExercicioCompleto(): number {
  return new Date().getFullYear() - 1;
}

export async function GET() {
  const profile = await getProfileAtual();
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Sem acesso ao SADA." }, { status: 403 });
  }

  const sb = getSupabaseAdmin();
  const anoBase = ultimoExercicioCompleto();

  const [safrasR, curvaR, serieR] = await Promise.all([
    sb.from("sada_vw_prev_safras").select("ano, principal, total, titulos, contribuintes"),
    sb.from("sada_vw_prev_curva").select("idade, valor"),
    sb.from("sada_vw_prev_series").select("ano, lancado, arrecadado_da, arrecadado_normal"),
  ]);

  const err = [safrasR, curvaR, serieR].find((r) => r.error);
  if (err?.error) return NextResponse.json({ erro: err.error.message }, { status: 500 });

  const safrasBrutas = (safrasR.data ?? []) as {
    ano: number; principal: number; total: number | null; titulos: number; contribuintes: number;
  }[];
  const curvaBruta = (curvaR.data ?? []) as { idade: number; valor: number }[];
  const serie = (serieR.data ?? []) as {
    ano: number; lancado: number | null; arrecadado_da: number | null; arrecadado_normal: number | null;
  }[];

  // --- encargos: só as safras com `total` preenchido servem de âncora -------
  const comTotal = safrasBrutas
    .filter((s) => s.total != null && s.principal > 0)
    .map((s) => ({ ano: s.ano, principal: Number(s.principal), total: Number(s.total) }))
    .sort((a, b) => a.ano - b.ano);

  const encargos = comTotal.length >= 2
    ? estimarEncargos(comTotal[0], comTotal[comTotal.length - 1])
    : { encargosAA: 0.139, idadeFoto: 1 };

  // --- curva de recuperação por idade --------------------------------------
  const totalCurva = curvaBruta.reduce((s, c) => s + Number(c.valor), 0);
  const curvaW = totalCurva > 0
    ? curvaBruta.sort((a, b) => a.idade - b.idade).map((c) => Number(c.valor) / totalCurva)
    : [];

  // --- taxa de ciclo de vida ------------------------------------------------
  // Só exercícios completos: incluir o ano corrente, parcial, sobrestima.
  const recuperadoAcum = serie
    .filter((s) => s.ano <= anoBase && s.arrecadado_da != null)
    .reduce((acc, s) => acc + Number(s.arrecadado_da), 0);
  const abertoPrincipal = safrasBrutas.reduce((acc, s) => acc + Number(s.principal), 0);
  const abertoComEncargos = safrasBrutas.reduce(
    (acc, s) => acc + Number(s.principal) *
      Math.pow(1 + encargos.encargosAA, encargos.idadeFoto + (anoBase - s.ano)),
    0,
  );
  const ciclo = recuperadoAcum + abertoComEncargos > 0
    ? recuperadoAcum / (recuperadoAcum + abertoComEncargos)
    : 0;

  // --- quebra estrutural ----------------------------------------------------
  // Títulos por contribuinte é o detector: fica estável por anos e salta quando
  // muda a política de inscrição. Sem isso, a quebra vira "tendência".
  const razao = safrasBrutas
    .filter((s) => s.contribuintes > 0)
    .map((s) => ({ ano: s.ano, r: Number(s.titulos) / Number(s.contribuintes) }))
    .sort((a, b) => a.ano - b.ano);

  const anteriores = razao.slice(0, -1);
  const mediaAnterior = anteriores.length
    ? anteriores.reduce((s, x) => s + x.r, 0) / anteriores.length
    : 0;
  const ultima = razao[razao.length - 1];
  const salto = mediaAnterior > 0 && ultima ? ultima.r / mediaAnterior : 1;
  const temQuebra = salto >= 1.5;

  // Com quebra no último exercício, a tendência é ajustada até o anterior e a
  // safra quebrada serve apenas de saldo de abertura.
  const anoInscricaoBase = temQuebra ? anoBase - 1 : anoBase;
  const safraBase = safrasBrutas.find((s) => s.ano === anoInscricaoBase);

  const serieInscricoes = safrasBrutas
    .filter((s) => s.ano <= anoInscricaoBase)
    .map((s) => ({ ano: s.ano, valor: Number(s.principal) }));
  const serieLancado = serie
    .filter((s) => s.ano <= anoInscricaoBase && s.lancado != null)
    .map((s) => ({ ano: s.ano, valor: Number(s.lancado) }));

  const anos = serieInscricoes.length - 1;

  return NextResponse.json({
    base: {
      anoBase,
      safras: safrasBrutas.map((s) => ({ ano: s.ano, principal: Number(s.principal) })),
      encargosAA: encargos.encargosAA,
      idadeFoto: encargos.idadeFoto,
      curvaW,
      ciclo,
      inscricaoBase: safraBase ? Number(safraBase.principal) : 0,
      anoInscricaoBase,
    },
    calibracao: {
      // Duas janelas de propósito: divergência grande entre elas é sinal de
      // que a tendência não é estável, e quem lê precisa ver isso.
      crescimentoInscricoesCagr: anos > 0
        ? cagr(serieInscricoes[0].valor, serieInscricoes[anos].valor, anos)
        : 0,
      crescimentoInscricoesLogLinear: tendenciaLogLinear(serieInscricoes),
      crescimentoLancadoLogLinear: tendenciaLogLinear(serieLancado),
      encargosAA: encargos.encargosAA,
      idadeFoto: encargos.idadeFoto,
      ciclo,
      recuperadoAcum,
      abertoPrincipal,
      abertoComEncargos,
      quebra: {
        detectada: temQuebra,
        ano: ultima?.ano ?? null,
        razaoAtual: ultima?.r ?? null,
        mediaAnterior,
        salto,
      },
    },
    series: {
      inscricoes: safrasBrutas.map((s) => ({ ano: s.ano, valor: Number(s.principal) })),
      lancado: serie.filter((s) => s.lancado != null)
        .map((s) => ({ ano: s.ano, valor: Number(s.lancado) })),
      arrecadadoDa: serie.filter((s) => s.arrecadado_da != null)
        .map((s) => ({ ano: s.ano, valor: Number(s.arrecadado_da) })),
    },
  });
}

import { Achado, ResultadoAnaliseTR } from "./types";

/**
 * Deriva a lista de achados a apresentar em tela a partir do resultado bruto
 * da IA, aplicando as regras de negócio da especificação funcional v1.1
 * (docs/ESPECIFICAÇÃO FUNCIONAL DO SISTEMA - v1.1.docx). Mantida em código
 * determinístico (não na IA) para garantir que a obrigatoriedade de ciência e
 * comentário seja sempre aplicada de forma consistente.
 */
export function gerarAchados(r: ResultadoAnaliseTR): Achado[] {
  const achados: Achado[] = [];

  // Item 1 — Objeto / condições gerais
  if (!r.item1_objeto.alinhado) {
    achados.push({
      id: "item1",
      itemNumero: "1",
      titulo: "Objeto / Condições Gerais de Contratação",
      texto: r.item1_objeto.achados || "Divergência identificada em relação ao escopo esperado.",
      tipo: "atencao",
      comentarioObrigatorio: true,
    });
  }

  // Item 2 — Prazo de vigência (sempre exibido)
  achados.push({
    id: "item2-prazo",
    itemNumero: "2",
    titulo: "Prazo de vigência",
    texto: r.item2_prazo.prazoTexto,
    tipo: "atencao",
    comentarioObrigatorio: false,
  });
  achados.push({
    id: "item2-prorrogacao",
    itemNumero: "2",
    titulo: "Previsão de prorrogação",
    texto: r.item2_prazo.prorrogacaoDetalhe,
    tipo: "atencao",
    comentarioObrigatorio: false,
  });

  // Item 3 — Fundamentação
  const referenciaAusente = r.item3_fundamentacao.referenciaLegal === "ausente";
  const fundamentacaoAdequada = r.item3_fundamentacao.aspectoACondizente && !referenciaAusente;

  if (r.item3_fundamentacao.referenciaLegal === "equivalente") {
    achados.push({
      id: "item3-referencia-legal",
      itemNumero: "3",
      titulo: "Fundamentação — validação da referência legal",
      texto:
        `O TR faz referência ao conteúdo da LC nº 208/2024 e/ou do art. 75, XV, da Lei nº 14.133/2021, ` +
        `mas sem citação literal do número da lei/artigo. Trecho identificado: ${r.item3_fundamentacao.referenciaLegalDetalhe}`,
      tipo: "atencao",
      comentarioObrigatorio: false,
    });
  }

  if (!fundamentacaoAdequada) {
    const motivos: string[] = [];
    if (!r.item3_fundamentacao.aspectoACondizente) {
      motivos.push(r.item3_fundamentacao.aspectoADetalhe);
    }
    if (referenciaAusente) {
      motivos.push(
        "Não foi identificada referência (literal ou equivalente) à LC nº 208/2024 ou ao art. 75, XV, da Lei nº 14.133/2021."
      );
    }
    achados.push({
      id: "item3-geral",
      itemNumero: "3",
      titulo: "Fundamentação e descrição da necessidade de contratação",
      texto: motivos.join(" "),
      tipo: "atencao",
      comentarioObrigatorio: false,
    });
  }

  // Item 4 — Etapas
  for (const etapa of r.item4_etapas) {
    if (etapa.divergencia) {
      achados.push({
        id: `item4-etapa${etapa.etapa}`,
        itemNumero: `4 — Etapa ${etapa.etapa}`,
        titulo: `Etapa ${etapa.etapa} — divergência identificada`,
        texto: etapa.resumo || "Divergência identificada em relação à etapa de referência.",
        tipo: "atencao",
        comentarioObrigatorio: true,
      });
    }
  }

  // Item 5 — Ordem de Serviço (achado-base sempre exibido)
  achados.push({
    id: "item5-base",
    itemNumero: "5",
    titulo: "Ordem de Serviço",
    texto: `Prazo para emissão: ${r.item5_ordemServico.prazoEmissao}. Prazo para início dos trabalhos após recebimento: ${r.item5_ordemServico.prazoInicio}.`,
    tipo: "atencao",
    comentarioObrigatorio: false,
  });
  if (r.item5_ordemServico.exigeNovaOsPorEtapa) {
    achados.push({
      id: "item5-risco",
      itemNumero: "5",
      titulo: "Ordem de Serviço — ponto de risco (nova OS por etapa)",
      texto:
        r.item5_ordemServico.detalheRisco ||
        "O TR condiciona o avanço de etapas à emissão de nova Ordem de Serviço, vinculada à aprovação da etapa anterior pela contratante.",
      tipo: "atencao",
      comentarioObrigatorio: true,
    });
  }

  // Item 6 — Garantia contratual
  if (r.item6_garantia.exigida) {
    achados.push({
      id: "item6",
      itemNumero: "6",
      titulo: "Garantia contratual",
      texto: r.item6_garantia.detalhe || "O TR exige a prestação de garantia contratual.",
      tipo: "atencao",
      comentarioObrigatorio: true,
    });
  }

  // Item 7 — Condições de faturamento e pagamento
  achados.push({
    id: "item7-a",
    itemNumero: "7-a",
    titulo: "Condição para emissão de NF e prazo de pagamento",
    texto: r.item7_pagamento.condicaoNf,
    tipo: "atencao",
    comentarioObrigatorio: false,
  });
  achados.push({
    id: "item7-b",
    itemNumero: "7-b",
    titulo: "Atualização monetária em caso de atraso",
    texto: r.item7_pagamento.atualizacaoMonetaria,
    tipo: "atencao",
    comentarioObrigatorio: false,
  });
  if (r.item7_pagamento.regraBanco.identificado) {
    achados.push({
      id: "item7-c",
      itemNumero: "7-c",
      titulo: "Regras sobre banco para crédito dos pagamentos",
      texto: r.item7_pagamento.regraBanco.detalhe || "Regra identificada sobre conta bancária para pagamento.",
      tipo: "atencao",
      comentarioObrigatorio: false,
    });
  }
  if (r.item7_pagamento.metodologiaMedicao.identificado) {
    achados.push({
      id: "item7-d",
      itemNumero: "7-d",
      titulo: "Metodologia e critério de medição dos serviços",
      texto:
        r.item7_pagamento.metodologiaMedicao.detalhe ||
        "Metodologia de medição identificada no TR.",
      tipo: "atencao",
      comentarioObrigatorio: true,
    });
  }

  // Item 8 — Penalidades e bloqueio de pagamento
  r.item8_penalidades.forEach((penalidade, idx) => {
    achados.push({
      id: `item8-${idx}`,
      itemNumero: "8",
      titulo: `Penalidade / restrição ${idx + 1}`,
      texto: penalidade.descricao,
      tipo: "atencao",
      comentarioObrigatorio: true,
    });
  });

  return achados;
}

/** Itens que, por não terem gerado nenhum achado de atenção, devem ser
 * exibidos como simples registro "sem pontos de atenção" — para dar
 * visibilidade de que o item FOI analisado, mesmo sem divergência. */
export function itensSemAchados(r: ResultadoAnaliseTR, achados: Achado[]): string[] {
  const mensagens: string[] = [];

  if (r.item1_objeto.alinhado) {
    mensagens.push("Item 1 — Objeto condizente com o escopo esperado do serviço.");
  }
  // Só registramos "adequada" aqui quando não há nenhuma pendência de validação
  // do usuário sobre a referência legal (caso "equivalente" já gera um achado
  // de atenção próprio, tratado em gerarAchados).
  if (r.item3_fundamentacao.aspectoACondizente && r.item3_fundamentacao.referenciaLegal === "literal") {
    mensagens.push(
      "Item 3 — Fundamentação adequada; referência legal citada literalmente e validada automaticamente."
    );
  }
  r.item4_etapas
    .filter((e) => !e.divergencia)
    .forEach((e) => mensagens.push(`Item 4 — Etapa ${e.etapa} sem divergências identificadas.`));
  if (!r.item6_garantia.exigida) {
    mensagens.push("Item 6 — Nenhuma exigência de garantia contratual identificada.");
  }
  if (!r.item7_pagamento.regraBanco.identificado) {
    mensagens.push("Item 7-c — Nenhuma regra sobre banco de crédito identificada.");
  }
  if (!r.item7_pagamento.metodologiaMedicao.identificado) {
    mensagens.push("Item 7-d — Nenhuma metodologia de medição identificada.");
  }
  if (r.item8_penalidades.length === 0) {
    mensagens.push("Item 8 — Nenhuma penalidade ou restrição identificada.");
  }

  return mensagens;
}

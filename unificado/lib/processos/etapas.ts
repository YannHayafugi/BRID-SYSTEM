/**
 * Macrofases do fluxo de projetos públicos (Fluxograma Macro).
 *
 * tipo "auto": fase coberta pela automação de documentos — avança sozinha
 * conforme os documentos entram (Ofício → TR → Proposta). Não pode ser
 * selecionada manualmente.
 * tipo "manual": fase conduzida fora do sistema (contrato, execução etc.).
 */
export type TipoEtapa = "auto" | "manual";

export interface EtapaFluxo {
  nome: string;
  tipo: TipoEtapa;
}

export const ETAPAS_FLUXO: EtapaFluxo[] = [
  { nome: "Abertura do processo (Ofício)", tipo: "auto" },
  { nome: "TR/ETP recebido e validado", tipo: "auto" },
  { nome: "Proposta (elaboração e envio)", tipo: "auto" },
  { nome: "Contrato assinado", tipo: "manual" },
  { nome: "Kick-off realizado", tipo: "manual" },
  { nome: "Em execução (dados e serviços)", tipo: "manual" },
  { nome: "Relatório em validação", tipo: "manual" },
  { nome: "Aprovado / Faturamento", tipo: "manual" },
];

/** Documentos essenciais anexáveis manualmente ao processo. */
export const DOCS_FOLLOWUP = ["oficio"] as const;

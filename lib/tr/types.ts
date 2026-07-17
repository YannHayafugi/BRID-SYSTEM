/**
 * Tipos do sistema de análise de TR (Termo de Referência), objeto
 * "Securitização de Dívida Ativa" — ver docs/ESPECIFICAÇÃO FUNCIONAL DO
 * SISTEMA - v1.1.docx.
 */

export type Classificacao = "Município" | "Estado";

/** Dados do cadastro inicial (emissor do TR). Campos com * na especificação
 * são obrigatórios: classificacao, nomeEnte, uf, nomeResponsavel, cargo, email. */
export interface EnteInfo {
  classificacao: Classificacao;
  nomeEnte: string;
  uf: string;
  nomeResponsavel: string;
  cargo: string;
  telefone?: string;
  email: string;
  /** Único valor implementado nesta versão. */
  objetoTR: "Securitizacao";
}

export const UFS_BRASIL: { sigla: string; nome: string }[] = [
  { sigla: "AC", nome: "Acre" },
  { sigla: "AL", nome: "Alagoas" },
  { sigla: "AP", nome: "Amapá" },
  { sigla: "AM", nome: "Amazonas" },
  { sigla: "BA", nome: "Bahia" },
  { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" },
  { sigla: "ES", nome: "Espírito Santo" },
  { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" },
  { sigla: "MT", nome: "Mato Grosso" },
  { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" },
  { sigla: "PA", nome: "Pará" },
  { sigla: "PB", nome: "Paraíba" },
  { sigla: "PR", nome: "Paraná" },
  { sigla: "PE", nome: "Pernambuco" },
  { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" },
  { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondônia" },
  { sigla: "RR", nome: "Roraima" },
  { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" },
  { sigla: "SE", nome: "Sergipe" },
  { sigla: "TO", nome: "Tocantins" },
];

/** Resultado bruto retornado pela IA (JSON compacto, uma única chamada por TR). */
export interface ResultadoAnaliseTR {
  /** false quando o documento está vazio, ilegível ou não é um TR reconhecível.
   * Nesse caso, os demais campos devem ser ignorados — a IA não deve inventar
   * conteúdo para preenchê-los. */
  documentoValido: boolean;
  /** Preenchido apenas quando documentoValido=false, explicando o motivo. */
  motivoInvalido: string | null;
  item1_objeto: {
    alinhado: boolean;
    achados: string | null; // preenchido quando alinhado=false
  };
  item2_prazo: {
    prazoTexto: string; // como encontrado no TR, ou "Não localizado no TR."
    prorrogacaoPrevista: boolean;
    prorrogacaoDetalhe: string; // descrição da previsão, ou "Sem previsão de prorrogação."
  };
  item3_fundamentacao: {
    aspectoACondizente: boolean;
    aspectoADetalhe: string; // por que está/não está condizente
    referenciaLegal: "literal" | "equivalente" | "ausente";
    referenciaLegalDetalhe: string; // trecho encontrado, ou explicação da ausência
  };
  item4_etapas: Array<{
    etapa: 1 | 2 | 3;
    divergencia: boolean;
    resumo: string | null; // preenchido quando divergencia=true
  }>;
  item5_ordemServico: {
    presente: boolean;
    prazoEmissao: string; // ou "Não especificado."
    prazoInicio: string; // ou "Não especificado."
    exigeNovaOsPorEtapa: boolean;
    detalheRisco: string | null; // preenchido quando exigeNovaOsPorEtapa=true
  };
  item6_garantia: {
    exigida: boolean;
    detalhe: string | null; // preenchido quando exigida=true
  };
  item7_pagamento: {
    condicaoNf: string; // condição para emissão de NF + prazo de pagamento
    atualizacaoMonetaria: string; // sempre preenchido; "Não previsto no TR." se ausente
    regraBanco: { identificado: boolean; detalhe: string | null };
    metodologiaMedicao: { identificado: boolean; detalhe: string | null };
  };
  item8_penalidades: Array<{ descricao: string }>; // lista vazia se nenhuma encontrada
}

/** Um achado apresentável em tela, derivado deterministicamente do resultado
 * bruto pelas regras de negócio (lib/tr/regras.ts) — não vem direto da IA. */
export interface Achado {
  id: string;
  itemNumero: string; // "1", "2", "3", "4 — Etapa 1", "5", "6", "7-a", "8"
  titulo: string;
  texto: string;
  /** "ok": apenas registro, sem ciência nem comentário.
   *  "atencao": exige ciência obrigatória (+ comentário obrigatório ou opcional). */
  tipo: "ok" | "atencao";
  comentarioObrigatorio: boolean;
}

/** Estado de interação do usuário com um achado do tipo "atencao". */
export interface AchadoEstado {
  ciente: boolean;
  comentario: string;
}

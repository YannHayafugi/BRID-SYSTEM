/**
 * Tipos do cadastro central de órgãos (entes), compartilhado pela análise de
 * TR e pela geração de propostas. Ver supabase/schema.sql (tabelas "orgaos"
 * e "orgaos_contatos").
 */

import { cnpjValido, somenteDigitos, telefoneValido } from "@/lib/mascaras";

export type TipoEnte = "Município" | "Estado";

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

export interface Contato {
  id: string;
  orgao_id: string;
  nome_completo: string;
  cargo: string;
  /** Sempre com DDD (10 ou 11 dígitos), ver lib/mascaras.ts. */
  telefone: string;
  email: string;
  created_at: string;
}

export interface Orgao {
  id: string;
  criado_por: string | null;
  tipo_ente: TipoEnte;
  razao_social: string;
  /** Apenas dígitos (14), único no sistema — ver lib/mascaras.ts para máscara/validação. */
  cnpj: string;
  cidade: string;
  uf: string;
  created_at: string;
  updated_at: string;
}

export interface OrgaoComContatos extends Orgao {
  contatos: Contato[];
}

/** Uma "Ação" no card do órgão = um processo do Follow-up aberto para ele
 * (D15) — título livre (ex.: "Securitização", "Consultoria Tributária"),
 * com seus arquivos (TR/Proposta/Ofício) e progresso. */
export interface AcaoOrgao {
  id: string;
  titulo: string;
  etapa: number;
  arquivos: string[];
  documentos: { oficio?: { nome: string } };
  proposta_aprovada: boolean;
}

export interface OrgaoComAcoes extends Orgao {
  processos?: AcaoOrgao[];
}

/** Payload para cadastrar/editar um órgão. */
export interface OrgaoInput {
  tipoEnte: TipoEnte;
  razaoSocial: string;
  cnpj: string;
  cidade: string;
  uf: string;
}

export function orgaoValido(o: OrgaoInput): string[] {
  const faltando: string[] = [];
  if (!o.tipoEnte) faltando.push("Tipo do ente");
  if (!o.razaoSocial?.trim()) faltando.push("Razão social");
  if (!o.cidade?.trim()) faltando.push("Cidade");
  if (!o.uf?.trim()) faltando.push("UF");
  if (!o.cnpj?.trim()) {
    faltando.push("CNPJ");
  } else if (!cnpjValido(o.cnpj)) {
    faltando.push("CNPJ (número inválido)");
  }
  return faltando;
}

/** Payload para criar um contato (usado tanto no cadastro inicial do órgão
 * quanto no botão "Adicionar contato" nas telas de análise/proposta). */
export interface NovoContatoInput {
  nomeCompleto: string;
  cargo: string;
  telefone: string;
  email: string;
}

export function contatoValido(c: NovoContatoInput): string[] {
  const faltando: string[] = [];
  if (!c.nomeCompleto?.trim()) faltando.push("Nome completo do responsável");
  if (!c.cargo?.trim()) faltando.push("Cargo");
  if (!c.email?.trim()) faltando.push("E-mail");
  if (!c.telefone?.trim()) {
    faltando.push("Telefone (com DDD)");
  } else if (!telefoneValido(c.telefone)) {
    faltando.push("Telefone (com DDD) — número incompleto");
  }
  return faltando;
}

export { somenteDigitos };

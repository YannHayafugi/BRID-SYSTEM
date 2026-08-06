/** Conteúdo estruturado da proposta, gerado pela IA a partir do TR (D7 — híbrido:
 * a IA produz este JSON; o DOCX com timbrado FIA é montado localmente). Esquema
 * portado do backend Python (prompts.py) para manter compatibilidade. */

export interface EtapaProposta {
  nome: string;
  descricao: string;
  prazo: string;
}

export interface MembroEquipe {
  perfil: string;
  atribuicoes: string;
  quantidade: number;
}

export interface RiscoProposta {
  risco: string;
  mitigacao: string;
}

export interface ResumoProposta {
  objeto: string;
  cliente: string;
  prazo: string;
  valor_referencia: string;
  escopo_resumido: string[];
  destaques: string[];
  proximos_passos: string[];
}

export interface ConteudoProposta {
  titulo: string;
  orgao_cliente: string;
  objeto: string;
  contexto: string;
  escopo: string[];
  metodologia: string;
  etapas: EtapaProposta[];
  equipe: MembroEquipe[];
  prazo_total: string;
  criterios_pagamento: string;
  requisitos_atendidos: string[];
  premissas: string[];
  riscos: RiscoProposta[];
  resumo: ResumoProposta;
}

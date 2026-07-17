/** Dados do ofício FIA — port do modelo Pydantic do backend Python (oficio.py).
 * Nomes de campos preservados para compatibilidade com o payload do frontend. */

export interface ItemNorma {
  text: string;
  /** 0 = item numerado (1, 2, ...); 1 = subitem alfabético (a, b, c...). */
  level: number;
}

export interface OficioData {
  destinatario_nome: string;
  destinatario_endereco: string[];
  numero_contrato: string;
  assunto: string;
  ac_nome?: string;
  ac_cargo?: string;
  saudacao: string;
  paragrafo_abertura: string;
  etapas?: string;
  paragrafo_etapas?: string;
  introducao_lista_dados?: string;
  itens_lista_dados?: string[];
  paragrafo_transicao_normas?: string;
  introducao_lista_normas?: string;
  itens_lista_normas?: ItemNorma[];
  paragrafo_pos_lista?: string;
  paragrafo_reforcamos?: string;
  paragrafo_tempestividade?: string;
  paragrafo_teams?: string;
  paragrafo_sharepoint_prazo?: string;
  sharepoint_exclusividade1?: string;
  sharepoint_exclusividade2?: string;
  sharepoint_exclusividade3?: string;
  paragrafo_reuniao?: string;
  paragrafo_encerramento?: string;
  cidade_emissao?: string;
  data_extenso?: string;
  assinatura?: string;
}

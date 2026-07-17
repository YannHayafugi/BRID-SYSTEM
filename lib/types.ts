export type TipoEnte = "Município" | "Estado";
export type Tratamento = "Senhor" | "Senhora";

export interface Etapa {
  titulo: string; // ex.: "Análise Legal e Normativa" (sem "Etapa X – ")
  atividades: string; // texto multi-linha, ver formatação em lib/parseAtividades.ts
  periodo: string; // ex.: "1º mês" ou "2º ao 4º mês"
}

export interface PropostaFormData {
  tipoEnte: TipoEnte;
  nomeEnte: string; // ex.: "São Roque" ou "Mato Grosso do Sul"
  uf: string; // ex.: "SP"
  dataDia: number;
  dataMes: number;
  dataAno: number;
  tratamento: Tratamento;
  nomeDestinatario: string;
  cargoDestinatario: string;
  prazoMeses: number; // 1 a 36
  honorarios: number; // valor total em R$
  parcelas: number; // 1 a 36
  etapas: Etapa[];
}

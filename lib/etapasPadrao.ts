import { Etapa } from "./types";

/** Conteúdo padrão pré-preenchido (pode ser editado ou removido pelo usuário). */
export const ETAPAS_PADRAO: Etapa[] = [
  {
    titulo: "Análise Legal e Normativa",
    periodo: "1º mês",
    atividades:
`**1. Levantamento e sistematização da base legal e normativa:**
    1. Levantamento e sistematização de toda a base legal aplicável à securitização de créditos públicos (CF/88, Lei nº 4.320/64, LC nº 101/2000, LC nº 208/2024, normas CVM/SFN).
    2. Análise da aderência da legislação local à legislação federal vigente.
    3. Identificação de possíveis lacunas ou necessidade de regulamentação local.
    4. Elaboração de relatório final consolidado com todas as análises realizadas.
    5. Reuniões de apresentação e esclarecimento junto à equipe técnica do Município`,
  },
  {
    titulo: "Análise de créditos inadimplidos",
    periodo: "2º ao 4º mês",
    atividades:
`**1. Reunião inicial, planejamento e coleta de dados:**
    1. Recebimento e análise dos dados dos ativos municipais (composição, legislação, processos e estruturas).
    2. Recebimento e análise dos recebíveis: carteira de inadimplentes e fluxos financeiros de recuperação dos últimos 10 anos.
    3. Recebimento e análise dos projetos com necessidade de captação de recursos, valores estimados e prioridades.
**2. Análise e classificação dos créditos:**
    1. Apresentação de escopo de extração de dados dos créditos tributários e não tributários.
    2. Análise dos fluxos de recebíveis e estimativa de valores por classe: Ativo Sênior (A); Mezanino (B); Subordinado (C).
    3. Estudos de aderência dos ativos às regras do SFN e normas CVM.
**3. Relatórios e plano de uso dos créditos:**
    1. Relatórios dos fluxos financeiros segmentados por tributo, ano de lançamento, mês de recebimento, categoria de cobrança, situação de ajuizamento e inscrição em dívida ativa.
    2. Relatório com plano de uso dos direitos creditórios, incluindo necessidades legais e regulamentares para uso ou cessão dos créditos.`,
  },
  {
    titulo: "Instrumentos Normativos",
    periodo: "5º ao 6º mês",
    atividades:
`**1. Elaboração de estudos para subsidiar:**
    1. Minuta de projeto de lei para a realização da operação de securitização: autorização legislativa, contratação de instituição do SFN, criação de fundo especial (arts. 71 a 74 da Lei nº 4.320/64) e abertura de rubricas orçamentárias.
    2. Minuta de justificativas para encaminhamento do projeto de lei à Câmara Municipal.
    3. Minuta de decreto regulamentador detalhando a operação, com base nos estudos e premissas estabelecidas.
    4. Minuta de regimento interno do fundo especial: constituição do conselho de gestão, prestação de contas ao Município, ao Legislativo e ao controle externo, com máxima transparência.`,
  },
  {
    titulo: "Modelagem e Estudos Licitatórios",
    periodo: "7º ao 8º mês",
    atividades:
`**1. Modelagem para contratação via licitação:**
    1. Elaboração de estudos e modelagem para contratação de instituição financeira (Lei nº 14.133/2021): estimativa do valor a ser captado, fluxo de crédito alienado e regras condicionantes.
    2. Modelo base de Edital e documentos correlatos, considerando LOA, LDO e PPA vigentes.
    3. Estudos de aderência dos ativos: fluxo financeiro histórico, créditos recebidos antes e após inscrição em dívida ativa, incluindo os ajuizados.
**2. Rating, precificação e distribuição no mercado de capitais:**
    1. Estudos e procedimentos para contratação de agência de rating e de instituição financeira credenciada ao BACEN para distribuição no mercado de capitais.
    2. Qualificação dos dados corporativos (gestão fiscal, contabilidade e controle interno) e treinamento da equipe municipal para entrevistas da agência de rating.
    3. Relatório de modelagem de estruturação dos ativos para distribuição no mercado de capitais, observando regras SFN/CVM.
    4. Relatório com sugestões de prêmio de risco conforme agências de rating indicadas.
**3. Roadshow:**
    1. Apoio à Administração no Roadshow: avaliação do interesse do mercado financeiro, análise das condições ofertadas e negociação com as instituições.`,
  },
  {
    titulo: "Apoio ao Processo Licitatório e Acompanhamento",
    periodo: "9º ao 12º mês",
    atividades:
`**1. Apoio ao processo licitatório e à instituição financeira contratada:**
    1. Apoio à gestão municipal no processo licitatório e no relacionamento com a instituição financeira vencedora.
    2. Acompanhamento da utilização dos estudos prévios pela instituição financeira e atestação de conformidade com os estudos realizados e com a legislação vigente.
    3. Emissão de relatórios comparativos entre os estudos realizados e as atividades da instituição financeira, com dados e condições atualizados para emissão.
    4. Acompanhamento de todos os procedimentos até a distribuição dos ativos no mercado de capitais.
**2. Aplicação dos recursos, PPI e encerramento:**
    1. Modelagem de processos para aplicação dos recursos captados: compliance (destinação × objetivo × instrumento financeiro distribuído), conforme regras CVM.
    2. Apoio no desenvolvimento do Programa de Parcerias e Investimentos (PPI): minutas de leis, estruturas e relatório detalhado.
    3. Modelagem e gerenciamento de processos: acompanhamento da carteira de ativos, Key Points, Benchmarks, captação e destinação dos recursos.
    4. Relatório final com todas as atividades desenvolvidas e encerramento formal do contrato.`,
  },
];

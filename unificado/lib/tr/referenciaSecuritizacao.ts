/**
 * Conteúdo de referência para a análise de TR — objeto "Securitização de
 * Dívida Ativa" (única opção implementada nesta versão, ver campo "Objeto do
 * TR" na especificação funcional v1.1, docs/ESPECIFICAÇÃO FUNCIONAL DO
 * SISTEMA - v1.1.docx).
 *
 * Este conteúdo raramente muda — é enviado à API do Claude como bloco
 * cacheado (cache_control: ephemeral) para economizar tokens entre análises.
 */

export const OBJETO_ELEMENTOS_ESPERADOS = `Os elementos que devem estar presentes na descrição do objeto, de forma direta ou equivalente, são:
- contratação de instituição para realização de estudos técnicos e financeiros para fortalecimento das capacidades orçamentárias e financeiras do ente público;
- estudos para elaboração de minuta de projeto de lei, decreto regulamentador e regimento interno do fundo especial;
- levantamento de créditos tributários e não tributários inadimplidos;
- estruturação de modelo para cessão de fluxos no mercado de capitais;
- assessoria nos processos licitatórios;
- estudos para elaboração de minutas de edital, termo de referência e anexos;
- atuação no relacionamento com instituição financeira.`;

export interface EtapaReferencia {
  numero: 1 | 2 | 3;
  texto: string;
}

export const ETAPAS_REFERENCIA: EtapaReferencia[] = [
  {
    numero: 1,
    texto: `Levantamento e sistematização de toda a base legal e normativa aplicável à securitização de créditos públicos; 1.1. Análise da aderência da legislação local à legislação federal vigente; 1.2. Identificação de possíveis lacunas ou necessidade de regulamentação local; 1.3. Apresentação de relatório final consolidado contendo todas as análises realizadas; e 1.4. Reuniões de apresentação e esclarecimento junto à equipe técnica do órgão/entidade.

Estudos e pesquisas para auxiliar o ente na elaboração de: 2.1. minuta de projeto de lei para a realização de operação de securitização, considerando a necessária autorização legislativa, a autorização para a contratação de instituição do sistema financeiro nacional para a realização da operação, a criação da estrutura jurídico legal interna para o gerenciamento e transparência do processo, com o isolamento contábil e financeiro em fundo especial previsto nos artigos 71 a 74 da Lei nº 4.320/64, considerando, ainda, a abertura de rubricas orçamentárias necessárias para a contabilização de todo o procedimento; 2.2. minuta com justificativas para encaminhamento do projeto de lei para a Câmara Legislativa; 2.3. minuta de decreto regulamentador detalhando a operação e considerando todos os pontos abordados no item anterior; 2.4. minuta de regimento interno do fundo especial, com todo o detalhamento necessário para atender a legislação vigente, desde a constituição do conselho de gestão até a prestação de contas para o ente, para o legislativo e o controle externo, com a máxima transparência.

Apresentação do escopo de extração de dados necessários aos estudos e às análises, dos créditos de natureza tributária e/ou não tributária da contratante, assim como em relação aos fluxos financeiros oriundos dessas carteiras, esclarecer as dúvidas sobre os créditos e o fluxo financeiro, inclusive sobre a legislação, processos e estruturas existentes; 3.1. Planejamento e Coleta de Dados, incluindo o alinhamento entre as equipes da Instituição e do ente; 3.2. Realizar reunião inicial entre as equipes da Instituição e da contratante para: receber e detalhar os dados dos ativos e da contratante; receber e analisar os dados dos recebíveis, incluindo carteira de inadimplentes e fluxos financeiros de recuperação dos últimos 10 anos; e receber e analisar os dados dos projetos com necessidade de captação de recursos, valores estimados e prioridades. 3.3. Análise de dados dos fluxos dos recebíveis, incluindo a carteira de inadimplentes, com objetivo de definir e apresentar os valores e metas de prazos para emissão de ativos financeiros de natureza sênior, mezanino e subordinada, incluindo estimativa de valores por classe e estudos de aderência dos ativos às regras do Sistema Financeiro Nacional e normas CVM.

Emissão de relatórios dos fluxos financeiros e dos créditos de natureza tributária e/ou não tributária da contratante, segmentando-os de acordo com a utilidade pretendida, atendendo às normas do Sistema Financeiro Nacional; 4.1. Emissão de relatórios contemplando o plano de uso dos direitos creditórios, incluindo as necessidades de lei e regulamentos infralegais para o uso ou cessão destes créditos; 4.2. Apresentação inicial de estudos para definição dos ativos financeiros, a fim de auxiliar a contratante a definir a linha de utilização mais benéfica, através da compilação dos documentos finais, apresentação e entrega dos resultados.`,
  },
  {
    numero: 2,
    texto: `Apresentação de estudos e sugestão de modelagem completa para licitação para contratação de Instituição Financeira e/ou Instituição do Sistema Financeiro, que irá realizar a cessão dos fluxos de créditos e fluxos financeiros de natureza tributária e/ou não tributária, incluindo minutas de Estudo Técnico Preliminar, Termo de Referência e Edital, a fim de permitir o uso destes recursos em prol do desenvolvimento local. 5.1. Apresentação de estudos e relatórios sobre o Processo Licitatório para a contratação de Instituição Financeira e/ou Instituição do Sistema Financeiro. 5.2. Realização de estudos para apoiar a contratante na estruturação do mapeamento integrado das necessidades de investimentos, carteira de ativos disponíveis, classificação dos ativos disponíveis e sugestão da melhor e mais eficaz destinação dos ativos financeiros emitidos.

Realização de estudos de aderência dos ativos e da contratante, em especial o fluxo financeiro histórico recebido, abrangendo as informações acerca dos créditos recebidos administrativamente antes e após a inscrição em dívida ativa, incluindo os ajuizados. 6.1. Realização de estudos e pesquisas a fim de sugerir os procedimentos necessários para a contratação de agência de classificação de risco (Rating) e de instituição financeira credenciada ao BACEN para distribuição no mercado de capitais, incluindo qualificação dos dados corporativos e treinamento da equipe de gestão do ente para as entrevistas da agência de rating. 6.2. Emissão de relatório com sugestão de modelagem de estruturação dos ativos da contratante para distribuição no mercado de capitais, seguindo as regras do SFN e da CVM. 6.3. Apresentação de relatório com sugestões de "prêmio de risco" de acordo com as agências de rating apresentadas. 6.4. Elaboração de estudos para embasar o ente no desenvolvimento de minutas de projeto de lei e regulamentações, conforme orientações e definições apresentadas, considerando os estudos e pesquisas realizados durante a execução do objeto.`,
  },
  {
    numero: 3,
    texto: `Apresentação de relatório com estudos, embasamento e opiniões, apresentando comparativos entre os estudos realizados na Etapa 1 e as atividades desenvolvidas pela Instituição Financeira e/ou Instituição do Sistema Financeiro, incluindo menção aos dados e condições atualizados para emissão.

Realização de apoio ao ente com o intuito de tornar mais eficiente o processo de cobrança, contemplando: 8.1. Treinamento e capacitação dos funcionários das diferentes áreas ligadas ao processo de cobrança; 8.2. Levantamento e análise dos procedimentos e proposição de uma rotina mais racional e simplificada nas distintas fases de cobrança (antes da inscrição em dívida ativa, após a inscrição, e após o ajuizamento da ação de cobrança); 8.3. Análise, correção e enriquecimento das bases de dados e cadastros de devedores e dos débitos, com adoção de novas ferramentas de comunicação com o contribuinte.

Emissão de relatório com todas as atividades desenvolvidas no âmbito das atividades, com as sugestões de processos de acordo com os objetivos acima elencados.`,
  },
];

export function getEtapasReferenciaTexto(): string {
  return ETAPAS_REFERENCIA.map((e) => `ETAPA ${e.numero}:\n${e.texto}`).join("\n\n");
}

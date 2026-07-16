import fs from "fs";
import path from "path";
import {
  Document,
  Paragraph,
  TextRun,
  Header,
  Footer,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  VerticalAlign,
  BorderStyle,
  ShadingType,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  TextWrappingType,
  SectionType,
  Packer,
} from "docx";
import { PropostaFormData } from "./types";
import { runs, FONT, SIZE } from "./markdown";
import { parseAtividades } from "./parseAtividades";
import { toRoman } from "./roman";
import {
  dataPorExtenso,
  moedaComExtenso,
  numeroComExtenso,
  formatarMoeda,
} from "./extenso";

const PAGE_WIDTH = 11910;
const PAGE_HEIGHT = 16840;
const MARGIN_TOP = 1440;
const MARGIN_BOTTOM = 1440;
const MARGIN_LEFT = 1080;
const MARGIN_RIGHT = 1080;
const HEADER_DIST = 709;
const FOOTER_DIST = 0;
const FIRST_LINE_INDENT = 720;
const LINE_SPACING = 360; // 1.5

function readAsset(name: string): Buffer {
  return fs.readFileSync(path.join(process.cwd(), "public", "assets", name));
}

/** Parágrafo padrão do corpo: Times New Roman 12, justificado, recuo de
 * primeira linha, espaçamento 1,5. */
function body(text: string, opts: { indent?: boolean } = {}): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: LINE_SPACING, lineRule: "auto", after: 160 },
    indent: opts.indent === false ? undefined : { firstLine: FIRST_LINE_INDENT },
    children: runs(text),
  });
}

function heading(text: string, opts: { pageBreakBefore?: boolean } = {}): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    pageBreakBefore: opts.pageBreakBefore ?? false,
    spacing: { line: LINE_SPACING, lineRule: "auto", before: 200, after: 160 },
    children: runs(`**${text}**`),
  });
}

function centered(text: string, opts: { bold?: boolean; italic?: boolean } = {}): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { line: LINE_SPACING, lineRule: "auto", after: 160 },
    children: runs(opts.bold ? `**${text}**` : text, { italic: opts.italic }),
  });
}

function blank(): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: "", font: FONT, size: SIZE })] });
}

const NOTE_SIZE = 16; // 8pt (half-points)

/** Parágrafo de nota de rodapé (CV do signatário): Times New Roman 8,
 * espaçamento mínimo entre linhas. */
function notaRodape(text: string, opts: { primeira?: boolean } = {}): Paragraph {
  return new Paragraph({
    spacing: { line: 210, lineRule: "auto", after: 20, before: 0 },
    border: opts.primeira
      ? { top: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 4 } }
      : undefined,
    children: text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) => {
      const isBold = /^\*\*[^*]+\*\*$/.test(part);
      return new TextRun({
        text: isBold ? part.slice(2, -2) : part,
        font: FONT,
        size: NOTE_SIZE,
        bold: isBold,
      });
    }),
  });
}

function buildCoverSection(data: PropostaFormData) {
  const enteUpper = data.tipoEnte.toUpperCase();
  const titulo =
    `PROPOSTA DE PRESTAÇÃO DE SERVIÇOS TÉCNICOS ESPECIALIZADOS PARA REALIZAÇÃO DE ` +
    `ESTUDOS FINANCEIROS, JURÍDICOS E ECONÔMICOS VISANDO A SECURITIZAÇÃO DA DÍVIDA ATIVA DO ` +
    `${enteUpper} DE ${data.nomeEnte.toUpperCase()}${data.uf ? " – " + data.uf.toUpperCase() : ""}`;

  const mesesExtenso = [
    "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO",
    "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
  ];
  const mesAno = `${mesesExtenso[data.dataMes - 1]} ${data.dataAno}`;

  const bgImage = readAsset("capa-fundo.png");

  return {
    properties: {
      type: SectionType.NEXT_PAGE,
      page: {
        size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
        margin: {
          top: MARGIN_TOP,
          bottom: MARGIN_BOTTOM,
          left: MARGIN_LEFT,
          right: MARGIN_RIGHT,
          header: HEADER_DIST,
          footer: FOOTER_DIST,
        },
      },
    },
    children: [
      new Paragraph({
        children: [
          new ImageRun({
            type: "png",
            data: bgImage,
            // A imagem original é retangular e mais "estreita" que a proporção da
            // página (900x1600 vs. página ~8.27x11.69in). Para cobrir 100% da
            // largura (sem faixas em branco), escalamos pela largura da página
            // (+ sangria) e deixamos a altura sobrar além da borda inferior —
            // o excedente simplesmente não é exibido, pois fica fora da página.
            transformation: { width: 823, height: 1463 },
            floating: {
              horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: -137160 },
              verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: -137160 },
              wrap: { type: TextWrappingType.NONE },
              behindDocument: true,
              allowOverlap: true,
            },
          }),
        ],
      }),
      new Paragraph({
        spacing: { before: 3200 },
        children: [new TextRun({ text: "", font: FONT, size: SIZE })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: LINE_SPACING, lineRule: "auto" },
        children: runs(`**${titulo}**`),
      }),
      new Paragraph({ spacing: { before: 6800 }, children: [new TextRun({ text: "" })] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: runs(`**${mesAno}**`),
      }),
    ],
  };
}

function buildHeader(): Header {
  const logo = readAsset("header-logo.png");
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: "png",
            data: logo,
            transformation: { width: 130, height: 34 },
          }),
        ],
      }),
    ],
  });
}

function buildFooter(): Footer {
  const bar = readAsset("footer-bar.png");
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        indent: { left: -MARGIN_LEFT, right: -MARGIN_RIGHT },
        children: [
          new ImageRun({
            type: "png",
            data: bar,
            transformation: { width: 620, height: 48 },
          }),
        ],
      }),
    ],
  });
}

function cronogramaTable(data: PropostaFormData): Table {
  const headerCell = (text: string) =>
    new TableCell({
      shading: { type: ShadingType.CLEAR, fill: "1F4E3D" },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 100, bottom: 100, left: 120, right: 120 },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text, font: FONT, size: SIZE, bold: true, color: "FFFFFF" }),
          ],
        }),
      ],
    });

  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [headerCell("Etapa"), headerCell("Atividades"), headerCell("Período")],
    }),
  ];

  data.etapas.forEach((etapa, idx) => {
    const romano = toRoman(idx + 1);
    const linhas = parseAtividades(etapa.atividades);

    const atividadeParagraphs = linhas.map((linha) => {
      if (linha.bold) {
        return new Paragraph({
          spacing: { line: LINE_SPACING, lineRule: "auto", after: 60, before: idx === 0 ? 0 : 60 },
          children: [new TextRun({ text: linha.texto, font: FONT, size: SIZE, bold: true })],
        });
      }
      if (linha.bullet) {
        return new Paragraph({
          spacing: { line: LINE_SPACING, lineRule: "auto", after: 40 },
          indent: { left: 260 },
          bullet: { level: 0 },
          children: [new TextRun({ text: linha.texto, font: FONT, size: SIZE })],
        });
      }
      return new Paragraph({
        spacing: { line: LINE_SPACING, lineRule: "auto", after: 60 },
        children: [new TextRun({ text: linha.texto, font: FONT, size: SIZE })],
      });
    });

    rows.push(
      new TableRow({
        children: [
          new TableCell({
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 100, bottom: 100, left: 120, right: 120 },
            width: { size: 22, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Etapa ${romano} – ${etapa.titulo}`,
                    font: FONT,
                    size: SIZE,
                    bold: true,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 100, bottom: 100, left: 120, right: 120 },
            width: { size: 58, type: WidthType.PERCENTAGE },
            children: atividadeParagraphs.length > 0 ? atividadeParagraphs : [new Paragraph({})],
          }),
          new TableCell({
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 100, bottom: 100, left: 120, right: 120 },
            width: { size: 20, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: etapa.periodo, font: FONT, size: SIZE })],
              }),
            ],
          }),
        ],
      })
    );
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
    },
    rows,
  });
}

function buildBodySection(data: PropostaFormData) {
  const ente = data.tipoEnte; // "Município" | "Estado"
  const enteUpper = ente.toUpperCase();
  const nomeEnte = data.nomeEnte;
  const uf = data.uf ? data.uf.toUpperCase() : "";
  const enteNome = `${ente} de ${nomeEnte}`; // ex.: "Município de São Roque"
  const enteNomeUpperLine = `${enteUpper} DE ${nomeEnte.toUpperCase()}${uf ? " – " + uf : ""}`;
  const dataExtenso = dataPorExtenso(data.dataDia, data.dataMes, data.dataAno);

  const honorariosTotal = moedaComExtenso(data.honorarios);
  const valorParcela = data.parcelas > 0 ? data.honorarios / data.parcelas : 0;
  const honorariosParcela = moedaComExtenso(valorParcela);
  const prazoExtenso = numeroComExtenso(data.prazoMeses);
  const parcelasExtenso = numeroComExtenso(data.parcelas);

  const children: (Paragraph | Table)[] = [
    body(`**AO ${enteNomeUpperLine}.**`, { indent: false }),
    blank(),
    body(`**A/C ${data.tratamento} ${data.nomeDestinatario} – ${data.cargoDestinatario}**`, { indent: false }),
    blank(),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { line: LINE_SPACING, lineRule: "auto", after: 160 },
      children: [
        new TextRun({ text: "Ref.: ", font: FONT, size: SIZE, bold: true }),
        new TextRun({
          text:
            `Proposta técnica e comercial para prestação de serviços técnicos especializados para a ` +
            `Contratação de instituição especializada para a realização de estudos financeiros, jurídicos, ` +
            `econômicos e administrativos voltados ao fortalecimento da capacidade orçamentária, financeira e ` +
            `administrativa do ${enteNome}, incluindo a estruturação de modelo para securitização de créditos ` +
            `tributários e não tributários inadimplidos (Dívida Ativa), com fundamento na LC nº 208/2024.`,
          font: FONT,
          size: SIZE,
          italics: true,
        }),
      ],
    }),
    body(`${data.tratamento === "Senhor" ? "Prezado" : "Prezada"},`, { indent: false }),
    body(
      `Em atenção à solicitação que nos foi dirigida por Vossa Senhoria, temos a honra de apresentar proposta ` +
        `referente a **Contratação de instituição especializada para realização de estudos financeiros, jurídicos, ` +
        `econômicos e administrativos voltados à securitização da dívida ativa e créditos tributários e não ` +
        `tributários inadimplidos do ${enteNome}**, conforme as especificações, exigências e condições a seguir detalhadas.`
    ),
    body(
      `Ao tempo que agradecemos a oportunidade oferecida a esta Fundação e nos colocamos à disposição para ` +
        `quaisquer esclarecimentos, renovamos nossos protestos de elevada estima e alta consideração.`
    ),
    centered(`São Paulo, ${dataExtenso}.`),
    blank(),
    centered(`Atenciosamente,`),
    centered(`Claudio Felisoni de Angelo`),
    blank(),

    heading("1. Contextualização", { pageBreakBefore: true }),
    body(
      `A edição da Lei Complementar Federal nº 208/2024 inaugurou novo marco normativo para a gestão de ativos ` +
        `públicos municipais, ao permitir a cessão de direitos creditórios originados de créditos tributários e não ` +
        `tributários dos entes federativos ao mercado de capitais, por meio de operações estruturadas de ` +
        `securitização. Esse instrumento abre importante janela para que o ${enteNome} converta carteiras de ` +
        `créditos inadimplidos em recursos disponíveis para investimento imediato em políticas públicas e infraestrutura.`
    ),
    body(
      `O ${enteNome} identificou a necessidade de avaliar a viabilidade e estruturar tecnicamente a securitização ` +
        `de sua dívida ativa e demais créditos tributários e não tributários inadimplidos, em conformidade com a ` +
        `CF/88, a Lei nº 4.320/64, a LC nº 101/2000 e a LC nº 208/2024.`
    ),
    body(
      `A complexidade multidisciplinar do processo de securitização — envolvendo aspectos jurídicos, financeiros, ` +
        `contábeis, orçamentários, regulatórios e de mercado de capitais — demanda a contratação de instituição ` +
        `externa de notório conhecimento técnico, capaz de conduzir os estudos com profundidade, segurança ` +
        `jurídica e metodologia adequada, subsidiando as decisões estratégicas da Administração ${ente === "Município" ? "Municipal" : "Estadual"}.`
    ),
    body(
      `A estruturação de uma operação de securitização de créditos públicos demanda análise técnico-multidisciplinar ` +
        `especializada, envolvendo diagnóstico da carteira de recebíveis, modelagem financeira, conformidade ` +
        `regulatória com as normas do SFN e da CVM, e elaboração de instrumentos normativos locais. Trata-se de ` +
        `atividade de elevada complexidade técnica, que exige metodologia própria, independência analítica e ` +
        `domínio específico de finanças públicas e mercado de capitais.`
    ),
    body(
      `Nesse contexto, a Fundação Instituto de Administração – FIA apresenta a seguinte proposta técnica e ` +
        `comercial, colocando-se à disposição do ${ente.toLowerCase()} de ${nomeEnte} sua expertise multidisciplinar ` +
        `em finanças públicas, mercado de capitais e gestão institucional, com o objetivo de conduzir os estudos ` +
        `necessários à estruturação da operação de securitização com segurança jurídica, rigor técnico e ` +
        `alinhamento ao interesse público.`
    ),

    heading("2. Escopo dos Serviços e Consultoria"),
    body(
      `De acordo com o Termo de Referência do ${enteNome}, os serviços serão estruturados em cinco etapas, cada ` +
        `uma com suas respectivas fases de execução, conforme descrito a seguir:`
    ),
    body(`**Etapa I – Análise Legal e Normativa**`, { indent: false }),
    body(
      `Levantamento da base legal aplicável, análise de aderência da legislação local à federal, identificação de ` +
        `lacunas regulatórias e apresentação de relatório consolidado com reuniões de esclarecimento.`
    ),
    body(`**Etapa II – Análise de créditos tributários e não tributários inadimplidos**`, { indent: false }),
    body(
      `Diagnóstico aprofundado da carteira de créditos ${ente === "Município" ? "municipais" : "estaduais"}, ` +
        `classificação de ativos (sênior, mezanino e subordinada), análise de aderência às normas do Sistema ` +
        `Financeiro Nacional e estudos de fluxos financeiros históricos.`
    ),
    body(`**Etapa III – Instrumentos Normativos**`, { indent: false }),
    body(
      `Elaboração de estudos para subsidiar minutas de projeto de lei, decretos regulamentadores, regimento ` +
        `interno do fundo especial e demais instrumentos necessários à operação.`
    ),
    body(`**Etapa IV – Modelagem de Estruturação**`, { indent: false }),
    body(
      `Apresentação de modelo de estruturação para distribuição de ativos financeiros, elaboração de estudos ` +
        `licitatórios, estimativa de valores a captar, sugestão de agências de rating e relatórios de precificação.`
    ),
    body(`**Etapa V – Apoio ao Processo Licitatório**`, { indent: false }),
    body(
      `Suporte técnico no processo de licitação para contratação da instituição financeira, acompanhamento da ` +
        `execução, validação de conformidade com legislação vigente e apoio na destinação dos recursos captados.`
    ),

    heading("3. Equipe Técnica"),
    body(
      `Para o cumprimento dos objetivos fixados, a equipe técnica responsável pelo desenvolvimento do projeto ` +
        `será formada por profissionais do quadro de consultores da FIA. Essa equipe será multidisciplinar, ` +
        `composta por professores, pesquisadores e consultores com experiência compatível com as exigências do trabalho.`
    ),
    body(
      `A coordenação do projeto caberá ao Coordenador Geral e ao Consultor Sênior Principal, responsáveis globais ` +
        `pelo planejamento dos trabalhos, pela gestão da equipe técnica alocada e pelo acompanhamento da execução.`
    ),
    body(
      `O ${enteNome}, como entidade interessada e contratante do serviço, de sua parte, também deverá designar os ` +
        `responsáveis pelo acompanhamento dos trabalhos e pelo fornecimento dos dados, documentos e informações necessários.`
    ),
    body(
      `Ainda, caberá ao ${enteNome} o assessoramento e o suporte sobre questionamentos que surjam ao longo do ` +
        `desenvolvimento dos trabalhos, de modo a contribuir com o melhor resultado.`
    ),

    heading("4. Prazos"),
    body(
      `O contrato terá duração de ${prazoExtenso} meses, contados da data de assinatura, com possibilidade de ` +
        `prorrogação nos termos dos arts. 106 e 107 da Lei n°14.133/2021, desde que demonstrada sua vantajosidade.`
    ),
    body(`Os prazos deverão ser iniciados em até 10 (dias) uteis após a emissão da Ordem de Serviço.`),
    body(
      `As cinco etapas do projeto estão distribuídas ao longo desses ${data.prazoMeses} meses, iniciando com a ` +
        `análise legal e normativa no primeiro mês e finalizando com o apoio técnico no processo licitatório e ` +
        `acompanhamento da instituição financeira contratada até o mês ${data.prazoMeses}.`
    ),
    body(
      `Dessa forma, para a elaboração do escopo proposto na solicitação e detalhado nesta proposta, a execução ` +
        `observará duas fases, conforme o cronograma a seguir:`
    ),

    heading("5. Cronograma"),
    cronogramaTable(data),
    blank(),
    body(
      `O prazo é aproximado e seu cumprimento depende, principalmente, da disponibilização tempestiva dos dados, ` +
        `dossiês e informações necessários e da disponibilidade do pessoal do ${enteNome} para reuniões de ` +
        `trabalho e validação. Dado que não se trata de um trabalho padronizado, a mobilização do pessoal da ` +
        `organização, de maneira eficaz e tempestiva, será fundamental para que seja cumprido o prazo pretendido.`
    ),

    heading("6. Honorários"),
    body(
      `Os honorários propostos foram estabelecidos em função do volume de trabalho que se estima incorrer e dos ` +
        `profissionais alocados à sua execução, considerando-se fatores como prazos e complexidade dos trabalhos a ` +
        `serem desenvolvidos, assim como nas despesas estimadas para a execução dos serviços.`
    ),
    body(
      `Os valores dos honorários são de ${honorariosTotal}, os quais deverão ser pagos em ${parcelasExtenso} ` +
        `parcelas mensais, distribuídas em ${parcelasExtenso} parcelas de ${honorariosParcela}.`
    ),

    heading("7. Requisitos para Desenvolvimento"),
    body(
      `O escopo dos trabalhos pressupõe a disponibilidade de informações no formato, na quantidade, nos prazos e ` +
        `qualidade adequados para sua execução. Em casos de informações que não estejam disponíveis, no todo ou em ` +
        `parte, será adotada a metodologia mais adequada às informações existentes. Para efetiva realização das ` +
        `análises técnicas, será fundamental a colaboração do ${enteNome}, no fornecimento de todas as informações ` +
        `pertinentes à elaboração dos estudos, incluindo dados de arrecadação, dívida ativa, créditos tributários e ` +
        `não tributários inadimplidos e demais informações de natureza fiscal e orçamentária.`
    ),

    heading("8. Atestado de Capacidade Técnica e Termo de Conclusão"),
    body(
      `Ao término do projeto, será solicitada à Contratante a emissão de Atestado de Capacidade Técnica, ` +
        `comprovando a prestação dos serviços acordados, bem como a celebração de Termo de Conclusão dos trabalhos.`
    ),

    heading("9. Confidencialidade"),
    body(
      `A **FIA** guardará sigilo de todas as informações confidenciais eventualmente obtidas ou às quais venha a ` +
        `ter acesso no desenvolvimento de suas atividades, incluindo dados, dossiês e informações dos mutuários, ` +
        `comprometendo-se a demandar igual compromisso dos consultores envolvidos. As partes observarão a Lei Geral ` +
        `de Proteção de Dados (Lei nº 13.709/2018) e a legislação aplicável ao setor financeiro. Reconhece-se de ` +
        `uso exclusivo do **${enteNome}** toda e qualquer informação confidencial transmitida no âmbito deste contrato.`
    ),

    heading("10. Realização de Trabalhos Acadêmicos e Divulgação"),
    body(
      `Os resultados dos projetos conduzidos pela **FIA** podem ser estendidos à comunidade por meio de trabalhos ` +
        `acadêmicos que produzam novos conhecimentos para o meio institucional e científico, constituindo uma via ` +
        `de duas mãos: de um lado, conhecimentos acadêmicos atualizados são levados à prática das organizações; de ` +
        `outro, os profissionais envolvidos têm a oportunidade de levar estas experiências ao desenvolvimento de ` +
        `suas pesquisas e atividades acadêmicas.`
    ),
    body(
      `Nesse sentido, as informações colhidas ao longo do trabalho poderão ser utilizadas como subsídio para a ` +
        `elaboração e a divulgação de trabalhos acadêmicos por profissionais ligados à **FIA**, mediante autorização ` +
        `explícita e específica da contratante. As informações poderão ser utilizadas de forma que possibilite a ` +
        `identificação da instituição ou de modo anônimo e confidencial, conforme a autorização concedida.`
    ),

    heading("11. Considerações Finais"),
    body(
      `A presente proposta foi elaborada em observância à Lei nº 14.133/2021 e demais normas aplicáveis, ` +
        `constituindo documento técnico destinado a orientar a formalização do contrato administrativo e a ` +
        `execução dos serviços especializados de apoio ao desenvolvimento institucional da gestão orçamentária, ` +
        `fiscal e administrativa do ${enteNome}${uf ? "/" + uf : ""}.`
    ),
    body(
      `As condições, requisitos e obrigações descritos nesta proposta deverão ser integralmente observados pela ` +
        `contratada e pela Administração, servindo de parâmetro para o acompanhamento, a fiscalização, a medição, o ` +
        `pagamento e a avaliação dos resultados da contratação, em consonância com os princípios da legalidade, ` +
        `impessoalidade, moralidade, publicidade e eficiência, bem como com a busca do interesse público e do ` +
        `fortalecimento da capacidade fiscal e orçamentária do ${ente === "Município" ? "Município" : "Estado"}.`
    ),
    body(`A presente proposta tem validade por 90 (noventa) dias a partir da data de apresentação.`),
    body(
      `Por fim, a **FIA** frisa que os serviços objeto desta proposta serão desenvolvidos sob o regime de melhores esforços.`
    ),
    centered(`São Paulo, ${dataExtenso}.`),
    blank(),
    centered(`Atenciosamente,`),
    centered(`Claudio Felisoni de Angelo`),
    blank(),
    notaRodape("**CV Lattes: Claudio Felisoni de Angelo**", { primeira: true }),
    notaRodape("http://lattes.cnpq.br/8271076610806341"),
    notaRodape(
      "Presidente do Conselho do Labfin.Provar – Laboratório de Finanças e Programa de Administração de Varejo da FIA - Fundação Instituto de Administração."
    ),
    notaRodape("Presidente do IBEVAR - Instituto Brasileiro de Executivos de Varejo e Mercado de Consumo"),
    notaRodape(
      "Professor Titular do Departamento de Administração de Empresas pela FEA/USP - Faculdade de Economia, Administração e Contabilidade da Universidade de São Paulo."
    ),
    notaRodape(
      "Livre Docente do Departamento de Administração de Empresas pela FEA/USP - Faculdade de Economia, Administração e Contabilidade da Universidade de São Paulo."
    ),
    notaRodape(
      "Doutor e Mestre em Economia pela FEA/USP - Faculdade de Economia, Administração e Contabilidade da Universidade de São Paulo."
    ),
    notaRodape("Especialização em Varejo Manchester Business School."),
    notaRodape("Varejo Internacional Youngstown State University"),
  ];

  return {
    properties: {
      type: SectionType.NEXT_PAGE,
      page: {
        size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
        margin: {
          top: MARGIN_TOP,
          bottom: MARGIN_BOTTOM,
          left: MARGIN_LEFT,
          right: MARGIN_RIGHT,
          header: HEADER_DIST,
          footer: FOOTER_DIST,
        },
      },
    },
    headers: { default: buildHeader() },
    footers: { default: buildFooter() },
    children,
  };
}

export async function buildProposalDocx(data: PropostaFormData): Promise<Buffer> {
  const doc = new Document({
    sections: [buildCoverSection(data), buildBodySection(data)],
    styles: {
      default: {
        document: {
          run: { font: FONT, size: SIZE },
        },
      },
    },
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

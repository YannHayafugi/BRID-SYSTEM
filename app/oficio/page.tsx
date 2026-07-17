"use client";

/**
 * Gerador de Ofício FIA — portado do app Vite. Campos pré-preenchidos com o
 * texto padrão; o .docx baixa na hora e o ofício entra no catálogo (drop do
 * "Abrir novo processo" no Follow-up).
 */
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const LOGRADOUROS = ["Rua","Avenida","Praça","Alameda","Travessa","Estrada","Rodovia","Largo","Viela","Via","Quadra","Setor"];

function dataPorExtenso(): string {
  const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const d = new Date();
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

const PADRAO = {
  destinatario: "A PREFEITURA MUNICIPAL DE PRAIA GRANDE/SP",
  tipoLogradouro: "Rua", logradouro: "do Limão", numero: "448", complemento: "",
  bairro: "", cidadeEnd: "Praia Grande", estado: "SP",
  contrato: "34/2026", tratamento: "Senhor",
  assunto: "Solicitação de documentação e informações iniciais.",
  acNome: "João Pedro", acCargo: "Secretário de Finanças",
  abertura: "em atenção ao contrato supracitado, cujo objeto consiste na realização de estudos técnicos e financeiros voltados à melhoria das capacidades orçamentária, financeira e administrativa do Município, servimo-nos do presente para informar que nos termos pactuados e conforme cronograma estabelecido no Termo de Referência, segue ofício com a solicitação de documentos e informações iniciais necessários para esta fase.",
  etapas: "01 a 03",
  parEtapas: "Considerando, em especial, as atividades previstas nas Etapas {ETAPAS} do contrato, que envolvem levantamento, análise e modelagem de dados relacionados aos ativos, créditos tributários e não tributários, bem como fluxos financeiros do Município, faz-se necessária a disponibilização de informações estruturadas para viabilizar o adequado desenvolvimento dos estudos.",
  introDados: "Dessa forma, solicitamos a gentileza de providenciar o envio dos dados e informações constantes da planilha de requisição encaminhada em anexo a este ofício, contemplando, dentre outros aspectos:",
  itensDados: [
    "Estoque dos créditos inadimplidos há mais de 90 (noventa) dias, inscritos ou não em dívida ativa, com detalhamento por tributo, composição (principal, juros, multa e correção) e ano de lançamento;",
    "Informações sobre todos os lançamentos dos últimos 10 (dez) exercícios fiscais, por tributo, contendo informações dos que foram adimplidos no exercício, e o montante que inadimpliu em cada exercício fiscal;",
    "Base de dados dos créditos tributários e não tributários, incluindo carteira de inadimplentes, listando individualmente todos os créditos existentes, por tributo e composição do valor devido, em principal, correção, multa e juros;",
    "Fluxos mensais de arrecadação e recuperação de créditos dos últimos 10 (dez) anos, por tributo, composição e ano de lançamento;",
    "Listagem dos créditos em cobrança administrativa e judicial, no mesmo formato do item iii acima;",
  ].join("\n"),
  transicaoNormas: "Solicitamos ainda, o envio de informações relativas às normas e legislações locais aplicáveis ao tema. Considerando que o adequado desenvolvimento dos estudos previstos, em especial da Etapa 01, demanda o conhecimento do arcabouço jurídico-normativo municipal que disciplina a gestão de ativos, a constituição, inscrição, cobrança e recuperação de créditos tributários e não tributários, bem como os fluxos de arrecadação e demais procedimentos correlatos, faz-se necessária a disponibilização de tais instrumentos legais e regulamentares.",
  introNormas: "Desse modo, solicitamos a gentileza de encaminhar, em meio digital, sempre que possível, cópias integrais ou o link de acesso às seguintes normas locais, vigentes e/ou revogadas nos últimos anos, naquilo que for aplicável:",
  itensNormas: [
    "Legislação tributária municipal relacionada a:",
    "- instituição, lançamento e arrecadação de tributos;",
    "- procedimentos de inscrição em dívida ativa;",
    "- regimes especiais de tributação, isenções, anistias, remissões, parcelamentos e programas de recuperação de créditos.",
    "Normas sobre dívida ativa e cobrança de créditos, incluindo, mas não se limitando a:",
    "- leis, decretos e regulamentos que tratem da organização e gestão da dívida ativa;",
    "- normas que disponham sobre a cobrança administrativa e judicial dos créditos municipais;",
    "- rotinas, procedimentos internos, portarias, instruções normativas e ordens de serviço que disciplinem fluxo de trabalho, critérios de priorização de cobrança, formas de comunicação com contribuintes e formas de recuperação de créditos.",
    "Legislação orçamentária, financeira e de gestão fiscal relevante às receitas próprias do Município, especialmente:",
    "- dispositivos locais que complementem ou detalhem a aplicação da Lei de Responsabilidade Fiscal no âmbito municipal;",
    "- normas que tratem de controle, registro, contabilização e acompanhamento da arrecadação de receitas tributárias e não tributárias;",
    "- eventuais leis ou decretos que instituam fundos específicos vinculados à arrecadação de tributos ou à recuperação de créditos.",
    "Demais atos normativos correlatos, tais como:",
    "- leis e decretos que criem ou alterem órgãos, unidades, autarquias ou fundos responsáveis pela administração tributária, arrecadação, inscrição em dívida ativa e cobrança;",
    "- regulamentos de sistemas informatizados utilizados para gestão de créditos, desde que possuam base normativa;",
    "- quaisquer outros atos normativos que a área técnica julgar pertinentes ao escopo do contrato e que possam impactar a modelagem dos processos de arrecadação, cobrança e gestão de ativos.",
  ].join("\n"),
  posLista: "Caso existam compilações, consolidações ou códigos municipais já organizados, sua disponibilização também será de grande valia para a agilidade e qualidade dos trabalhos.",
  reforcamos: "Reforçamos que o acesso a esse conjunto de legislações e normativos locais é fundamental para assegurar que os estudos, diagnósticos e propostas a serem elaborados estejam plenamente alinhados às especificidades jurídicas e institucionais do Município, garantindo aderência legal, segurança jurídica e efetividade nas recomendações.",
  tempestividade: "Assim, ressaltamos que a tempestividade, consistência e integridade das informações são fatores críticos para o cumprimento dos prazos contratuais e para a qualidade dos estudos a serem apresentados.",
  teams: "Solicitamos ainda, se possível, que os dados sejam encaminhados no prazo de até 10 (dez) dias, bem como a indicação formal dos responsáveis pelo projeto por parte deste Município, Gestor, Fiscal do Contrato, Operacional, e das pessoas-chave que atuarão como interlocutores técnicos. Para a concessão de acesso ao ambiente colaborativo de dados (Microsoft Teams), solicitamos o envio de: Nome completo, departamento, e-mail corporativo e telefone de contato.",
  sharepointPrazo: "Solicitamos ainda, se possível, que os dados sejam encaminhados no prazo de até 10 (dez) dias, bem como a indicação formal dos responsáveis pelo projeto por parte deste Município, Gestor, Fiscal do Contrato, Operacional, e das pessoas-chave que atuarão como interlocutores técnicos. Para a concessão de acesso ao ambiente colaborativo de dados (Microsoft SHAREPOINT), solicitamos o envio de: Nome completo, departamento, e-mail corporativo e telefone de contato.",
  sp1: "Informamos que todos os dados e informações acima elencados deverão ser disponibilizados exclusivamente por meio da plataforma SharePoint desta Fundação, ambiente que será disponibilizado especificamente para este projeto.",
  sp2: "Solicitamos que a Prefeitura indique, em resposta a este ofício, os nomes, cargos e e-mails institucionais das pessoas que deverão ter acesso ao repositório, para que os respectivos acessos sejam providenciados.",
  sp3: "Ressaltamos que o SharePoint será o único meio autorizado para a troca de dados e documentos entre as partes no âmbito deste projeto, não devendo ser utilizados e-mail, aplicativos de mensagem ou quaisquer outros canais para o envio de arquivos, de modo a garantir a segurança, a rastreabilidade e a organização das informações compartilhadas.",
  reuniao: "Na oportunidade aproveitamos para solicitar indicação de melhor data para reunirmos e realizarmos a abertura do projeto com nossa reunião inaugural.",
  encerramento: "Desde já nos colocamos à disposição para quaisquer esclarecimentos que se façam necessários e aproveitamos a oportunidade para renovar nossos protestos de elevada estima e consideração.",
  cidade: "São Paulo",
  assinatura: "FUNDAÇÃO INSTITUTO DE ADMINISTRAÇÃO – FIA",
};

const lbl: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 10 };
const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid var(--borda)", borderRadius: 8, marginTop: 4, fontFamily: "inherit" };

export default function OficioPage() {
  return (
    <Suspense>
      <OficioConteudo />
    </Suspense>
  );
}

function OficioConteudo() {
  const searchParams = useSearchParams();
  // D14: quando aberto a partir de um processo do Follow-up (já com Proposta
  // aprovada), o ofício gerado é vinculado automaticamente a esse processo.
  const processoId = searchParams.get("processo");
  const [f, setF] = useState({ ...PADRAO, data: dataPorExtenso() });
  const [gerando, setGerando] = useState(false);
  const [msg, setMsg] = useState("");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  function montarEndereco(): string[] {
    const l1 = [`${f.tipoLogradouro} ${f.logradouro}`.trim(), f.numero].filter(Boolean).join(", ") +
      (f.complemento ? ` – ${f.complemento}` : "");
    const l2 = [f.bairro, [f.cidadeEnd, f.estado].filter(Boolean).join(" – ")].filter(Boolean).join(", ");
    return [l1, l2].filter(Boolean);
  }

  const linhas = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

  async function gerar(e: React.FormEvent) {
    e.preventDefault();
    setGerando(true);
    setMsg("");
    const artigo = f.tratamento === "Senhor" ? "Ilustríssimo Senhor" : "Ilustríssima Senhora";
    const payload = {
      destinatario_nome: f.destinatario,
      destinatario_endereco: montarEndereco(),
      numero_contrato: f.contrato,
      assunto: f.assunto,
      ac_nome: f.acNome.trim(),
      ac_cargo: f.acCargo.trim(),
      saudacao: f.acNome.trim() ? `${artigo} ${f.acNome.trim()}` : artigo,
      paragrafo_abertura: f.abertura,
      etapas: f.etapas,
      paragrafo_etapas: f.parEtapas,
      introducao_lista_dados: f.introDados,
      itens_lista_dados: linhas(f.itensDados),
      paragrafo_transicao_normas: f.transicaoNormas,
      introducao_lista_normas: f.introNormas,
      itens_lista_normas: linhas(f.itensNormas).map((l) =>
        l.startsWith("-") ? { text: l.replace(/^-+\s*/, ""), level: 1 } : { text: l, level: 0 }),
      paragrafo_pos_lista: f.posLista,
      paragrafo_reforcamos: f.reforcamos,
      paragrafo_tempestividade: f.tempestividade,
      paragrafo_teams: f.teams,
      paragrafo_sharepoint_prazo: f.sharepointPrazo,
      sharepoint_exclusividade1: f.sp1,
      sharepoint_exclusividade2: f.sp2,
      sharepoint_exclusividade3: f.sp3,
      paragrafo_reuniao: f.reuniao,
      paragrafo_encerramento: f.encerramento,
      cidade_emissao: f.cidade,
      data_extenso: f.data,
      assinatura: f.assinatura,
      processoId: processoId || undefined,
    };
    try {
      const r = await fetch("/api/oficio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || `Erro ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Oficio - Contrato ${f.contrato.replace(/\//g, "-")}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(
        processoId
          ? "✅ Ofício gerado e vinculado ao processo — download iniciado."
          : "✅ Ofício gerado — download iniciado. Ele já está no drop do Follow-up."
      );
    } catch (err) {
      setMsg(`❌ ${err instanceof Error ? err.message : err}`);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="page">
      <Link href="/followup" className="btn-doc" title="Voltar para o Follow-up">← Voltar ao Follow-up</Link>
      <h1 style={{ fontSize: 22, margin: "16px 0 4px" }}>Gerador de Ofício</h1>
      <p className="detalhe" style={{ marginBottom: 20 }}>
        Ofício de formalização (layout FIA). Os campos já vêm com o texto padrão — ajuste e gere o .docx.
      </p>

      <form onSubmit={gerar}>
        <details open className="card">
          <summary style={{ fontWeight: 700, cursor: "pointer" }}>Destinatário e referência</summary>
          <div style={{ marginTop: 14 }}>
            <label style={lbl}>Destinatário<input style={inp} value={f.destinatario} onChange={set("destinatario")} required /></label>
            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 90px", gap: 10 }}>
              <label style={lbl}>Logradouro
                <select style={inp} value={f.tipoLogradouro} onChange={set("tipoLogradouro")}>
                  {LOGRADOUROS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label style={lbl}>Endereço<input style={inp} value={f.logradouro} onChange={set("logradouro")} /></label>
              <label style={lbl}>Número<input style={inp} value={f.numero} onChange={set("numero")} /></label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 80px", gap: 10 }}>
              <label style={lbl}>Complemento<input style={inp} value={f.complemento} onChange={set("complemento")} /></label>
              <label style={lbl}>Bairro<input style={inp} value={f.bairro} onChange={set("bairro")} /></label>
              <label style={lbl}>Cidade<input style={inp} value={f.cidadeEnd} onChange={set("cidadeEnd")} /></label>
              <label style={lbl}>UF
                <select style={inp} value={f.estado} onChange={set("estado")}>
                  {UFS.map((u) => <option key={u}>{u}</option>)}
                </select>
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={lbl}>Nº do contrato<input style={inp} value={f.contrato} onChange={set("contrato")} required /></label>
              <label style={lbl}>Tratamento
                <select style={inp} value={f.tratamento} onChange={set("tratamento")}>
                  <option>Senhor</option><option>Senhora</option>
                </select>
              </label>
            </div>
            <label style={lbl}>Assunto<input style={inp} value={f.assunto} onChange={set("assunto")} required /></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={lbl}>A/C — Nome<input style={inp} value={f.acNome} onChange={set("acNome")} /></label>
              <label style={lbl}>A/C — Cargo<input style={inp} value={f.acCargo} onChange={set("acCargo")} /></label>
            </div>
          </div>
        </details>

        <details className="card">
          <summary style={{ fontWeight: 700, cursor: "pointer" }}>Corpo do ofício (textos padrão editáveis)</summary>
          <div style={{ marginTop: 14 }}>
            <label style={lbl}>Abertura<textarea style={inp} rows={4} value={f.abertura} onChange={set("abertura")} /></label>
            <label style={lbl}>Etapas (ex.: 01 a 03)<input style={inp} value={f.etapas} onChange={set("etapas")} /></label>
            <label style={lbl}>Parágrafo das etapas — marcador {"{ETAPAS}"}<textarea style={inp} rows={4} value={f.parEtapas} onChange={set("parEtapas")} /></label>
            <label style={lbl}>Introdução da lista de dados<textarea style={inp} rows={3} value={f.introDados} onChange={set("introDados")} /></label>
            <label style={lbl}>Itens de dados (um por linha)<textarea style={inp} rows={7} value={f.itensDados} onChange={set("itensDados")} /></label>
            <label style={lbl}>Transição sobre normas<textarea style={inp} rows={4} value={f.transicaoNormas} onChange={set("transicaoNormas")} /></label>
            <label style={lbl}>Introdução da lista de normas<textarea style={inp} rows={3} value={f.introNormas} onChange={set("introNormas")} /></label>
            <label style={lbl}>Itens de normas (um por linha; comece com &quot;-&quot; para subitem a, b, c)<textarea style={inp} rows={12} value={f.itensNormas} onChange={set("itensNormas")} /></label>
            <label style={lbl}>Pós-lista<textarea style={inp} rows={3} value={f.posLista} onChange={set("posLista")} /></label>
            <label style={lbl}>Reforçamos<textarea style={inp} rows={3} value={f.reforcamos} onChange={set("reforcamos")} /></label>
            <label style={lbl}>Tempestividade<textarea style={inp} rows={3} value={f.tempestividade} onChange={set("tempestividade")} /></label>
            <label style={lbl}>Ambiente colaborativo — Teams<textarea style={inp} rows={4} value={f.teams} onChange={set("teams")} /></label>
            <label style={lbl}>Ambiente colaborativo — SharePoint<textarea style={inp} rows={4} value={f.sharepointPrazo} onChange={set("sharepointPrazo")} /></label>
            <label style={lbl}>Exclusividade SharePoint — parágrafo 1<textarea style={inp} rows={3} value={f.sp1} onChange={set("sp1")} /></label>
            <label style={lbl}>Exclusividade SharePoint — parágrafo 2<textarea style={inp} rows={3} value={f.sp2} onChange={set("sp2")} /></label>
            <label style={lbl}>Exclusividade SharePoint — parágrafo 3<textarea style={inp} rows={3} value={f.sp3} onChange={set("sp3")} /></label>
            <label style={lbl}>Reunião inaugural<textarea style={inp} rows={3} value={f.reuniao} onChange={set("reuniao")} /></label>
            <label style={lbl}>Encerramento<textarea style={inp} rows={3} value={f.encerramento} onChange={set("encerramento")} /></label>
          </div>
        </details>

        <details open className="card">
          <summary style={{ fontWeight: 700, cursor: "pointer" }}>Fecho</summary>
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={lbl}>Cidade de emissão<input style={inp} value={f.cidade} onChange={set("cidade")} /></label>
              <label style={lbl}>Data por extenso<input style={inp} value={f.data} onChange={set("data")} /></label>
            </div>
            <label style={lbl}>Assinatura<input style={inp} value={f.assinatura} onChange={set("assinatura")} /></label>
          </div>
        </details>

        <button type="submit" className="btn-azul" disabled={gerando}
          title="Montar o ofício com o layout FIA, baixar o .docx e adicioná-lo ao drop do Follow-up">
          {gerando ? "Gerando..." : "Gerar Ofício (.docx)"}
        </button>
        {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
      </form>
    </div>
  );
}

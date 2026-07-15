// ---------- estado ----------
let senha = localStorage.getItem("senha") || "";
let arquivo = null;

const $ = (id) => document.getElementById(id);

// ---------- login ----------
async function tentarLogin(s) {
  const fd = new FormData();
  fd.append("senha", s);
  const resp = await fetch("/api/login", { method: "POST", body: fd });
  return resp.ok;
}

function mostrarApp() {
  $("tela-login").hidden = true;
  $("app").hidden = false;
  carregarListas(); // aba inicial é o Follow-up
  carregarOficios();
}

function mostrarLogin() {
  localStorage.removeItem("senha");
  senha = "";
  $("app").hidden = true;
  $("tela-login").hidden = false;
}

$("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const s = $("senha-login").value;
  if (await tentarLogin(s)) {
    senha = s;
    localStorage.setItem("senha", s);
    mostrarApp();
  } else {
    $("erro-login").hidden = false;
    $("erro-login").textContent = "Senha incorreta.";
  }
});

$("sair").addEventListener("click", mostrarLogin);

// sessão anterior ainda válida?
if (senha) tentarLogin(senha).then((ok) => (ok ? mostrarApp() : mostrarLogin()));

// ---------- abas ----------
document.querySelectorAll(".aba").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".aba").forEach((b) => b.classList.remove("ativa"));
    btn.classList.add("ativa");
    ["followup", "gerador", "oficios", "arquivos"].forEach((n) => ($(`aba-${n}`).hidden = n !== btn.dataset.aba));
    if (["followup", "arquivos"].includes(btn.dataset.aba)) carregarListas();
    if (btn.dataset.aba === "followup") carregarOficios();
  })
);

// ---------- gerador ----------
const dropzone = $("dropzone");

function setArquivo(f) {
  arquivo = f;
  $("dz-texto").textContent = f ? `📄 ${f.name}` : "Arraste o TR aqui ou clique para selecionar";
  $("btn").disabled = !f;
}

$("arquivo").addEventListener("change", () => setArquivo($("arquivo").files[0]));

["dragover", "dragleave", "drop"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.toggle("ativo", ev === "dragover");
    if (ev === "drop" && e.dataTransfer.files.length) setArquivo(e.dataTransfer.files[0]);
  })
);

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!arquivo) return;

  $("btn").disabled = true;
  $("resultado").hidden = true;
  const status = $("status");
  status.hidden = false;
  status.className = "info";
  status.textContent = "⏳ Analisando o TR e gerando a proposta... (30–90 s)";

  const fd = new FormData();
  fd.append("arquivo", arquivo);
  fd.append("senha", senha);

  try {
    const resp = await fetch("/api/gerar", { method: "POST", body: fd });
    if (resp.status === 401) return mostrarLogin();
    if (resp.status === 504) throw new Error("O servidor demorou demais para responder (timeout). Tente novamente ou use um TR menor.");
    const texto = await resp.text();
    let dados;
    try {
      dados = JSON.parse(texto);
    } catch {
      throw new Error(`Erro no servidor (${resp.status}): ${texto.slice(0, 200)}`);
    }
    if (!resp.ok) throw new Error(dados.detail || "Erro desconhecido");

    status.hidden = true;
    $("resultado").hidden = false;
    $("titulo-proposta").textContent = dados.titulo || "Proposta gerada";
    $("dl-proposta").href = dados.downloads.proposta;
    $("dl-resumo").href = dados.downloads.resumo;

    const r = dados.resumo || {};
    const dl = $("resumo-info");
    dl.innerHTML = "";
    const campos = {
      Cliente: r.cliente,
      Objeto: r.objeto,
      Prazo: r.prazo,
      "Valor de referência": r.valor_referencia,
      "Escopo principal": (r.escopo_resumido || []).join("; "),
      Destaques: (r.destaques || []).join("; "),
    };
    for (const [k, v] of Object.entries(campos)) {
      if (!v) continue;
      dl.insertAdjacentHTML("beforeend", `<dt>${k}</dt><dd>${v}</dd>`);
    }
  } catch (err) {
    status.className = "erro";
    status.textContent = `❌ ${err.message}`;
  } finally {
    $("btn").disabled = !arquivo;
  }
});

// ---------- listas (enviados / gerados) ----------
function fmtData(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

async function carregarListas() {
  const resp = await fetch("/api/propostas", { headers: { "X-Senha": senha } });
  if (resp.status === 401) return mostrarLogin();
  const { propostas, etapas } = await resp.json();

  const enviados = $("lista-enviados");
  const gerados = $("lista-gerados");
  const followup = $("lista-followup");
  enviados.innerHTML = "";
  gerados.innerHTML = "";
  followup.innerHTML = "";

  if (!propostas.length) {
    enviados.innerHTML = gerados.innerHTML = followup.innerHTML =
      "<p class='vazio'>Nenhuma proposta gerada ainda.</p>";
    return;
  }

  for (const p of propostas) renderFollowup(p, etapas || []);

  for (const p of propostas) {
    if (!p.tr_nome) continue; // processos abertos só por ofício não têm TR/gerados ainda
    enviados.insertAdjacentHTML(
      "beforeend",
      `<div class="item">
        <div>
          <strong>📄 ${p.tr_nome}</strong>
          <span class="detalhe">${fmtData(p.data)} — gerou: ${p.titulo}</span>
        </div>
        <a class="btn-dl btn-sec" href="${p.tr_url}" title="Baixar o Termo de Referência original">⬇ Baixar TR</a>
      </div>`
    );

    const links = Object.entries(p.downloads)
      .map(([nome, url]) => `<a class="btn-dl" href="${url}" title="Baixar ${nome === "proposta" ? "a proposta completa" : "o resumo executivo"} (.docx)">⬇ ${nome === "proposta" ? "Proposta" : "Resumo"}.docx</a>`)
      .join("");
    gerados.insertAdjacentHTML(
      "beforeend",
      `<div class="item item-col">
        <div>
          <strong>${p.titulo}</strong>
          <span class="detalhe">${p.cliente ? p.cliente + " — " : ""}${fmtData(p.data)}</span>
        </div>
        <div class="downloads">${links}</div>
      </div>`
    );
  }

  if (!enviados.innerHTML) enviados.innerHTML = "<p class='vazio'>Nenhum TR enviado ainda.</p>";
  if (!gerados.innerHTML) gerados.innerHTML = "<p class='vazio'>Nenhum documento gerado ainda.</p>";
}

// ---------- abrir processo (ofício) ----------
let oficiosGerados = [];

async function carregarOficios() {
  try {
    const r = await fetch("/api/oficios", { headers: { "X-Senha": senha } });
    if (!r.ok) return;
    oficiosGerados = (await r.json()).oficios || [];
    const sel = $("pj-oficio-sel");
    const atual = sel.value;
    sel.options.length = 1; // mantém só o placeholder
    for (const o of oficiosGerados) {
      const opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = `${o.assunto || "Sem assunto"} — ${o.destinatario} (${fmtData(o.data)})`;
      sel.appendChild(opt);
    }
    sel.value = atual;
  } catch { /* drop fica vazio; anexo externo continua disponível */ }
}

// de-para: Título ← Assunto | Cliente ← Destinatário
$("pj-oficio-sel").addEventListener("change", () => {
  const o = oficiosGerados.find((x) => x.id === $("pj-oficio-sel").value);
  if (!o) return;
  $("pj-titulo").value = o.assunto || "";
  $("pj-cliente").value = o.destinatario || "";
  $("pj-oficio").value = ""; // ofício gerado dispensa o anexo externo
  $("pj-oficio-nome").textContent = "";
});

// atalhos de navegação
$("ir-oficio").addEventListener("click", () => document.querySelector('.aba[data-aba="oficios"]').click());
$("ir-proposta").addEventListener("click", () => document.querySelector('.aba[data-aba="gerador"]').click());

$("pj-oficio").addEventListener("change", () => {
  $("pj-oficio-nome").textContent = $("pj-oficio").files.length ? `📎 ${$("pj-oficio").files[0].name}` : "";
  if ($("pj-oficio").files.length) $("pj-oficio-sel").value = ""; // anexo externo dispensa o drop
});

$("form-projeto").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("btn-projeto").disabled = true;
  const fd = new FormData();
  fd.append("titulo", $("pj-titulo").value);
  fd.append("cliente", $("pj-cliente").value);
  fd.append("senha", senha);
  fd.append("oficio_id", $("pj-oficio-sel").value);
  if ($("pj-oficio").files.length) fd.append("arquivo", $("pj-oficio").files[0]);
  try {
    const r = await fetch("/api/projetos", { method: "POST", body: fd });
    if (r.status === 401) return mostrarLogin();
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `Erro ${r.status}`);
    $("form-projeto").reset();
    $("pj-oficio-nome").textContent = "";
    carregarListas();
  } catch (err) {
    alert(`❌ ${err.message}`);
  } finally {
    $("btn-projeto").disabled = false;
  }
});

// ---------- follow-up ----------
function renderFollowup(p, etapas) {
  const fu = p.followup || { etapa: 2, documentos: {} };
  const pct = etapas.length ? Math.round(((fu.etapa + 1) / etapas.length) * 100) : 0;
  const opcoes = etapas
    .map((e, i) => `<option value="${i}" ${i === fu.etapa ? "selected" : ""}>${i + 1}. ${e}</option>`)
    .join("");

  const oficio = (fu.documentos || {}).oficio;
  const docOficio = oficio
    ? `<a class="btn-dl btn-sec" href="/api/download-doc/${p.job_id}/oficio" title="Baixar o ofício anexado a este processo">📎 Ofício</a>
       <label class="btn-doc" title="Enviar outro arquivo no lugar do ofício atual">↻ Substituir<input type="file" hidden data-job="${p.job_id}" class="up-oficio" /></label>`
    : `<label class="btn-doc pendente" title="Enviar o arquivo do ofício deste processo (PDF, DOCX ou imagem)">＋ Anexar Ofício<input type="file" hidden data-job="${p.job_id}" class="up-oficio" /></label>`;

  const docTR = p.tr_url
    ? `<a class="btn-dl btn-sec" href="${p.tr_url}" title="TR enviado — clique para baixar">📎 TR (enviado)</a>
       <label class="btn-doc" title="Enviar outro arquivo no lugar do TR atual">↻ Substituir TR<input type="file" hidden data-job="${p.job_id}" class="up-tr" accept=".pdf,.docx,.txt,.md" /></label>`
    : `<label class="btn-doc pendente" title="Enviar o Termo de Referência deste processo (PDF, DOCX ou TXT) — ele será usado para gerar a proposta">＋ Enviar TR<input type="file" hidden data-job="${p.job_id}" class="up-tr" accept=".pdf,.docx,.txt,.md" /></label>`;
  const docProposta = (p.downloads || {}).proposta
    ? `<a class="btn-dl btn-sec" href="${p.downloads.proposta}" title="Baixar a proposta gerada (.docx)">📎 Proposta</a>
       <a class="btn-dl btn-sec" href="${p.downloads.resumo}" title="Baixar o resumo executivo (.docx)">📎 Resumo</a>`
    : p.tr_url
      ? `<button type="button" class="btn-doc fu-gerar" data-job="${p.job_id}" title="Analisar o TR com IA e gerar a Proposta e o Resumo deste processo (30–90 s)">⚙ Gerar Proposta</button>`
      : `<span class="btn-doc pendente" title="Envie o TR primeiro — o botão de gerar a proposta aparece em seguida">Proposta (envie o TR primeiro)</span>`;

  $("lista-followup").insertAdjacentHTML(
    "beforeend",
    `<div class="item item-col">
      <div class="fu-topo">
        <button type="button" class="fu-excluir" data-job="${p.job_id}" data-titulo="${p.titulo.replace(/"/g, "&quot;")}" title="Excluir este processo e seus arquivos">🗑</button>
        <strong>${p.titulo}</strong>
        <span class="detalhe">${p.cliente ? p.cliente + " — " : ""}${fmtData(p.data)}</span>
      </div>
      <div class="fu-progresso" title="Progresso: fase ${fu.etapa + 1} de ${etapas.length}"><div class="fu-barra" style="width:${pct}%"></div></div>
      <select class="fu-etapa" data-job="${p.job_id}" title="Selecionar a fase atual do processo no fluxo">${opcoes}</select>
      <div class="fu-docs">
        <span class="detalhe">Documentos essenciais:</span>
        <div class="downloads">${docOficio}${docTR}${docProposta}</div>
      </div>
    </div>`
  );
}

// gerar proposta dentro do processo (usa o TR enviado)
document.addEventListener("click", async (e) => {
  const g = e.target.closest(".fu-gerar");
  if (!g) return;
  g.disabled = true;
  g.textContent = "⏳ Gerando... (30–90 s)";
  const fd = new FormData();
  fd.append("senha", senha);
  try {
    const r = await fetch(`/api/followup/${g.dataset.job}/gerar`, { method: "POST", body: fd });
    if (r.status === 401) return mostrarLogin();
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados.detail || `Erro ${r.status}`);
  } catch (err) {
    alert(`❌ ${err.message}`);
  }
  carregarListas();
});

// excluir processo (com confirmação)
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".fu-excluir");
  if (!btn) return;
  if (!confirm(`Excluir o processo "${btn.dataset.titulo}"?\n\nOs arquivos gerados dele também serão removidos. Esta ação não pode ser desfeita.`)) return;
  const r = await fetch(`/api/projetos/${btn.dataset.job}`, { method: "DELETE", headers: { "X-Senha": senha } });
  if (r.status === 401) return mostrarLogin();
  if (!r.ok) alert((await r.json().catch(() => ({}))).detail || "Erro ao excluir.");
  carregarListas();
});

document.addEventListener("change", async (e) => {
  // mudança de etapa
  if (e.target.classList.contains("fu-etapa")) {
    const fd = new FormData();
    fd.append("etapa", e.target.value);
    fd.append("senha", senha);
    const r = await fetch(`/api/followup/${e.target.dataset.job}/etapa`, { method: "POST", body: fd });
    if (r.status === 401) return mostrarLogin();
    carregarListas();
  }
  // upload de TR no card do processo
  if (e.target.classList.contains("up-tr") && e.target.files.length) {
    const fd = new FormData();
    fd.append("arquivo", e.target.files[0]);
    fd.append("senha", senha);
    const r = await fetch(`/api/followup/${e.target.dataset.job}/tr`, { method: "POST", body: fd });
    if (r.status === 401) return mostrarLogin();
    if (!r.ok) alert((await r.json().catch(() => ({}))).detail || "Erro ao enviar o TR.");
    carregarListas();
  }
  // upload de ofício
  if (e.target.classList.contains("up-oficio") && e.target.files.length) {
    const fd = new FormData();
    fd.append("arquivo", e.target.files[0]);
    fd.append("tipo", "oficio");
    fd.append("senha", senha);
    const r = await fetch(`/api/followup/${e.target.dataset.job}/documento`, { method: "POST", body: fd });
    if (r.status === 401) return mostrarLogin();
    if (!r.ok) alert((await r.json().catch(() => ({}))).detail || "Erro ao anexar.");
    carregarListas();
  }
});

// ---------- ofícios ----------
const OFICIO_PADRAO = {
  destinatario: "A PREFEITURA MUNICIPAL DE PRAIA GRANDE/SP",
  tipoLogradouro: "Rua",
  logradouro: "do Limão",
  numeroEnd: "448",
  complemento: "",
  bairro: "",
  cidadeEnd: "Praia Grande",
  estado: "SP",
  contrato: "34/2026",
  assunto: "Solicitação de documentação e informações iniciais.",
  acNome: "João Pedro",
  acCargo: "Secretário de Finanças",
  abertura:
    "em atenção ao contrato supracitado, cujo objeto consiste na realização de estudos técnicos e financeiros voltados à melhoria das capacidades orçamentária, financeira e administrativa do Município, servimo-nos do presente para informar que nos termos pactuados e conforme cronograma estabelecido no Termo de Referência, segue ofício com a solicitação de documentos e informações iniciais necessários para esta fase.",
  etapas: "01 a 03",
  parEtapas:
    "Considerando, em especial, as atividades previstas nas Etapas {ETAPAS} do contrato, que envolvem levantamento, análise e modelagem de dados relacionados aos ativos, créditos tributários e não tributários, bem como fluxos financeiros do Município, faz-se necessária a disponibilização de informações estruturadas para viabilizar o adequado desenvolvimento dos estudos.",
  introDados:
    "Dessa forma, solicitamos a gentileza de providenciar o envio dos dados e informações constantes da planilha de requisição encaminhada em anexo a este ofício, contemplando, dentre outros aspectos:",
  itensDados: [
    "Estoque dos créditos inadimplidos há mais de 90 (noventa) dias, inscritos ou não em dívida ativa, com detalhamento por tributo, composição (principal, juros, multa e correção) e ano de lançamento;",
    "Informações sobre todos os lançamentos dos últimos 10 (dez) exercícios fiscais, por tributo, contendo informações dos que foram adimplidos no exercício, e o montante que inadimpliu em cada exercício fiscal;",
    "Base de dados dos créditos tributários e não tributários, incluindo carteira de inadimplentes, listando individualmente todos os créditos existentes, por tributo e composição do valor devido, em principal, correção, multa e juros;",
    "Fluxos mensais de arrecadação e recuperação de créditos dos últimos 10 (dez) anos, por tributo, composição e ano de lançamento;",
    "Listagem dos créditos em cobrança administrativa e judicial, no mesmo formato do item iii acima;",
  ].join("\n"),
  transicaoNormas:
    "Solicitamos ainda, o envio de informações relativas às normas e legislações locais aplicáveis ao tema. Considerando que o adequado desenvolvimento dos estudos previstos, em especial da Etapa 01, demanda o conhecimento do arcabouço jurídico-normativo municipal que disciplina a gestão de ativos, a constituição, inscrição, cobrança e recuperação de créditos tributários e não tributários, bem como os fluxos de arrecadação e demais procedimentos correlatos, faz-se necessária a disponibilização de tais instrumentos legais e regulamentares.",
  introNormas:
    "Desse modo, solicitamos a gentileza de encaminhar, em meio digital, sempre que possível, cópias integrais ou o link de acesso às seguintes normas locais, vigentes e/ou revogadas nos últimos anos, naquilo que for aplicável:",
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
  posLista:
    "Caso existam compilações, consolidações ou códigos municipais já organizados, sua disponibilização também será de grande valia para a agilidade e qualidade dos trabalhos.",
  reforcamos:
    "Reforçamos que o acesso a esse conjunto de legislações e normativos locais é fundamental para assegurar que os estudos, diagnósticos e propostas a serem elaborados estejam plenamente alinhados às especificidades jurídicas e institucionais do Município, garantindo aderência legal, segurança jurídica e efetividade nas recomendações.",
  tempestividade:
    "Assim, ressaltamos que a tempestividade, consistência e integridade das informações são fatores críticos para o cumprimento dos prazos contratuais e para a qualidade dos estudos a serem apresentados.",
  teams:
    "Solicitamos ainda, se possível, que os dados sejam encaminhados no prazo de até 10 (dez) dias, bem como a indicação formal dos responsáveis pelo projeto por parte deste Município, Gestor, Fiscal do Contrato, Operacional, e das pessoas-chave que atuarão como interlocutores técnicos. Para a concessão de acesso ao ambiente colaborativo de dados (Microsoft Teams), solicitamos o envio de: Nome completo, departamento, e-mail corporativo e telefone de contato.",
  sharepointPrazo:
    "Solicitamos ainda, se possível, que os dados sejam encaminhados no prazo de até 10 (dez) dias, bem como a indicação formal dos responsáveis pelo projeto por parte deste Município, Gestor, Fiscal do Contrato, Operacional, e das pessoas-chave que atuarão como interlocutores técnicos. Para a concessão de acesso ao ambiente colaborativo de dados (Microsoft SHAREPOINT), solicitamos o envio de: Nome completo, departamento, e-mail corporativo e telefone de contato.",
  sp1: "Informamos que todos os dados e informações acima elencados deverão ser disponibilizados exclusivamente por meio da plataforma SharePoint desta Fundação, ambiente que será disponibilizado especificamente para este projeto.",
  sp2: "Solicitamos que a Prefeitura indique, em resposta a este ofício, os nomes, cargos e e-mails institucionais das pessoas que deverão ter acesso ao repositório, para que os respectivos acessos sejam providenciados.",
  sp3: "Ressaltamos que o SharePoint será o único meio autorizado para a troca de dados e documentos entre as partes no âmbito deste projeto, não devendo ser utilizados e-mail, aplicativos de mensagem ou quaisquer outros canais para o envio de arquivos, de modo a garantir a segurança, a rastreabilidade e a organização das informações compartilhadas.",
  reuniao:
    "Na oportunidade aproveitamos para solicitar indicação de melhor data para reunirmos e realizarmos a abertura do projeto com nossa reunião inaugural.",
  encerramento:
    "Desde já nos colocamos à disposição para quaisquer esclarecimentos que se façam necessários e aproveitamos a oportunidade para renovar nossos protestos de elevada estima e consideração.",
  cidade: "São Paulo",
  assinatura: "FUNDAÇÃO INSTITUTO DE ADMINISTRAÇÃO – FIA",
};

function dataPorExtenso() {
  const meses = ["janeiro","fevereiro","março","abril","maio","junho",
                 "julho","agosto","setembro","outubro","novembro","dezembro"];
  const d = new Date();
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

function preencherOficioPadrao() {
  const m = {
    "of-destinatario": OFICIO_PADRAO.destinatario,
    "of-tipo-logradouro": OFICIO_PADRAO.tipoLogradouro, "of-logradouro": OFICIO_PADRAO.logradouro,
    "of-numero": OFICIO_PADRAO.numeroEnd, "of-complemento": OFICIO_PADRAO.complemento,
    "of-bairro": OFICIO_PADRAO.bairro, "of-cidade-end": OFICIO_PADRAO.cidadeEnd,
    "of-estado": OFICIO_PADRAO.estado,
    "of-contrato": OFICIO_PADRAO.contrato, "of-assunto": OFICIO_PADRAO.assunto,
    "of-ac-nome": OFICIO_PADRAO.acNome, "of-ac-cargo": OFICIO_PADRAO.acCargo,
    "of-abertura": OFICIO_PADRAO.abertura, "of-etapas": OFICIO_PADRAO.etapas,
    "of-par-etapas": OFICIO_PADRAO.parEtapas, "of-intro-dados": OFICIO_PADRAO.introDados,
    "of-itens-dados": OFICIO_PADRAO.itensDados,
    "of-transicao-normas": OFICIO_PADRAO.transicaoNormas,
    "of-intro-normas": OFICIO_PADRAO.introNormas, "of-itens-normas": OFICIO_PADRAO.itensNormas,
    "of-pos-lista": OFICIO_PADRAO.posLista, "of-reforcamos": OFICIO_PADRAO.reforcamos,
    "of-tempestividade": OFICIO_PADRAO.tempestividade, "of-teams": OFICIO_PADRAO.teams,
    "of-sharepoint-prazo": OFICIO_PADRAO.sharepointPrazo,
    "of-sp1": OFICIO_PADRAO.sp1, "of-sp2": OFICIO_PADRAO.sp2, "of-sp3": OFICIO_PADRAO.sp3,
    "of-reuniao": OFICIO_PADRAO.reuniao, "of-encerramento": OFICIO_PADRAO.encerramento,
    "of-cidade": OFICIO_PADRAO.cidade, "of-data": dataPorExtenso(),
    "of-assinatura": OFICIO_PADRAO.assinatura,
  };
  for (const [id, v] of Object.entries(m)) if ($(id)) $(id).value = v;
}
preencherOficioPadrao();

function montarEndereco() {
  const v = (id) => $(id).value.trim();
  const linha1 = [`${v("of-tipo-logradouro")} ${v("of-logradouro")}`.trim(), v("of-numero")]
    .filter(Boolean).join(", ") + (v("of-complemento") ? ` – ${v("of-complemento")}` : "");
  const linha2 = [v("of-bairro"), [v("of-cidade-end"), $("of-estado").value].filter(Boolean).join(" – ")]
    .filter(Boolean).join(", ");
  return [linha1, linha2].filter(Boolean);
}

function linhas(id) {
  return $(id).value.split("\n").map((l) => l.trim()).filter(Boolean);
}

$("form-oficio").addEventListener("submit", async (e) => {
  e.preventDefault();
  const st = $("status-oficio");
  st.hidden = false;
  st.className = "";
  st.textContent = "Gerando ofício...";
  $("btn-oficio").disabled = true;

  const tratamento = $("of-tratamento").value;
  const acNome = $("of-ac-nome").value.trim();
  const artigo = tratamento === "Senhor" ? "Ilustríssimo Senhor" : "Ilustríssima Senhora";
  const payload = {
    destinatario_nome: $("of-destinatario").value,
    destinatario_endereco: montarEndereco(),
    numero_contrato: $("of-contrato").value,
    assunto: $("of-assunto").value,
    ac_nome: acNome,
    ac_cargo: $("of-ac-cargo").value.trim(),
    saudacao: acNome ? `${artigo} ${acNome}` : artigo,
    paragrafo_abertura: $("of-abertura").value,
    etapas: $("of-etapas").value,
    paragrafo_etapas: $("of-par-etapas").value,
    introducao_lista_dados: $("of-intro-dados").value,
    itens_lista_dados: linhas("of-itens-dados"),
    paragrafo_transicao_normas: $("of-transicao-normas").value,
    introducao_lista_normas: $("of-intro-normas").value,
    itens_lista_normas: linhas("of-itens-normas").map((l) =>
      l.startsWith("-") ? { text: l.replace(/^-+\s*/, ""), level: 1 } : { text: l, level: 0 }
    ),
    paragrafo_pos_lista: $("of-pos-lista").value,
    paragrafo_reforcamos: $("of-reforcamos").value,
    paragrafo_tempestividade: $("of-tempestividade").value,
    paragrafo_teams: $("of-teams").value,
    paragrafo_sharepoint_prazo: $("of-sharepoint-prazo").value,
    sharepoint_exclusividade1: $("of-sp1").value,
    sharepoint_exclusividade2: $("of-sp2").value,
    sharepoint_exclusividade3: $("of-sp3").value,
    paragrafo_reuniao: $("of-reuniao").value,
    paragrafo_encerramento: $("of-encerramento").value,
    cidade_emissao: $("of-cidade").value,
    data_extenso: $("of-data").value,
    assinatura: $("of-assinatura").value,
  };

  try {
    const resp = await fetch("/api/oficio", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Senha": senha },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const erro = await resp.json().catch(() => ({}));
      throw new Error(erro.detail || `Erro ${resp.status}`);
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Oficio - Contrato ${payload.numero_contrato.replace(/\//g, "-")}.docx`;
    a.click();
    URL.revokeObjectURL(url);
    st.textContent = "✅ Ofício gerado — download iniciado.";
  } catch (err) {
    st.className = "erro-texto";
    st.textContent = `❌ ${err.message}`;
  } finally {
    $("btn-oficio").disabled = false;
  }
});

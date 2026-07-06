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
    ["gerador", "enviados", "gerados"].forEach((n) => ($(`aba-${n}`).hidden = n !== btn.dataset.aba));
    if (btn.dataset.aba !== "gerador") carregarListas();
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
    const dados = await resp.json();
    if (resp.status === 401) return mostrarLogin();
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
  const { propostas } = await resp.json();

  const enviados = $("lista-enviados");
  const gerados = $("lista-gerados");
  enviados.innerHTML = "";
  gerados.innerHTML = "";

  if (!propostas.length) {
    enviados.innerHTML = gerados.innerHTML = "<p class='vazio'>Nenhuma proposta gerada ainda.</p>";
    return;
  }

  for (const p of propostas) {
    enviados.insertAdjacentHTML(
      "beforeend",
      `<div class="item">
        <div>
          <strong>📄 ${p.tr_nome}</strong>
          <span class="detalhe">${fmtData(p.data)} — gerou: ${p.titulo}</span>
        </div>
        <a class="btn-dl btn-sec" href="${p.tr_url}">⬇ Baixar TR</a>
      </div>`
    );

    const links = Object.entries(p.downloads)
      .map(([nome, url]) => `<a class="btn-dl" href="${url}">⬇ ${nome === "proposta" ? "Proposta" : "Resumo"}.docx</a>`)
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
}

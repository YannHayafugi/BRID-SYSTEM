const form = document.getElementById("form");
const input = document.getElementById("arquivo");
const dropzone = document.getElementById("dropzone");
const dzTexto = document.getElementById("dz-texto");
const btn = document.getElementById("btn");
const status = document.getElementById("status");
const resultado = document.getElementById("resultado");

let arquivo = null;

function setArquivo(f) {
  arquivo = f;
  dzTexto.textContent = f ? `📄 ${f.name}` : "Arraste o TR aqui ou clique para selecionar";
  btn.disabled = !f;
}

input.addEventListener("change", () => setArquivo(input.files[0]));

["dragover", "dragleave", "drop"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.toggle("ativo", ev === "dragover");
    if (ev === "drop" && e.dataTransfer.files.length) setArquivo(e.dataTransfer.files[0]);
  })
);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!arquivo) return;

  btn.disabled = true;
  resultado.hidden = true;
  status.hidden = false;
  status.className = "info";
  status.textContent = "⏳ Analisando o TR e gerando a proposta... (30–90 s)";

  const fd = new FormData();
  fd.append("arquivo", arquivo);
  fd.append("senha", document.getElementById("senha").value);

  try {
    const resp = await fetch("/api/gerar", { method: "POST", body: fd });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.detail || "Erro desconhecido");

    status.hidden = true;
    resultado.hidden = false;
    document.getElementById("titulo-proposta").textContent = dados.titulo || "Proposta gerada";
    document.getElementById("dl-proposta").href = dados.downloads.proposta;
    document.getElementById("dl-resumo").href = dados.downloads.resumo;

    const r = dados.resumo || {};
    const dl = document.getElementById("resumo-info");
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
    btn.disabled = !arquivo;
  }
});

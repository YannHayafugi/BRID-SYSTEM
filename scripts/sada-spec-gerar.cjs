/**
 * SADA · gera o seed SQL de uma versao da especificacao (INFO REQUEST LIST).
 *
 * A planilha oficial e a fonte da verdade do que se pede ao ente. Este script
 * le a aba LEIA (dicionario) e os cabecalhos das abas de dados, e emite o SQL
 * que registra essa versao em sada_spec_versao / sada_spec_campo.
 *
 * A especificacao fica NO BANCO, versionada, e nao e lida do arquivo que o
 * cliente devolve: senao o proprio ente poderia alterar a regua contra a qual
 * esta sendo medido, editando a aba LEIA da copia dele.
 *
 *   node scripts/sada-spec-gerar.cjs "<planilha oficial.xlsx>" "<nome da versao>"
 */
const XLSX = require("xlsx");

const ABAS_DADOS = ["METADADOS", "LANÇAMENTO", "RECEBIMENTO", "ESTOQUE DA", "RECEBIMENTO DA", "PARCELAMENTO"];
const vazio = (v) => v === null || v === undefined || String(v).trim() === "";
const sq = (v) => (v === null || v === undefined ? "null" : "'" + String(v).replace(/'/g, "''") + "'");

function extrair(arquivo) {
  const wb = XLSX.readFile(arquivo);
  const grade = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: null });

  // Dicionario: uma linha por campo, com criticidade. O nome da aba vem entre
  // parenteses na coluna "Bloco · Aba" ("0 · Metadados da extracao\n(aba METADADOS)").
  const leia = grade("LEIA");
  const iCab = leia.findIndex((r) => (r[0] || "") === "Bloco · Aba");
  if (iCab < 0) throw new Error('Aba LEIA sem a linha de cabecalho "Bloco · Aba".');

  const dic = new Map();
  for (const r of leia.slice(iCab + 1)) {
    const m = String(r[0] || "").match(/\(aba ([^)]+)\)/);
    if (!m || vazio(r[1])) continue;
    dic.set(`${m[1].trim()}|${String(r[1]).trim()}`, {
      aba: m[1].trim(),
      campo: String(r[1]).trim(),
      descricao: vazio(r[2]) ? null : String(r[2]).trim(),
      formato: vazio(r[3]) ? null : String(r[3]).trim(),
      criticidade: vazio(r[4]) ? "Complementar" : String(r[4]).trim(),
      regras: vazio(r[6]) ? null : String(r[6]).trim(),
    });
  }

  // Ordem das colunas vem do cabecalho de cada aba de dados, nao do dicionario:
  // e a ordem que o ente ve ao preencher.
  const campos = [];
  for (const aba of ABAS_DADOS) {
    if (!wb.Sheets[aba]) throw new Error(`Planilha sem a aba "${aba}".`);
    const g = grade(aba);
    const iHdr = g.findIndex((r) => r.some((c) => !vazio(c)) && !/^BLOCO/i.test(String(r[0] || "")));
    const header = (g[iHdr] || []).map((c) => (vazio(c) ? null : String(c).trim()));
    header.forEach((col, idx) => {
      if (!col) return;
      const d = dic.get(`${aba}|${col}`);
      if (!d) {
        console.error(`AVISO: coluna "${col}" da aba ${aba} nao consta no dicionario LEIA.`);
      }
      campos.push({
        aba, campo: col, ordem: idx,
        criticidade: d ? d.criticidade : "Complementar",
        formato: d ? d.formato : null,
        descricao: d ? d.descricao : null,
        regras: d ? d.regras : null,
      });
    });
  }
  return campos;
}

const [, , arquivo, nomeVersao] = process.argv;
if (!arquivo) {
  console.error('uso: node scripts/sada-spec-gerar.cjs "<planilha.xlsx>" "<nome da versao>"');
  process.exit(1);
}
const campos = extrair(arquivo);
const nome = nomeVersao || `Importada de ${require("path").basename(arquivo)}`;

const linhas = campos.map((c) =>
  `  (v, ${sq(c.aba)}, ${sq(c.campo)}, ${c.ordem}, ${sq(c.criticidade)}, ${sq(c.formato)}, ${sq(c.descricao)}, ${sq(c.regras)})`
);

console.log(`-- Gerado por scripts/sada-spec-gerar.cjs a partir de:
--   ${arquivo}
-- ${campos.length} campos em ${new Set(campos.map((c) => c.aba)).size} abas.
-- Rodar no SQL Editor. A versao entra como vigente e desmarca as anteriores.

do $$
declare v bigint;
begin
  -- Desmarca a anterior ANTES de inserir: idx_sada_spec_versao_vigente e um
  -- indice unico parcial, e duas vigentes ao mesmo tempo violariam.
  update public.sada_spec_versao set vigente = false where vigente;

  insert into public.sada_spec_versao (nome, arquivo_nome, vigente)
  values (${sq(nome)}, ${sq(require("path").basename(arquivo))}, true)
  returning id into v;

  insert into public.sada_spec_campo
    (versao_id, aba, campo, ordem, criticidade, formato, descricao, regras)
  values
${linhas.join(",\n")};
end $$;`);

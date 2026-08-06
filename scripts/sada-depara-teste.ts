/** Conferência do DE/PARA contra o comportamento posicional atual. */
import { analisarQualidade, mapearLinha, TIPOS_SADA, TipoSada } from "../lib/sada/import";
import {
  compilarMapa, MAPA_PADRAO, sugerirMapa, compilarValores, parseData, numero,
} from "../lib/sada/depara";

let falhas = 0;
const ok = (nome: string, cond: boolean, extra = "") => {
  if (!cond) { falhas++; console.log(`  FALHOU  ${nome} ${extra}`); }
  else console.log(`  ok      ${nome}`);
};

// ---------------------------------------------------------------------
// 1. MAPA_PADRAO reproduz mapearLinha campo a campo?
// ---------------------------------------------------------------------
console.log("\n1. MAPA_PADRAO vs mapearLinha (posicional)");

const LINHAS: Record<TipoSada, unknown[]> = {
  divida_ativa: ["1234", "IPTU", "01.02.003", "12345678901", "Desc", "DA",
    "3", "2019", "260.01", "10.5", "5.25", "2.10", "277.86"],
  lancamentos: ["999", "ISS", "A-1", "00000000000", "Lanc", "N", "7", "2021", "1500.00"],
  recebimentos: ["77", "TAXA", "X-9", "98765432100", "Rec", "P", "2020-05-10",
    "6", "2020", "100.00", "1.00", "2.00", "3.00", "4.00", "NULL", "102.00", "8", "2020"],
  recebimentos_da: ["78", "IPTU", "Y-2", "11122233344", "RecDA", "P", "NULL",
    "1", "2018", "50.00", "0.50", "0.25", "0.10", "0.00", "NULL", "50.85", "3", "2022"],
};

for (const tipo of TIPOS_SADA) {
  const linha = LINHAS[tipo];
  const base = { cnpj_orgao: "123", ano: 2024 };
  const esperado = mapearLinha(tipo, linha, base);
  // cabeçalho vazio: MAPA_PADRAO usa índices, não nomes
  const c = compilarMapa(tipo, MAPA_PADRAO[tipo], []);
  const obtido = { ...base, ...c.aplicar(linha) };

  const chaves = Array.from(new Set([...Object.keys(esperado), ...Object.keys(obtido)])).sort();
  const difs = chaves.filter((k) => {
    const a = esperado[k], b = (obtido as Record<string, unknown>)[k];
    return !(a === b || (a === null && b === null));
  });
  ok(`${tipo}: ${chaves.length} campos idênticos`, difs.length === 0,
    difs.map((k) => `${k}: ${JSON.stringify(esperado[k])} != ${JSON.stringify((obtido as Record<string, unknown>)[k])}`).join(" | "));
  ok(`${tipo}: sem campo obrigatório faltando`, c.faltando.length === 0, c.faltando.join(","));
}

// ---------------------------------------------------------------------
// 2. Auto-detecção por cabeçalho
// ---------------------------------------------------------------------
console.log("\n2. sugerirMapa a partir de cabeçalho");

const cab = ["Nº Sequência", "TRIBUTO", "Inscrição Imobiliária", "CPF/CNPJ",
  "Descrição", "Situação", "Mês Venc", "Ano Venc", "Valor",
  "Correção", "Juros", "Multa", "Total Geral"];
const sug = sugerirMapa("divida_ativa", cab);
ok("sequencia detectada", (sug.sequencia as { origem: string })?.origem === "Nº Sequência", JSON.stringify(sug.sequencia));
ok("sigla detectada", (sug.sigla as { origem: string })?.origem === "TRIBUTO", JSON.stringify(sug.sigla));
ok("cnpj_cpf detectado", (sug.cnpj_cpf as { origem: string })?.origem === "CPF/CNPJ", JSON.stringify(sug.cnpj_cpf));
ok("inscricao detectada", (sug.inscricao as { origem: string })?.origem === "Inscrição Imobiliária", JSON.stringify(sug.inscricao));
ok("total detectado", (sug.total as { origem: string })?.origem === "Total Geral", JSON.stringify(sug.total));

// data única -> mes + ano
const cab2 = ["SEQ", "SIGLA", "INSCRICAO", "DOC", "DESC", "FASE",
  "Data Vencimento", "VALOR", "ATUALIZACAO", "JUROS", "MULTA", "TOTAL"];
const sug2 = sugerirMapa("divida_ativa", cab2);
const mv = sug2.mes_venc as { origem: string; transform: string } | undefined;
const av = sug2.ano_venc as { origem: string; transform: string } | undefined;
ok("mes_venc via data_mes", mv?.origem === "Data Vencimento" && mv?.transform === "data_mes", JSON.stringify(mv));
ok("ano_venc via data_ano", av?.origem === "Data Vencimento" && av?.transform === "data_ano", JSON.stringify(av));

// aplica o mapa detectado
const comp2 = compilarMapa("divida_ativa", sug2, cab2);
const r2 = comp2.aplicar(["5", "IPTU", "I-1", "111", "d", "DA", "15/03/2019",
  "1.234,56", "0", "0", "0", "1.300,00"]);
ok("mes_venc extraído de dd/mm/aaaa", r2.mes_venc === 3, String(r2.mes_venc));
ok("ano_venc extraído de dd/mm/aaaa", r2.ano_venc === 2019, String(r2.ano_venc));
ok("valor pt-BR 1.234,56", r2.valor === 1234.56, String(r2.valor));

// ---------------------------------------------------------------------
// 3. Números e datas em formatos variados
// ---------------------------------------------------------------------
console.log("\n3. conversões tolerantes");
ok("260.01 (formato atual)", numero("260.01") === 260.01);
ok("1.234,56 pt-BR", numero("1.234,56") === 1234.56);
ok("1234,56", numero("1234,56") === 1234.56);
ok("(1.234,56) negativo contábil", numero("(1.234,56)") === -1234.56);
ok("R$ 99,90", numero("R$ 99,90") === 99.9);
ok("NULL -> null", numero("NULL") === null);
ok("vazio -> null", numero("") === null);
ok("aaaa-mm-dd", JSON.stringify(parseData("2020-05-10")) === JSON.stringify({ ano: 2020, mes: 5, dia: 10 }));
ok("dd/mm/aaaa", JSON.stringify(parseData("10/05/2020")) === JSON.stringify({ ano: 2020, mes: 5, dia: 10 }));
ok("serial Excel 43961", parseData(43961)?.ano === 2020);

// ---------------------------------------------------------------------
// 4. DE/PARA de valores
// ---------------------------------------------------------------------
console.log("\n4. DE/PARA de valores (sigla)");
const tv = compilarValores([
  { campo: "sigla", valor_origem: "01", valor_canonico: "IPTU" },
  { campo: "sigla", valor_origem: "I.P.T.U.", valor_canonico: "IPTU" },
]);
ok("codigo 01 -> IPTU", tv.aplicar("sigla", "01") === "IPTU");
ok("I.P.T.U. -> IPTU", tv.aplicar("sigla", "I.P.T.U.") === "IPTU");
ok("case/espaco insensivel", tv.aplicar("sigla", " i.p.t.u. ") === "IPTU");
ok("sem par passa direto", tv.aplicar("sigla", "ISS") === "ISS");
ok("null passa direto", tv.aplicar("sigla", null) === null);

// ---------------------------------------------------------------------
// 5. Qualidade sobre registros já traduzidos
// ---------------------------------------------------------------------
console.log("\n5. analisarQualidade pos-traducao");

const regs = (n: number, extra: Record<string, unknown> = {}) =>
  Array.from({ length: n }, () => ({
    sequencia: 1, sigla: "IPTU", inscricao: "I-1", cnpj_cpf: "12345678901",
    valor: 10, total: 12, ...extra,
  }));

// campo obrigatorio sem origem -> bloqueio (substituiu a contagem de colunas)
const relFaltando = analisarQualidade(
  "divida_ativa",
  [{ ano: 2024, registros: regs(3) }],
  { faltando: ["sigla"], origensAusentes: [] },
);
ok("faltando obrigatorio vira bloqueio", relFaltando.temBloqueio);

// coluna do mapa que nao existe no arquivo -> bloqueio
const relAusente = analisarQualidade(
  "divida_ativa",
  [{ ano: 2024, registros: regs(3) }],
  { faltando: [], origensAusentes: ["VLR_TOTAL"] },
);
ok("origem ausente vira bloqueio", relAusente.temBloqueio);

// sequencia nula agora e AVISO (era bloqueio) — decisao: importar sem a chave
const relSemSeq = analisarQualidade(
  "divida_ativa",
  [{ ano: 2024, registros: regs(3, { sequencia: null }) }],
);
ok("sequencia nula nao bloqueia", !relSemSeq.temBloqueio);
ok("sequencia nula aparece como aviso",
  relSemSeq.achados.some((a) => a.codigo === "sequencia_nula" && a.severidade === "aviso"),
  JSON.stringify(relSemSeq.achados.map((a) => [a.codigo, a.severidade])));

// sigla vazia continua bloqueando
const relSemSigla = analisarQualidade(
  "divida_ativa",
  [{ ano: 2024, registros: regs(3, { sigla: "" }) }],
);
ok("sigla vazia continua bloqueio", relSemSigla.temBloqueio);

// o gerador e consumido uma vez so e conta todas as linhas
const relGerador = analisarQualidade("divida_ativa", [{
  ano: 2024,
  registros: (function* () { for (const r of regs(7, { sequencia: null })) yield r; })(),
}]);
ok("gerador contabiliza as 7 linhas", relGerador.totalLinhas === 7, String(relGerador.totalLinhas));

// ---------------------------------------------------------------------
console.log(falhas === 0 ? "\nTUDO OK" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

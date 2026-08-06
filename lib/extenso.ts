// Conversão de números para texto por extenso em português (pt-BR).
// Suporta inteiros de 0 até 999.999.999 e valores monetários em Real (R$).

const UNIDADES = [
  "", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
];
const DEZ_A_DEZENOVE = [
  "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis",
  "dezessete", "dezoito", "dezenove",
];
const DEZENAS = [
  "", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta",
  "oitenta", "noventa",
];
const CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
  "seiscentos", "setecentos", "oitocentos", "novecentos",
];

function centenaPorExtenso(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) {
    if (partes.length > 0) partes.push("e");
    if (resto < 10) partes.push(UNIDADES[resto]);
    else if (resto < 20) partes.push(DEZ_A_DEZENOVE[resto - 10]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      if (u === 0) partes.push(DEZENAS[d]);
      else partes.push(`${DEZENAS[d]} e ${UNIDADES[u]}`);
    }
  }
  return partes.join(" ");
}

/** Converte um inteiro (0 a 999.999.999) para texto por extenso em português. */
export function numeroPorExtenso(valor: number): string {
  const n = Math.floor(Math.abs(valor));
  if (n === 0) return "zero";

  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const centenas = n % 1000;

  const grupos: string[] = [];

  if (milhoes > 0) {
    if (milhoes === 1) grupos.push("um milhão");
    else grupos.push(`${centenaPorExtenso(milhoes)} milhões`);
  }

  if (milhares > 0) {
    if (milhares === 1) grupos.push("mil");
    else grupos.push(`${centenaPorExtenso(milhares)} mil`);
  }

  if (centenas > 0) {
    grupos.push(centenaPorExtenso(centenas));
  }

  // Junta os grupos com "e" quando o último grupo é < 100 (regra comum do
  // português, ex.: "mil e um", "cento e vinte mil e cinco").
  if (grupos.length === 0) return "zero";
  if (grupos.length === 1) return grupos[0];

  const ultimo = grupos[grupos.length - 1];
  const anteriores = grupos.slice(0, -1);
  const precisaE = centenas > 0 && centenas < 100;
  return anteriores.join(", ") + (precisaE ? " e " : ", ") + ultimo;
}

/** Converte um valor monetário (R$) para texto por extenso, ex.: "quinhentos e treze mil, trezentos e quarenta e oito reais". */
export function valorPorExtenso(valor: number): string {
  const reais = Math.floor(Math.round(valor * 100) / 100);
  const centavos = Math.round((valor - reais) * 100);

  const partes: string[] = [];

  if (reais > 0) {
    const palavraReais = reais === 1 ? "real" : "reais";
    partes.push(`${numeroPorExtenso(reais)} ${palavraReais}`);
  }

  if (centavos > 0) {
    const palavraCentavos = centavos === 1 ? "centavo" : "centavos";
    partes.push(`${numeroPorExtenso(centavos)} ${palavraCentavos}`);
  }

  if (partes.length === 0) return "zero reais";
  return partes.join(" e ");
}

/** Formata um valor numérico como moeda brasileira: R$ 513.348,00 */
export function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Retorna "R$ 513.348,00 (quinhentos e treze mil, trezentos e quarenta e oito reais)" */
export function moedaComExtenso(valor: number): string {
  return `R$ ${formatarMoeda(valor)} (${valorPorExtenso(valor)})`;
}

/** Retorna "12 (doze)" para uso em frases como "12 (doze) meses" */
export function numeroComExtenso(valor: number): string {
  return `${valor} (${numeroPorExtenso(valor)})`;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Converte uma data (yyyy-mm-dd) para "11 de julho de 2026" */
export function dataPorExtenso(dia: number, mes: number, ano: number): string {
  return `${dia} de ${MESES[mes - 1]} de ${ano}`;
}

export { MESES };

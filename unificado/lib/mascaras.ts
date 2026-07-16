/** Máscaras e validações de campos de formulário (CNPJ, telefone com DDD). */

export function somenteDigitos(valor: string): string {
  return (valor || "").replace(/\D/g, "");
}

/** Formata progressivamente como XX.XXX.XXX/XXXX-XX conforme o usuário digita. */
export function mascaraCnpj(valorDigitado: string): string {
  const d = somenteDigitos(valorDigitado).slice(0, 14);
  let out = d;
  if (d.length > 2) out = `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length > 5) out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length > 8) out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  if (d.length > 12) out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return out;
}

/** Verifica se um CNPJ (apenas dígitos ou já formatado) tem os dígitos
 * verificadores corretos. Rejeita sequências repetidas (ex.: 00000000000000). */
export function cnpjValido(valor: string): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;

  function digitoVerificador(base: string): number {
    const pesos =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base
      .split("")
      .reduce((acc, digito, i) => acc + Number(digito) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  }

  const base = d.slice(0, 12);
  const dv1 = digitoVerificador(base);
  const dv2 = digitoVerificador(base + dv1);
  return d === base + String(dv1) + String(dv2);
}

/** Formata progressivamente como (XX) XXXXX-XXXX (celular, 11 dígitos) ou
 * (XX) XXXX-XXXX (fixo, 10 dígitos) conforme o usuário digita. DDD sempre
 * obrigatório — os dois primeiros dígitos. */
export function mascaraTelefone(valorDigitado: string): string {
  const d = somenteDigitos(valorDigitado).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Telefone com DDD é válido quando tem 10 dígitos (fixo) ou 11 (celular),
 * com o DDD (2 primeiros dígitos) preenchido. */
export function telefoneValido(valor: string): boolean {
  const d = somenteDigitos(valor);
  return d.length === 10 || d.length === 11;
}

/**
 * Consulta de situação cadastral de CNPJ na Receita, via BrasilAPI.
 *
 * A BrasilAPI é pública, sem chave e sem custo, mas tem limite por IP — por
 * isso toda consulta passa pelo cache em `consulta_cnpj` e só vai à origem
 * quando o registro está velho ou não existe.
 *
 * Só CNPJ. CPF não tem consulta pública de situação cadastral, e numa carteira
 * de IPTU a maior parte dos devedores é pessoa física: a tela precisa deixar
 * isso claro em vez de exibir "não encontrado", que sugeriria irregularidade.
 */

const ENDPOINT = "https://brasilapi.com.br/api/cnpj/v1";

/** Depois disso a consulta é refeita. Situação cadastral muda em escala de
 *  anos; 30 dias é folgado para o uso e educado com a API. */
export const VALIDADE_DIAS = 30;

export interface DadosReceita {
  cnpj: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  situacao: string | null;
  situacao_data: string | null;
  situacao_motivo: string | null;
  matriz_filial: string | null;
  uf: string | null;
  municipio: string | null;
  cnae_codigo: string | null;
  cnae_descricao: string | null;
  natureza_juridica: string | null;
  porte: string | null;
  inicio_atividade: string | null;
  capital_social: number | null;
  bruto: Record<string, unknown>;
}

const texto = (v: unknown): string | null => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s === "" ? null : s;
};

/** Normaliza a resposta da BrasilAPI para as colunas de `consulta_cnpj`.
 *  Os nomes vêm do layout do CNPJ da Receita, não de invenção da API. */
export function normalizarReceita(cnpj: string, bruto: Record<string, unknown>): DadosReceita {
  return {
    cnpj,
    razao_social: texto(bruto.razao_social),
    nome_fantasia: texto(bruto.nome_fantasia),
    situacao: texto(bruto.descricao_situacao_cadastral),
    situacao_data: texto(bruto.data_situacao_cadastral),
    situacao_motivo: texto(bruto.descricao_motivo_situacao_cadastral),
    matriz_filial: texto(bruto.descricao_identificador_matriz_filial),
    uf: texto(bruto.uf),
    municipio: texto(bruto.municipio),
    cnae_codigo: texto(bruto.cnae_fiscal),
    cnae_descricao: texto(bruto.cnae_fiscal_descricao),
    natureza_juridica: texto(bruto.natureza_juridica),
    porte: texto(bruto.porte),
    inicio_atividade: texto(bruto.data_inicio_atividade),
    capital_social:
      bruto.capital_social === null || bruto.capital_social === undefined
        ? null
        : Number(bruto.capital_social),
    bruto,
  };
}

export class ErroReceita extends Error {
  // Campo explícito em vez de parameter property: aquela é sintaxe que só o
  // TypeScript entende, e impede rodar este módulo direto no Node (que apenas
  // remove os tipos) — inclusive num teste rápido de linha de comando.
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Busca na origem. Não consulta o cache — quem chama decide isso.
 *
 * O timeout existe porque esta chamada roda dentro de um route handler: sem
 * ele, uma indisponibilidade da BrasilAPI prenderia a requisição até o limite
 * da plataforma e a tela ficaria pendurada sem explicação.
 */
export async function buscarNaReceita(cnpj: string): Promise<DadosReceita> {
  let r: Response;
  try {
    r = await fetch(`${ENDPOINT}/${cnpj}`, {
      // O User-Agent NÃO é decoração: o fetch do Node não manda nenhum por
      // padrão, e nesse caso a BrasilAPI responde 403 a toda requisição.
      // Verificado na prática — sem este cabeçalho, 403; com ele, 200.
      headers: {
        accept: "application/json",
        "user-agent": "GRUPO-BRID/1.0 (+consulta-cnpj)",
      },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
  } catch {
    throw new ErroReceita("A Receita não respondeu a tempo. Tente de novo em instantes.", 504);
  }

  // 400 e 404 são a mesma coisa para quem usa a tela: a origem não tem esse
  // CNPJ. Verificado: um número com dígito verificador inválido volta 400.
  if (r.status === 404 || r.status === 400) {
    throw new ErroReceita("CNPJ não encontrado na base da Receita.", 404);
  }
  if (r.status === 403) {
    throw new ErroReceita("A origem recusou a consulta (403). Verifique o User-Agent enviado.", 502);
  }
  if (r.status === 429) {
    throw new ErroReceita("Limite de consultas atingido. Aguarde alguns minutos.", 429);
  }
  if (!r.ok) throw new ErroReceita(`Consulta indisponível (HTTP ${r.status}).`, 502);

  return normalizarReceita(cnpj, (await r.json()) as Record<string, unknown>);
}

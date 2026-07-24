/**
 * Importador CLI do SADA — carrega uma planilha (.xlsx) para as tabelas sada_*.
 *
 * Uso:
 *   npm run sada:import -- --file "./DÍVIDA ATIVA.xlsx" --tipo divida_ativa --cnpj 46177531000155
 *   npm run sada:import -- --file "./LANCAMENTOS.xlsx"  --tipo lancamentos   --cnpj 46177531000155
 *   npm run sada:import -- --file "./RECEBIMENTOS.xlsx" --tipo recebimentos  --cnpj 46177531000155
 *   npm run sada:import -- --file "./RECEBIMENTOS DA.xlsx" --tipo recebimentos_da --cnpj 46177531000155
 *
 * Flags:
 *   --file    caminho do .xlsx (obrigatório)
 *   --tipo    divida_ativa | lancamentos | recebimentos | recebimentos_da (obrigatório)
 *   --cnpj    CNPJ do ente ao qual os dados pertencem (obrigatório)
 *   --dry-run lê e valida, mas não grava nada
 *
 * Comportamento (retrato + histórico): o lote novo entra como vigente=true e
 * os lotes anteriores do mesmo cnpj+tipo são marcados vigente=false (sem apagar).
 * Cada aba do arquivo é um ano. Após gravar, atualiza as materialized views e
 * avisa se o CNPJ ainda não está cadastrado em gp_orgaos.
 *
 * Requer no .env.local: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY.
 */
import path from "node:path";
import { config } from "dotenv";
import Excel from "exceljs";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

type Tipo = "divida_ativa" | "lancamentos" | "recebimentos" | "recebimentos_da";
const TIPOS: Tipo[] = ["divida_ativa", "lancamentos", "recebimentos", "recebimentos_da"];
const TABELA: Record<Tipo, string> = {
  divida_ativa: "sada_divida_ativa",
  lancamentos: "sada_lancamentos",
  recebimentos: "sada_recebimentos",
  recebimentos_da: "sada_recebimentos_da",
};
const LOTE = 1000; // linhas por insert

// ---------- argumentos ----------
function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const temFlag = (nome: string) => process.argv.includes(`--${nome}`);

// ---------- conversões ----------
/** '260.01' -> 260.01 ; '0.00' -> 0 ; 'NULL'|''|null -> null */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "" || s.toUpperCase() === "NULL") return null;
  const n = Number(s.replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}
function int(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
}
function txt(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s.toUpperCase() === "NULL" ? null : s;
}

// ---------- mapeamento de linha por tipo ----------
// Colunas por posição (cabeçalho idêntico em todos os anos, já validado).
function mapear(tipo: Tipo, r: unknown[], base: { cnpj_orgao: string; ano: number; importacao_id: number }) {
  switch (tipo) {
    case "divida_ativa": // SEQUENCIA,SIGLA,INSCRICAO,CNPJ/CPF,Descricao,Fase,MES_VENC,ANO_VENC,VALOR,Atualizacao,Juros,Multa,TOTAL
      return {
        ...base, sequencia: int(r[0]), sigla: txt(r[1]), inscricao: txt(r[2]), cnpj_cpf: txt(r[3]),
        descricao: txt(r[4]), fase: txt(r[5]), mes_venc: int(r[6]), ano_venc: int(r[7]),
        valor: num(r[8]), atualizacao: num(r[9]), juros: num(r[10]), multa: num(r[11]), total: num(r[12]),
      };
    case "lancamentos": // SEQUENCIA,SIGLA,INSCRICAO,CNPJ/CPF,Descricao,Fase,Dt.Lancto(mês),EXERCICIO,VALOR
      return {
        ...base, sequencia: int(r[0]), sigla: txt(r[1]), inscricao: txt(r[2]), cnpj_cpf: txt(r[3]),
        descricao: txt(r[4]), fase: txt(r[5]), mes_lancto: int(r[6]), exercicio: int(r[7]), valor: num(r[8]),
      };
    default: // recebimentos e recebimentos_da: mesmas 18 colunas
      return {
        ...base, sequencia: int(r[0]), sigla: txt(r[1]), inscricao: txt(r[2]), cnpj_cpf: txt(r[3]),
        descricao: txt(r[4]), fase: txt(r[5]), data_contrato: txt(r[6]), mes_venc: int(r[7]),
        ano_venc: int(r[8]), valor: num(r[9]), vlam: num(r[10]), vljm: num(r[11]), vlmm: num(r[12]),
        vldesc: num(r[13]), vlel: num(r[14]), totaldam: num(r[15]), mes_arrec: int(r[16]), ano_arrec: int(r[17]),
      };
  }
}

async function inserir(sb: SupabaseClient, tabela: string, linhas: object[]) {
  const { error } = await sb.from(tabela).insert(linhas);
  if (error) throw new Error(`insert em ${tabela}: ${error.message}`);
}

async function main() {
  const file = arg("file");
  const tipo = arg("tipo") as Tipo | undefined;
  const cnpj = arg("cnpj");
  const dry = temFlag("dry-run");

  if (!file || !tipo || !cnpj) {
    console.error("Uso: --file <xlsx> --tipo <" + TIPOS.join("|") + "> --cnpj <cnpj> [--dry-run]");
    process.exit(1);
  }
  if (!TIPOS.includes(tipo)) {
    console.error(`Tipo inválido: ${tipo}. Use um de: ${TIPOS.join(", ")}`);
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY no .env.local");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const tabela = TABELA[tipo];

  console.log(`\nSADA import — ${path.basename(file)}  tipo=${tipo}  cnpj=${cnpj}${dry ? "  [DRY-RUN]" : ""}`);

  // 1) cria o lote de importação (vigente); marca anteriores como não-vigentes
  let importacaoId = -1;
  if (!dry) {
    const ins = await sb
      .from("sada_importacoes")
      .insert({ cnpj_orgao: cnpj, tipo, arquivo_nome: path.basename(file), vigente: true })
      .select("id")
      .single();
    if (ins.error) throw new Error(`criar importacao: ${ins.error.message}`);
    importacaoId = ins.data.id as number;

    const upd = await sb
      .from("sada_importacoes")
      .update({ vigente: false })
      .eq("cnpj_orgao", cnpj).eq("tipo", tipo).neq("id", importacaoId);
    if (upd.error) throw new Error(`marcar anteriores: ${upd.error.message}`);
  }

  // 2) percorre as abas (anos) em streaming, inserindo em lotes
  const reader = new Excel.stream.xlsx.WorkbookReader(file, {});
  let total = 0;
  let anoMin = Infinity, anoMax = -Infinity;
  let buffer: object[] = [];

  for await (const ws of reader) {
    const ano = parseInt(String((ws as unknown as { name: string }).name), 10);
    if (!Number.isFinite(ano)) continue;
    anoMin = Math.min(anoMin, ano);
    anoMax = Math.max(anoMax, ano);
    let primeira = true;
    let doAno = 0;

    for await (const row of ws) {
      if (primeira) { primeira = false; continue; } // pula cabeçalho
      const valores = (row.values as unknown[]).slice(1); // exceljs indexa a partir de 1
      if (valores.every((v) => v === null || v === undefined || v === "")) continue;
      buffer.push(mapear(tipo, valores, { cnpj_orgao: cnpj, ano, importacao_id: importacaoId }));
      doAno++; total++;
      if (buffer.length >= LOTE && !dry) { await inserir(sb, tabela, buffer); buffer = []; }
    }
    console.log(`  ${ano}: ${doAno.toLocaleString("pt-BR")} linhas`);
  }
  if (buffer.length && !dry) await inserir(sb, tabela, buffer);

  // 3) fecha o lote com contagem e faixa de anos; atualiza views; checa cadastro
  if (!dry) {
    await sb.from("sada_importacoes")
      .update({ linhas_importadas: total, ano_inicio: anoMin, ano_fim: anoMax })
      .eq("id", importacaoId);
    const rf = await sb.rpc("sada_refresh_mvs");
    if (rf.error) console.warn(`  (aviso) refresh das views falhou: ${rf.error.message}`);

    const dig = cnpj.replace(/\D/g, "");
    const org = await sb.from("gp_orgaos").select("id, cnpj");
    const existe = (org.data ?? []).some((o) => String(o.cnpj ?? "").replace(/\D/g, "") === dig);
    if (!existe) {
      console.log(`\n  ⚠ CNPJ ${cnpj} ainda NÃO está cadastrado em gp_orgaos (pendente).`);
      console.log(`    Veja todos os pendentes com:  npm run sada:pendentes`);
    }
  }

  console.log(`\n✅ ${dry ? "Validação" : "Importação"} concluída: ${total.toLocaleString("pt-BR")} linhas (${anoMin}–${anoMax}).\n`);
}

main().catch((e) => { console.error("\n❌ Erro:", e.message); process.exit(1); });

/**
 * Lista os entes (CNPJ) que já têm dados importados no SADA mas ainda NÃO
 * estão cadastrados em gp_orgaos. Lê a view public.sada_entes_pendentes.
 *
 * Uso:  npm run sada:pendentes
 * Requer no .env.local: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY no .env.local");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from("sada_entes_pendentes")
    .select("*")
    .order("primeira_importacao", { ascending: true });
  if (error) { console.error("Erro:", error.message); process.exit(1); }

  if (!data || data.length === 0) {
    console.log("\n✅ Nenhum ente pendente — todos os CNPJs importados têm cadastro em gp_orgaos.\n");
    return;
  }
  console.log(`\n⚠ ${data.length} ente(s) com dados no SADA e SEM cadastro em gp_orgaos:\n`);
  for (const p of data as { cnpj_orgao: string; qtd_lotes: number; primeira_importacao: string }[]) {
    console.log(`  CNPJ ${p.cnpj_orgao}  —  ${p.qtd_lotes} lote(s), desde ${p.primeira_importacao?.slice(0, 10)}`);
  }
  console.log("");
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });

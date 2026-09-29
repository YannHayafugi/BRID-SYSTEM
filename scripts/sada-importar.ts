/**
 * SADA · importa uma planilha GRANDE direto da sua máquina para o banco.
 *
 * Existe porque o arquivo grande não passa pelo navegador (ele recusa alocar
 * 2 GB de uma vez) e, enquanto não houver um servidor com disco próprio, não
 * há para onde enviá-lo. Mas o arquivo já está na sua máquina — e ela fala
 * com o banco. Este script é esse caminho.
 *
 * Usa exatamente o mesmo código do servidor (lib/sada/ingestao.ts): mesma
 * tradução pelo DE/PARA, mesma verificação de qualidade, mesma regra de só
 * trocar o lote vigente no fim. O que muda é só quem lê o arquivo.
 *
 * Exemplos (PowerShell, na pasta do projeto):
 *
 *   npm run sada:importar -- --arquivo "C:\\dados\\DIVIDA 2026.xlsx" ^
 *     --cnpj 46578393000163 --tipo divida_ativa
 *
 *   # só conferir, sem gravar nada:
 *   npm run sada:importar -- --arquivo "C:\\dados\\DIVIDA 2026.xlsx" ^
 *     --cnpj 46578393000163 --tipo divida_ativa --conferir
 *
 * Lê as credenciais de .env.local (as mesmas do site). Com SADA_DB_URL
 * definida a gravação vai por COPY, que é o caminho rápido; sem ela vai pela
 * API do Supabase, que funciona e demora bem mais.
 */
import "dotenv/config";
import { config as carregarEnv } from "dotenv";
import { statSync } from "node:fs";
import { basename } from "node:path";

// .env.local é o arquivo que o Next usa; o dotenv não o lê sozinho.
carregarEnv({ path: ".env.local" });

import { TIPOS_SADA, type TipoSada } from "../lib/sada/import";
import { MAPA_PADRAO } from "../lib/sada/depara";
import {
  configDePara,
  importarArquivo,
  lerArquivo,
  temCopy,
  type ConfigIngestao,
} from "../lib/sada/ingestao";

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
const tem = (nome: string) => process.argv.includes(`--${nome}`);

const arquivo = argumento("arquivo");
const cnpj = (argumento("cnpj") ?? "").replace(/\D/g, "");
const tipo = (argumento("tipo") ?? "") as TipoSada;
const mapaNome = argumento("mapa");
const conferir = tem("conferir");
const semDePara = tem("padrao");

function ajuda(erro?: string): never {
  if (erro) console.error(`\n${erro}\n`);
  console.log(`Uso:
  npm run sada:importar -- --arquivo <caminho> --cnpj <14 dígitos> --tipo <tipo> [opções]

Tipos: ${TIPOS_SADA.join(" | ")}

Opções:
  --mapa <nome>   qual DE/PARA usar (padrão: o mais recente do ente)
  --conferir      só lê e relata; não grava nada no banco
  --padrao        ignora o DE/PARA cadastrado e usa o layout posicional padrão
`);
  process.exit(erro ? 1 : 0);
}

if (!arquivo || !cnpj || !TIPOS_SADA.includes(tipo)) {
  ajuda("Informe --arquivo, --cnpj (14 dígitos) e --tipo válido.");
}
if (cnpj.length !== 14) ajuda("O CNPJ precisa ter 14 dígitos.");

const relogio = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${s % 60}s`;
};

async function main() {
  const bytes = statSync(arquivo!).size;
  const nome = basename(arquivo!);
  console.log(`\nArquivo : ${nome} (${(bytes / 1048576).toFixed(1)} MB)`);
  console.log(`Ente    : ${cnpj}`);
  console.log(`Tipo    : ${tipo}`);

  let cfg: ConfigIngestao;
  if (semDePara) {
    console.log("DE/PARA : layout posicional padrão (--padrao)");
    cfg = { mapa: MAPA_PADRAO[tipo], abasModo: "ano_no_nome", abas: null, opcionais: [], pares: [] };
  } else {
    cfg = await configDePara(cnpj, tipo, mapaNome);
    console.log(
      `DE/PARA : ${mapaNome ?? "mais recente do ente"} · ${Object.keys(cfg.mapa).length} campos · ` +
      `ano: ${cfg.abasModo}${cfg.opcionais.length ? ` · dispensados: ${cfg.opcionais.join(", ")}` : ""}`,
    );
  }
  console.log(`Gravação: ${temCopy() ? "COPY direto no banco" : "API do Supabase (lenta — defina SADA_DB_URL)"}\n`);

  const t0 = Date.now();
  let ultimo = 0;
  const aoProgresso = (p: { linhasLidas: number }) => {
    // Uma linha por segundo: o suficiente para acompanhar, sem inundar o
    // terminal numa carga de milhões de linhas.
    if (Date.now() - ultimo < 1000) return;
    ultimo = Date.now();
    process.stdout.write(
      `\r  ${p.linhasLidas.toLocaleString("pt-BR")} linhas · ${relogio(Date.now() - t0)}   `,
    );
  };

  if (conferir) {
    const r = await lerArquivo(arquivo!, nome, tipo, cnpj, cfg, async () => {}, aoProgresso);
    process.stdout.write("\r");
    console.log(
      `\nConferência (nada foi gravado): ${r.linhas.toLocaleString("pt-BR")} linhas · ` +
      `anos ${r.anos[0]}–${r.anos[r.anos.length - 1]} · ${relogio(Date.now() - t0)}`,
    );
    relatar(r.relatorio);
    return;
  }

  const r = await importarArquivo({
    caminho: arquivo!,
    nomeArquivo: nome,
    cnpj,
    tipo,
    cfg,
    aoProgresso,
    aoAbrirLote: (id) => console.log(`  lote ${id} aberto (entra como vigente só no fim)\n`),
  });
  process.stdout.write("\r");

  if (r.descartado) {
    console.error(`\n${r.motivo}`);
    relatar(r.relatorio);
    process.exit(1);
  }

  console.log(
    `\nPronto: ${r.linhas.toLocaleString("pt-BR")} linhas publicadas ` +
    `(${r.anos[0]}–${r.anos[r.anos.length - 1]}) em ${relogio(Date.now() - t0)}.`,
  );
  relatar(r.relatorio);
}

function relatar(rel: { achados: { rotulo: string; qtd: number; severidade: string }[] }) {
  if (rel.achados.length === 0) {
    console.log("Nenhum problema de qualidade encontrado.");
    return;
  }
  console.log("\nQualidade:");
  for (const a of rel.achados) {
    const marca = a.severidade === "bloqueio" ? "IMPEDITIVO" : "aviso     ";
    console.log(`  ${marca}  ${a.rotulo} — ${a.qtd.toLocaleString("pt-BR")}`);
  }
}

main().catch((e) => {
  console.error(`\nFALHOU: ${(e as Error).message}`);
  process.exit(1);
});

/**
 * Helpers de storage do gerador (bucket privado gp-arquivos) e de nomes de
 * download. Storage sempre via cliente admin (bucket não tem policies públicas).
 */
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const BUCKET = "gp-arquivos";

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function uploadArquivo(
  caminho: string,
  conteudo: Buffer | Uint8Array,
  contentType = "application/octet-stream"
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .storage.from(BUCKET)
    .upload(caminho, conteudo, { contentType, upsert: true });
  if (error) throw new Error(`Falha ao salvar arquivo no storage: ${error.message}`);
}

export async function baixarArquivo(caminho: string): Promise<Buffer> {
  const { data, error } = await getSupabaseAdmin().storage.from(BUCKET).download(caminho);
  if (error || !data) throw new Error(`Arquivo não encontrado no storage: ${caminho}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function removerArquivos(caminhos: string[]): Promise<void> {
  if (!caminhos.length) return;
  const { error } = await getSupabaseAdmin().storage.from(BUCKET).remove(caminhos);
  if (error) console.warn(`[aviso] arquivos não removidos do storage: ${error.message}`);
}

/** Remove acentos e caracteres inválidos para o header Content-Disposition. */
export function nomeDownload(nome: string): string {
  const ascii = nome.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return ascii.replace(/["\\/:*?<>|]/g, "").trim() || "documento";
}

/** Resposta de download de um arquivo binário. */
export function respostaArquivo(conteudo: Buffer, nome: string, mime: string): Response {
  return new Response(new Uint8Array(conteudo), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${nomeDownload(nome)}"`,
    },
  });
}

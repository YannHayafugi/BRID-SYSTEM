import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sinal de vida do processo, para o healthcheck do container.
 *
 * NÃO consulta o banco de propósito. Um healthcheck que depende do Postgres
 * derrubaria o app justamente nos ~20 s de `sada_refresh_mvs()` ao fim de uma
 * importação — o momento em que reiniciar é pior. Banco fora do ar é problema
 * do banco; o orquestrador não deve responder a isso matando o app.
 */
export async function GET() {
  return NextResponse.json(
    { ok: true, em: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

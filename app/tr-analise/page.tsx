"use client";

/** Página standalone da análise de TR (acesso direto/bookmark por link com
 * ?orgao=...&processo=...). O fluxo principal agora abre isso em modal
 * direto do Follow-up/Órgão (ver AnaliseTRConteudo + D40), mas a página
 * continua funcionando sozinha para quem tiver o link salvo. */
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AnaliseTRConteudo from "@/app/components/AnaliseTRConteudo";

export default function AnaliseTRPage() {
  return (
    <Suspense fallback={<main><div className="page"><p>Carregando...</p></div></main>}>
      <AnaliseTRPageConteudo />
    </Suspense>
  );
}

function AnaliseTRPageConteudo() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orgaoId = searchParams.get("orgao");
  const processoId = searchParams.get("processo");

  if (!orgaoId) {
    router.replace("/orgaos");
    return null;
  }

  return (
    <main>
      <header className="topo">
        <h1>Análise de Termo de Referência</h1>
      </header>
      <div className="page">
        <p style={{ marginBottom: 20 }}>
          <Link href={`/orgaos/${orgaoId}`}>← voltar ao órgão</Link>
        </p>
        <AnaliseTRConteudo orgaoId={orgaoId} processoId={processoId || undefined} />
      </div>
    </main>
  );
}

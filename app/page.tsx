"use client";

/** D52: página inicial pública (antes do login) — versão enxuta para o time
 * interno, com a identidade do site institucional (grupobrid.com): fundo
 * escuro, dourado, títulos em Antonio e fade-in de entrada. O botão leva ao
 * login (ou direto ao Dashboard, se já houver sessão). */
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function PaginaInicial() {
  const [logado, setLogado] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setLogado(!!data.user));
  }, []);

  return (
    <main className="landing">
      <div className="landing-conteudo">
        <Image src="/logo.svg" alt="GRUPO BRID" width={72} height={72}
          style={{ borderRadius: 14 }} priority />

        <span className="landing-marca">GRUPO BRID</span>

        <h1 className="landing-titulo">
          Somos especialistas em<br />impulsionar negócios!
        </h1>

        <p className="landing-sub">
          Sistema interno do time — propostas, follow-up de processos,
          análise de TR com IA e dashboard.
        </p>

        {logado ? (
          <div className="landing-atalhos">
            <Link href="/dashboard" className="landing-cta">Ir para o Dashboard →</Link>
            <Link href="/followup" className="landing-cta secundario">Ir para o Follow-up →</Link>
            <Link href="/arquivos" className="landing-cta secundario">Ir para Arquivos →</Link>
          </div>
        ) : (
          <Link href="/login" className="landing-cta">Acessar o sistema →</Link>
        )}
      </div>

      <footer className="landing-rodape">
        comercial@grupobrid.com · +55 (11) 3804-1136 — uso interno · © {new Date().getFullYear()} GRUPO BRID
      </footer>
    </main>
  );
}

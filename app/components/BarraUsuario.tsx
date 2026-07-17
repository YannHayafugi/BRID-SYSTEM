"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** Barra de navegação principal (D11): Dashboard → Follow-up → Análise TR →
 * Arquivos como abas; Órgãos, Histórico e Administração no menu secundário.
 * Não aparece na tela de login. */
export default function BarraUsuario() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [ehAdmin, setEhAdmin] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    async function carregarPerfil() {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
      if (data.user) {
        const { data: perfil } = await supabase
          .from("gp_profiles")
          .select("perfil")
          .eq("id", data.user.id)
          .single();
        setEhAdmin(perfil?.perfil === "admin");
      } else {
        setEhAdmin(false);
      }
    }
    carregarPerfil();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      carregarPerfil();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (pathname === "/login" || !email) return null;

  async function sair() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const abas = [
    { href: "/dashboard", rotulo: "Dashboard" },
    { href: "/followup", rotulo: "Follow-up" },
    { href: "/tr-analise", rotulo: "Análise TR" },
    { href: "/arquivos", rotulo: "Arquivos" },
  ];

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        padding: "8px 20px",
        background: "var(--escuro)",
        borderBottom: "1px solid #2a2620",
        fontSize: 13,
        color: "#c9c4b6",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Image src="/logo.svg" alt="Logo" width={34} height={34} style={{ borderRadius: 8 }} />
        <nav style={{ display: "flex", gap: 4 }}>
          {abas.map((a) => {
            const ativa = pathname.startsWith(a.href);
            return (
              <Link
                key={a.href}
                href={a.href}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 14,
                  textDecoration: "none",
                  color: ativa ? "var(--escuro)" : "var(--primaria)",
                  background: ativa ? "var(--primaria)" : "transparent",
                }}
              >
                {a.rotulo}
              </Link>
            );
          })}
        </nav>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Link href="/orgaos" style={{ color: "var(--primaria)", fontWeight: 600, textDecoration: "none" }}>
          Órgãos
        </Link>
        <Link href="/historico" style={{ color: "var(--primaria)", fontWeight: 600, textDecoration: "none" }}>
          Histórico
        </Link>
        {ehAdmin && (
          <Link
            href="/admin/usuarios"
            style={{ color: "var(--primaria)", fontWeight: 600, textDecoration: "none" }}
          >
            Administração
          </Link>
        )}
        <span>{email}</span>
        <button
          onClick={sair}
          title="Sair do sistema"
          style={{
            background: "none",
            border: "1px solid #3a3529",
            borderRadius: 8,
            padding: "6px 12px",
            color: "#c9c4b6",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Sair
        </button>
      </div>
    </div>
  );
}

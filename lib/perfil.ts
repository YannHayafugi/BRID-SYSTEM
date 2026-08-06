/** D26: cor e rótulo do avatar por tipo de perfil (gp_profiles.perfil). */
export const CORES_PERFIL: Record<string, string> = {
  admin: "#c2410c",
  editor: "var(--primaria)",
  visualizador: "#5a6b7b",
};

export const NOMES_PERFIL: Record<string, string> = {
  admin: "Administrador",
  editor: "Editor",
  visualizador: "Visualizador",
};

export function corPerfil(tipo: string | null | undefined): string {
  return (tipo && CORES_PERFIL[tipo]) || "#5a6b7b";
}

export function textoAvatarPerfil(tipo: string | null | undefined): string {
  return tipo === "editor" ? "var(--escuro)" : "#fff";
}

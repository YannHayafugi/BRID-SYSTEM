"use client";

/** D51: botão 💬 no header — abre um modal para relatar erros ou sugerir
 * melhorias. Os envios ficam em gp_feedbacks e aparecem para o admin nas
 * notificações (sininho) até serem marcados como resolvidos. */
import { useState } from "react";
import { usePathname } from "next/navigation";
import Modal from "./Modal";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function FeedbackBotao() {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<"erro" | "sugestao">("erro");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  function abrir() {
    setTipo("erro");
    setMensagem("");
    setFeedback(null);
    setAberto(true);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!mensagem.trim()) {
      setFeedback({ tipo: "erro", texto: "Descreva o erro ou a sugestão antes de enviar." });
      return;
    }
    setEnviando(true);
    setFeedback(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sessão expirada. Faça login novamente.");
      const { error } = await supabase.from("gp_feedbacks").insert({
        tipo,
        mensagem: mensagem.trim(),
        pagina: pathname,
        criado_por: userData.user.id,
      });
      if (error) throw new Error(error.message);
      setFeedback({ tipo: "ok", texto: "Enviado! O administrador será notificado. Obrigado 🙌" });
      setMensagem("");
    } catch (err: any) {
      setFeedback({ tipo: "erro", texto: err.message || "Falha ao enviar." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        onClick={abrir}
        title="Relatar um erro ou sugerir uma melhoria"
        style={{
          background: "none",
          border: "1px solid #3a3529",
          borderRadius: 8,
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          fontSize: 15,
          color: "#c9c4b6",
        }}
      >
        💬
      </button>

      {aberto && (
        <Modal titulo="💬 Erros e sugestões" onFechar={() => setAberto(false)}>
          <form onSubmit={enviar}>
            <p className="detalhe" style={{ marginBottom: 12 }}>
              Encontrou um problema ou tem uma ideia de melhoria? Descreva abaixo — o
              administrador recebe nas notificações.
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button type="button"
                className={tipo === "erro" ? "btn-azul" : "btn-doc"}
                onClick={() => setTipo("erro")}
                title="Algo não funcionou como deveria">
                🐞 Erro
              </button>
              <button type="button"
                className={tipo === "sugestao" ? "btn-azul" : "btn-doc"}
                onClick={() => setTipo("sugestao")}
                title="Ideia para melhorar o sistema">
                💡 Sugestão de melhoria
              </button>
            </div>
            <textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={5}
              placeholder={tipo === "erro"
                ? "Descreva o erro: o que você fez, o que esperava e o que aconteceu."
                : "Descreva a sua sugestão de melhoria."}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--borda)", borderRadius: 8, marginBottom: 10, fontSize: 14 }}
            />
            <p className="detalhe" style={{ marginBottom: 12 }}>Página atual (enviada junto): {pathname}</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button type="submit" className="btn-azul" disabled={enviando}>
                {enviando ? "Enviando..." : "Enviar"}
              </button>
              {feedback && (
                <span className={`msg ${feedback.tipo === "ok" ? "ok" : "erro"}`} style={{ margin: 0 }}>
                  {feedback.texto}
                </span>
              )}
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

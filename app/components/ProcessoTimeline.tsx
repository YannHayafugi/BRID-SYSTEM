"use client";

/** D23: timeline vertical das 8 fases do fluxo (ETAPAS_FLUXO), usada na
 * página individual do órgão. Mostra as fases concluídas (com a data de
 * autenticação, quando manual), a fase atual destacada e as futuras
 * bloqueadas. Fases manuais são clicáveis para avançar — pede a data de
 * autenticação antes de confirmar (mesma regra do Follow-up, D19/D21). */
import { EtapaFluxo } from "@/lib/processos/etapas";

export interface HistoricoEtapaTL { etapa: number; nome: string; data_autenticacao: string; alterado_em: string }

function fmtDataCurta(iso: string) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export default function ProcessoTimeline({
  etapas,
  etapaAtual,
  historico,
  onSelecionar,
  bloqueado,
  livre = false,
  apenasProxima = false,
}: {
  etapas: EtapaFluxo[];
  etapaAtual: number;
  historico: HistoricoEtapaTL[];
  onSelecionar: (etapa: number) => void;
  bloqueado: boolean;
  /** D43: admin escolhe qualquer fase, sem depender de tipo (manual/auto) nem de ordem */
  livre?: boolean;
  /** D48: editor só pode avançar para a fase seguinte à atual */
  apenasProxima?: boolean;
}) {
  const primeiraManual = etapas.findIndex((e) => e.tipo === "manual");

  function dataDe(etapa: number): string | null {
    const registro = historico.filter((h) => h.etapa === etapa).pop();
    return registro?.data_autenticacao || null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", paddingLeft: 4 }}>
      {etapas.map((e, i) => {
        const concluida = i < etapaAtual;
        const atual = i === etapaAtual;
        const futura = i > etapaAtual;
        const bloqueadaPorAutomacaoPendente =
          !livre && !apenasProxima && e.tipo === "manual" && primeiraManual >= 0 && etapaAtual < primeiraManual;
        const clicavel = livre
          ? !bloqueado && !atual
          : apenasProxima
          ? !bloqueado && i === etapaAtual + 1
          : e.tipo === "manual" && !bloqueadaPorAutomacaoPendente && !bloqueado && !concluida;
        const data = dataDe(i);

        return (
          <div key={i} style={{ display: "flex", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                  background: concluida ? "var(--primaria)" : atual ? "var(--primaria-claro)" : "var(--bg-suave)",
                  color: concluida ? "var(--escuro)" : atual ? "var(--primaria)" : "var(--cinza)",
                  border: atual ? "2px solid var(--primaria)" : "1px solid var(--borda)",
                }}
              >
                {concluida ? "✓" : i + 1}
              </div>
              {i < etapas.length - 1 && (
                <div style={{ width: 2, flex: 1, minHeight: 24, background: concluida ? "var(--primaria)" : "var(--borda)" }} />
              )}
            </div>

            <div
              onClick={() => clicavel && onSelecionar(i)}
              style={{
                paddingBottom: 18,
                cursor: clicavel ? "pointer" : "default",
                opacity: futura ? 0.6 : 1,
              }}
              title={
                clicavel
                  ? "Clique para avançar para esta fase (pede a data de autenticação)"
                  : bloqueadaPorAutomacaoPendente
                  ? "As fases manuais só se liberam depois que a fase automatizada (TR > Proposta > Ofício) for concluída."
                  : undefined
              }
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 13, color: atual ? "var(--primaria)" : "var(--texto)" }}>
                  {e.nome}
                </strong>
                <span className={`fu-badge ${e.tipo}`}>
                  {e.tipo === "auto" ? "🤖 automática" : bloqueadaPorAutomacaoPendente ? "🔒 bloqueada" : "✋ manual"}
                </span>
                {atual && (
                  <span className="detalhe" style={{ color: "var(--primaria)", fontWeight: 700 }}>
                    ● você está aqui
                  </span>
                )}
              </div>
              {data && (
                <span className="detalhe">🔏 Autenticado em {fmtDataCurta(data)}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

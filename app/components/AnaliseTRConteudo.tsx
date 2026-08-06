"use client";

/** D40: conteúdo da análise de TR, extraído de app/tr-analise/page.tsx para
 * ser reaproveitado dentro de um modal (aberto direto do Follow-up e da
 * página do Órgão), em vez de navegar para uma página separada. O resultado
 * da IA agora é salvo como rascunho (gp_cadastros_tr, status "em_analise")
 * assim que a análise termina — fechar e reabrir o modal não perde o
 * resultado nem roda a IA de novo; "Gerar relatório" finaliza esse rascunho. */
import { useEffect, useMemo, useState } from "react";
import { Achado, AchadoEstado, ResultadoAnaliseTR } from "@/lib/tr/types";
import { gerarAchados, itensSemAchados } from "@/lib/tr/regras";
import { NovoContatoInput, OrgaoComContatos, contatoValido } from "@/lib/orgaos/types";
import { mascaraTelefone } from "@/lib/mascaras";

function novoContatoVazio(): NovoContatoInput {
  return { nomeCompleto: "", cargo: "", telefone: "", email: "" };
}

export default function AnaliseTRConteudo({
  orgaoId,
  processoId,
  onFinalizado,
}: {
  orgaoId: string;
  processoId?: string;
  /** Chamado depois que o relatório final é gerado com sucesso — o card do
   * processo no Follow-up/Órgão deve recarregar para mostrar o ✓. */
  onFinalizado?: () => void;
}) {
  const [carregandoOrgao, setCarregandoOrgao] = useState(true);
  const [erroOrgao, setErroOrgao] = useState<string | null>(null);
  const [orgao, setOrgao] = useState<OrgaoComContatos | null>(null);
  const [contatoNovo, setContatoNovo] = useState<NovoContatoInput>(novoContatoVazio());

  const [arquivo, setArquivo] = useState<File | null>(null);

  const [analisando, setAnalisando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoAnaliseTR | null>(null);
  const [estados, setEstados] = useState<Record<string, AchadoEstado>>({});
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
  const [modoLeitura, setModoLeitura] = useState<"texto" | "imagem" | null>(null);
  const [relatorioGerado, setRelatorioGerado] = useState(false);

  // D40: rascunho salvo no banco (gp_cadastros_tr) com o resultado da IA.
  const [cadastroId, setCadastroId] = useState<string | null>(null);
  const [carregandoRascunho, setCarregandoRascunho] = useState(!!processoId);
  // nome do arquivo do rascunho carregado (quando não baixamos o arquivo de
  // novo, `arquivo` fica null — este é o fallback para o relatório final).
  const [nomeArquivoRascunho, setNomeArquivoRascunho] = useState<string | null>(null);

  // D39: busca automática do TR já anexado ao processo, quando não há rascunho.
  const [autoBuscando, setAutoBuscando] = useState(false);
  const [autoErro, setAutoErro] = useState<string | null>(null);

  const achados = useMemo(() => (resultado ? gerarAchados(resultado) : []), [resultado]);
  const mensagensOk = useMemo(
    () => (resultado ? itensSemAchados(resultado, achados) : []),
    [resultado, achados]
  );

  useEffect(() => {
    if (!orgaoId) return;
    (async () => {
      setCarregandoOrgao(true);
      setErroOrgao(null);
      try {
        const resp = await fetch(`/api/orgaos/${orgaoId}`);
        const dados = await resp.json();
        if (!resp.ok || !dados.ok) throw new Error(dados.erro || "Falha ao carregar o órgão.");
        setOrgao(dados.orgao);
      } catch (err: any) {
        setErroOrgao(err.message || "Erro ao carregar o órgão.");
      } finally {
        setCarregandoOrgao(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgaoId]);

  const contatoExistente = orgao?.contatos[0] || null;

  async function executarAnalise(arquivoParaAnalisar: File) {
    setErro(null);
    setAnalisando(true);
    setResultado(null);
    setEstados({});
    try {
      const formData = new FormData();
      formData.append("arquivo", arquivoParaAnalisar);

      const resp = await fetch("/api/tr/analyze", { method: "POST", body: formData });
      const dados = await resp.json();

      if (!resp.ok || !dados.ok) {
        throw new Error(dados.erro || "Falha ao analisar o TR.");
      }

      const res: ResultadoAnaliseTR = dados.resultado;
      aplicarResultado(res);
      setModoLeitura(dados.modo === "imagem" ? "imagem" : "texto");

      // D40: salva o resultado como rascunho assim que a IA termina.
      if (orgaoId) {
        const respRascunho = await fetch("/api/tr/rascunho", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orgaoId,
            processoId,
            nomeArquivoTr: arquivoParaAnalisar.name,
            resultado: res,
          }),
        });
        const dadosRascunho = await respRascunho.json().catch(() => ({}));
        if (respRascunho.ok && dadosRascunho.cadastroId) {
          setCadastroId(dadosRascunho.cadastroId);
        }
      }
    } catch (err: any) {
      setErro(err.message || "Erro inesperado ao analisar o TR.");
    } finally {
      setAnalisando(false);
    }
  }

  function aplicarResultado(res: ResultadoAnaliseTR) {
    const novosAchados = gerarAchados(res);
    const novoEstado: Record<string, AchadoEstado> = {};
    novosAchados.forEach((a) => {
      novoEstado[a.id] = { ciente: false, comentario: "" };
    });
    setResultado(res);
    setEstados(novoEstado);
  }

  function enviarParaAnalise() {
    if (!arquivo) {
      setErro("Selecione o arquivo do TR (PDF ou DOCX) enviado pelo ente.");
      return;
    }
    executarAnalise(arquivo);
  }

  // D40: primeiro checa se já existe um rascunho (ou análise concluída)
  // salvo para este processo — se existir, carrega direto, sem rodar a IA de
  // novo. Só faz a busca+análise automática do TR (D39) se não houver nada salvo.
  useEffect(() => {
    if (!processoId) return;
    (async () => {
      setCarregandoRascunho(true);
      try {
        const resp = await fetch(`/api/tr/rascunho?processo=${processoId}`);
        const dados = await resp.json().catch(() => ({}));
        const rascunho = dados?.rascunho;
        if (resp.ok && rascunho?.resultado_bruto_ia) {
          aplicarResultado(rascunho.resultado_bruto_ia as ResultadoAnaliseTR);
          setCadastroId(rascunho.id);
          setNomeArquivoRascunho(rascunho.nome_arquivo_tr || null);
          setRelatorioGerado(rascunho.status === "concluida");
          return;
        }
      } catch {
        // sem rascunho encontrado — segue para a busca automática do TR
      } finally {
        setCarregandoRascunho(false);
      }
      await buscarEAnalisarTr();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processoId]);

  async function buscarEAnalisarTr() {
    if (!processoId) return;
    setAutoBuscando(true);
    setAutoErro(null);
    try {
      const resp = await fetch(`/api/processos/${processoId}/download/tr`);
      if (!resp.ok) {
        setAutoErro("Este processo ainda não tem um TR anexado. Envie o arquivo abaixo para analisar.");
        return;
      }
      const tipo = resp.headers.get("content-type") || "";
      const ehDocx = tipo.includes("wordprocessingml") || tipo.includes("msword");
      if (!tipo.includes("pdf") && !ehDocx) {
        setAutoErro(
          "O TR anexado a este processo não está em PDF nem DOCX, formatos aceitos pela análise automática. Envie o arquivo abaixo."
        );
        return;
      }
      const disposicao = resp.headers.get("content-disposition") || "";
      const nome = disposicao.match(/filename="?([^"]+)"?/)?.[1] || (ehDocx ? "TR.docx" : "TR.pdf");
      const blob = await resp.blob();
      const file = new File([blob], nome, { type: tipo });
      setArquivo(file);
      await executarAnalise(file);
    } catch {
      setAutoErro("Não foi possível carregar o TR do processo automaticamente. Envie o arquivo abaixo.");
    } finally {
      setAutoBuscando(false);
    }
  }

  function marcarCiente(id: string, ciente: boolean) {
    setEstados((prev) => ({ ...prev, [id]: { ...prev[id], ciente } }));
  }

  function atualizarComentario(id: string, comentario: string) {
    setEstados((prev) => ({ ...prev, [id]: { ...prev[id], comentario } }));
  }

  const pendencias = useMemo(() => {
    const lista: string[] = [];
    achados.forEach((a) => {
      const estado = estados[a.id];
      if (!estado?.ciente) lista.push(`Confirmar ciência: ${a.titulo}`);
      if (a.comentarioObrigatorio && !estado?.comentario.trim()) {
        lista.push(`Preencher comentário obrigatório: ${a.titulo}`);
      }
    });
    if (!contatoExistente) {
      const faltandoContato = contatoValido(contatoNovo);
      if (faltandoContato.length > 0) {
        lista.push("Informar contato do órgão (obrigatório para emitir o relatório): " + faltandoContato.join(", "));
      }
    }
    return lista;
  }, [achados, estados, contatoExistente, contatoNovo]);

  const podeGerarRelatorio = resultado !== null && pendencias.length === 0;

  async function gerarRelatorio() {
    if (!resultado || !orgao) return;
    setGerandoRelatorio(true);
    setErro(null);
    try {
      const payload = {
        orgaoId: orgao.id,
        contatoId: contatoExistente?.id,
        novoContato: contatoExistente ? undefined : contatoNovo,
        nomeArquivoTr: arquivo?.name || nomeArquivoRascunho || "TR",
        resultado,
        achados: achados.map((a) => ({ ...a, estado: estados[a.id] })),
        mensagensOk,
        processoId: processoId || undefined,
        cadastroId: cadastroId || undefined,
      };

      const resp = await fetch("/api/tr/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.erro || "Falha ao gerar o relatório.");
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Analise TR - ${orgao.tipo_ente} de ${orgao.razao_social}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setRelatorioGerado(true);
      onFinalizado?.();
    } catch (err: any) {
      setErro(err.message || "Erro inesperado ao gerar o relatório.");
    } finally {
      setGerandoRelatorio(false);
    }
  }

  if (carregandoOrgao) {
    return <p>Carregando...</p>;
  }

  if (!orgao) {
    return <p className="msg erro">{erroOrgao || "Órgão não encontrado."}</p>;
  }

  return (
    <div>
      <p style={{ marginTop: 0, marginBottom: 16, fontSize: 13, color: "var(--texto-suave)" }}>
        Objeto: Securitização de Dívida Ativa — FIA Fundação Instituto de Administração
      </p>

      <section className="card">
        <h2>1. Órgão e TR</h2>
        <p>
          <strong>{orgao.razao_social}</strong> — {orgao.cidade}/{orgao.uf} ({orgao.tipo_ente})
        </p>

        {carregandoRascunho && (
          <p className="msg" style={{ color: "#667085" }}>
            🔍 Verificando se este processo já tem uma análise salva...
          </p>
        )}
        {autoBuscando && (
          <p className="msg" style={{ color: "#667085" }}>
            🔍 Carregando o TR já anexado a este processo e analisando automaticamente...
          </p>
        )}
        {relatorioGerado && (
          <p className="msg" style={{ color: "#1f7a3d" }}>
            ✓ Relatório já gerado para este processo. Você pode gerar de novo se revisar algo.
          </p>
        )}
        {autoErro && !autoBuscando && !resultado && <p className="msg erro">{autoErro}</p>}

        <div className="field" style={{ marginTop: 10 }}>
          <label>TR recebido (PDF ou DOCX) *</label>
          <input
            type="file"
            accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="actions">
          <button className="btn" onClick={enviarParaAnalise} disabled={analisando || autoBuscando || carregandoRascunho}>
            {analisando ? "Analisando (pode levar até 1 minuto)..." : "Analisar TR"}
          </button>
          {erro && <span className="msg erro">{erro}</span>}
        </div>
      </section>

      {resultado && (
        <>
          {modoLeitura === "imagem" && (
            <div className="card" style={{ background: "#fff3cd", borderColor: "#7a5a00" }}>
              <strong style={{ color: "#7a5a00" }}>
                Este TR não tinha texto selecionável (provavelmente um documento escaneado) — foi lido
                diretamente pela IA a partir das imagens das páginas. Revise os achados com atenção redobrada.
              </strong>
            </div>
          )}

          <section className="card">
            <h2>2. Achados que exigem sua atenção ({achados.length})</h2>
            {achados.length === 0 && (
              <p style={{ color: "#1f7a3d" }}>Nenhum ponto de atenção identificado neste TR.</p>
            )}

            {achados.map((a) => {
              const estado = estados[a.id] || { ciente: false, comentario: "" };
              return (
                <div className="item-analise" key={a.id}>
                  <div className="item-analise-cabecalho">
                    <span className="etapa-badge">
                      Item {a.itemNumero} — {a.titulo}
                    </span>
                    <span className={`decisao-tag ${estado.ciente ? "decisao-aceita" : "decisao-pendente"}`}>
                      {estado.ciente ? "Ciente" : "Ciência pendente"}
                    </span>
                  </div>

                  <p className="item-analise-resumo">{a.texto}</p>

                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 10 }}>
                    <input
                      type="checkbox"
                      checked={estado.ciente}
                      onChange={(e) => marcarCiente(a.id, e.target.checked)}
                    />
                    Estou ciente
                  </label>

                  {a.comentarioObrigatorio ? (
                    <div className="field">
                      <label>Comentário / justificativa (obrigatório)</label>
                      <textarea
                        value={estado.comentario}
                        onChange={(e) => atualizarComentario(a.id, e.target.value)}
                        rows={3}
                      />
                    </div>
                  ) : (
                    <ComentarioOpcional
                      valor={estado.comentario}
                      onChange={(v) => atualizarComentario(a.id, v)}
                    />
                  )}
                </div>
              );
            })}
          </section>

          {mensagensOk.length > 0 && (
            <section className="card">
              <h2>3. Itens sem pontos de atenção ({mensagensOk.length})</h2>
              {mensagensOk.map((msg, idx) => (
                <div className="item-analise item-ok" key={idx}>
                  <span>{msg}</span>
                </div>
              ))}
            </section>
          )}

          <section className="card">
            <h2>4. Gerar relatório final (PDF)</h2>

            {contatoExistente ? (
              <p style={{ fontSize: 13, color: "#667085" }}>
                Responsável: {contatoExistente.nome_completo} ({contatoExistente.cargo})
              </p>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 13, color: "#667085" }}>
                  O órgão ainda não tem nenhum contato cadastrado. Informe um contato para liberar o relatório
                  (isso não interfere no resultado da análise, apenas identifica o responsável no documento).
                </p>
                <div className="grid">
                  <div className="field">
                    <label>Nome completo do responsável *</label>
                    <input
                      value={contatoNovo.nomeCompleto}
                      onChange={(e) => setContatoNovo((c) => ({ ...c, nomeCompleto: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Cargo *</label>
                    <input
                      value={contatoNovo.cargo}
                      onChange={(e) => setContatoNovo((c) => ({ ...c, cargo: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Telefone (com DDD) *</label>
                    <input
                      value={contatoNovo.telefone || ""}
                      onChange={(e) => setContatoNovo((c) => ({ ...c, telefone: mascaraTelefone(e.target.value) }))}
                      placeholder="(11) 91234-5678"
                      inputMode="numeric"
                      maxLength={15}
                    />
                  </div>
                  <div className="field">
                    <label>E-mail *</label>
                    <input
                      type="email"
                      value={contatoNovo.email}
                      onChange={(e) => setContatoNovo((c) => ({ ...c, email: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            )}

            {pendencias.length > 0 ? (
              <div>
                <p className="msg erro">
                  Ainda faltam {pendencias.length} pendência(s) para liberar o relatório:
                </p>
                <ul style={{ fontSize: 13, color: "#33383d" }}>
                  {pendencias.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p style={{ color: "#1f7a3d" }}>
                Todas as ciências e campos obrigatórios foram preenchidos. Relatório liberado.
              </p>
            )}
            <div className="actions">
              <button className="btn" onClick={gerarRelatorio} disabled={!podeGerarRelatorio || gerandoRelatorio}>
                {gerandoRelatorio ? "Gerando relatório..." : "Gerar relatório (PDF)"}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function ComentarioOpcional({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const [aberto, setAberto] = useState(valor.length > 0);
  if (!aberto) {
    return (
      <button type="button" className="btn secondary" onClick={() => setAberto(true)}>
        Incluir justificativa / comentário
      </button>
    );
  }
  return (
    <div className="field">
      <label>Comentário / justificativa (opcional)</label>
      <textarea value={valor} onChange={(e) => onChange(e.target.value)} rows={3} />
    </div>
  );
}

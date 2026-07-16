"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Achado, AchadoEstado, ResultadoAnaliseTR } from "@/lib/tr/types";
import { gerarAchados, itensSemAchados } from "@/lib/tr/regras";
import { NovoContatoInput, OrgaoComContatos, contatoValido } from "@/lib/orgaos/types";
import { mascaraTelefone } from "@/lib/mascaras";

function novoContatoVazio(): NovoContatoInput {
  return { nomeCompleto: "", cargo: "", telefone: "", email: "" };
}

export default function AnaliseTRPage() {
  return (
    <Suspense fallback={<main><div className="page"><p>Carregando...</p></div></main>}>
      <AnaliseTRConteudo />
    </Suspense>
  );
}

function AnaliseTRConteudo() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orgaoId = searchParams.get("orgao");

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

  const achados = useMemo(() => (resultado ? gerarAchados(resultado) : []), [resultado]);
  const mensagensOk = useMemo(
    () => (resultado ? itensSemAchados(resultado, achados) : []),
    [resultado, achados]
  );

  useEffect(() => {
    if (!orgaoId) {
      router.replace("/orgaos");
      return;
    }
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

  async function enviarParaAnalise() {
    setErro(null);

    if (!arquivo) {
      setErro("Selecione o arquivo do TR (PDF) enviado pelo ente.");
      return;
    }

    setAnalisando(true);
    setResultado(null);
    setEstados({});
    try {
      const formData = new FormData();
      formData.append("arquivo", arquivo);

      const resp = await fetch("/api/tr/analyze", { method: "POST", body: formData });
      const dados = await resp.json();

      if (!resp.ok || !dados.ok) {
        throw new Error(dados.erro || "Falha ao analisar o TR.");
      }

      const res: ResultadoAnaliseTR = dados.resultado;
      const novosAchados = gerarAchados(res);
      const novoEstado: Record<string, AchadoEstado> = {};
      novosAchados.forEach((a) => {
        novoEstado[a.id] = { ciente: false, comentario: "" };
      });
      setResultado(res);
      setEstados(novoEstado);
      setModoLeitura(dados.modo === "imagem" ? "imagem" : "texto");
    } catch (err: any) {
      setErro(err.message || "Erro inesperado ao analisar o TR.");
    } finally {
      setAnalisando(false);
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
        nomeArquivoTr: arquivo?.name || "",
        resultado,
        achados: achados.map((a) => ({ ...a, estado: estados[a.id] })),
        mensagensOk,
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
    } catch (err: any) {
      setErro(err.message || "Erro inesperado ao gerar o relatório.");
    } finally {
      setGerandoRelatorio(false);
    }
  }

  if (carregandoOrgao) {
    return (
      <main>
        <div className="page">
          <p>Carregando...</p>
        </div>
      </main>
    );
  }

  if (!orgao) {
    return (
      <main>
        <div className="page">
          <p className="msg erro">{erroOrgao || "Órgão não encontrado."}</p>
          <Link href="/orgaos">← voltar aos órgãos</Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <header className="topo">
        <h1>Análise de Termo de Referência</h1>
        <p>Objeto: Securitização de Dívida Ativa — FIA Fundação Instituto de Administração</p>
      </header>

      <div className="page">
        <p style={{ marginBottom: 20 }}>
          <Link href={`/orgaos/${orgao.id}`}>← voltar ao órgão</Link>
        </p>

        <section className="card">
          <h2>1. Órgão e TR</h2>
          <p>
            <strong>{orgao.razao_social}</strong> — {orgao.cidade}/{orgao.uf} ({orgao.tipo_ente})
          </p>

          <div className="field" style={{ marginTop: 10 }}>
            <label>TR recebido (PDF) *</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="actions">
            <button className="btn" onClick={enviarParaAnalise} disabled={analisando}>
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
    </main>
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

"use client";

/** SADA · Atualização da Dívida — sobe uma planilha (.xlsx) e atualiza os
 * dados de um tipo (dívida ativa, lançamentos, recebimentos, recebimentos DA).
 *
 * A leitura do arquivo e o envio dos lotes rodam num WEB WORKER
 * (importador.worker.ts). Antes rodavam aqui, na thread da interface, e a aba
 * congelava: medido com as planilhas reais, 19 s na dívida ativa e 43 s em
 * lançamentos sem desenhar nada — nem a barra de progresso, nem o texto de
 * status. Agora esta tela só conversa com o worker e mostra o andamento.
 *
 * O lote novo entra como vigente e o anterior é preservado como histórico. */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ComoUsar, Dica } from "@/app/components/Ajuda";
import { RelatorioQualidade, ROTULO_TIPO, TIPOS_SADA, TipoSada } from "@/lib/sada/import";
import { AbaEscolhida, AbasModo, camposDoTipo, Mapa } from "@/lib/sada/depara";
import { somenteDigitos } from "@/lib/mascaras";
import type { DoWorker, ParaWorker } from "./importador.worker";

/**
 * Linhas por requisição.
 *
 * Eram 1.000: num arquivo de 350 mil linhas, 350 requisições — e cada uma paga
 * a ida e volta inteira, mais a checagem de sessão no servidor. 2.500 dá um
 * corpo de ~500 KB, bem dentro do limite de 4,5 MB da plataforma e do teto de
 * 5.000 linhas que a rota aceita, e corta o número de requisições por 2,5.
 * O worker ainda mantém três no ar ao mesmo tempo.
 */
const LOTE = 2500;

/**
 * Acima disto o arquivo NÃO passa pelo navegador.
 *
 * Medido nesta máquina: a aba recusa alocar 2 GB de uma vez (RangeError) e a
 * leitura consome de 35 a 50 vezes o tamanho do arquivo, contra um teto de
 * ~4 GB por aba. 80 MB deixa folga confortável dentro disso; acima, o arquivo
 * é enviado ao servidor, que lê em streaming.
 */
const LIMITE_NAVEGADOR = 80 * 1024 * 1024;

/** Duração em português curto: "40 s", "3 min", "1 h 12 min". */
function duracao(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

/** Nome técnico do campo -> rótulo de gente, para a lista de "não coberto". */
function rotuloCampo(campo: string): string {
  for (const tipo of TIPOS_SADA) {
    const achado = camposDoTipo(tipo, "ano_na_coluna").find((c) => c.campo === campo);
    if (achado) return achado.rotulo.replace(/\s*\(.*\)$/, "").toLowerCase();
  }
  return campo;
}

/** Um arquivo na fila de importação. */
interface ItemFila {
  arquivo: File;
  estado: "pendente" | "rodando" | "concluido" | "erro";
  /** Resultado (linhas e anos) ou o motivo da falha. */
  mensagem?: string;
}

/** Acompanhamento de uma importação feita pelo servidor. */
interface JobServidor {
  id: number;
  status: "recebendo" | "lendo" | "gravando" | "concluido" | "erro" | "cancelado";
  linhas_lidas: number;
  linhas_gravadas: number;
  anos: number[] | null;
  mensagem: string | null;
  erro: string | null;
}

interface ConfigDePara {
  mapa: Mapa;
  abasModo: AbasModo;
  abas: AbaEscolhida[] | null;
  padrao: boolean;
  /** Nomes de todos os mapas do ente+tipo — alimenta o seletor. */
  nomes: string[];
  /** Campos obrigatórios dispensados neste mapa. */
  opcionais: string[];
  pares: { campo: "sigla" | "fase"; valor_origem: string; valor_canonico: string }[];
}

export default function AtualizacaoDivida() {
  const [tipo, setTipo] = useState<TipoSada>("divida_ativa");
  const [cnpj, setCnpj] = useState("");
  /**
   * Fila de arquivos.
   *
   * Um export grande costuma vir partido — o T-1138 virou cinco arquivos, um
   * por faixa de anos. Com um arquivo por vez, a pessoa voltava à tela cinco
   * vezes e precisava lembrar a ordem. Aqui ela escolhe todos de uma vez e a
   * tela importa um depois do outro, mostrando onde parou.
   *
   * Cada item vira um lote próprio, como se tivesse sido enviado sozinho: a
   * regra de aposentar só os lotes dos mesmos anos é que faz isso funcionar.
   */
  const [fila, setFila] = useState<ItemFila[]>([]);
  const [indice, setIndice] = useState(0);
  const arquivo = fila[indice]?.arquivo ?? null;
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [status, setStatus] = useState("");
  const [erro, setErro] = useState("");
  const [concluido, setConcluido] = useState<string | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioQualidade | null>(null);
  // Qual DE/PARA usar. Vazio = deixa o servidor escolher o mais recente, que é
  // o comportamento de quando só podia existir um mapa por ente+tipo.
  const [mapaNome, setMapaNome] = useState("");
  const [mapasDisponiveis, setMapasDisponiveis] = useState<string[]>([]);
  /** Importação em curso no servidor (arquivo grande). */
  const [job, setJob] = useState<JobServidor | null>(null);
  /** O que este servidor aguenta. Nulo enquanto não respondeu. */
  const [capacidade, setCapacidade] = useState<{ suportaGrande: boolean; via: string } | null>(null);

  /** Quando a execução atual começou — base do tempo restante. */
  const inicio = useRef<number | null>(null);
  const [restante, setRestante] = useState<string | null>(null);

  const worker = useRef<Worker | null>(null);
  /** Resolve ou rejeita a mensagem que está em curso no worker. */
  const emCurso = useRef<{ ok: (m: DoWorker) => void; falha: (e: Error) => void } | null>(null);
  /** O que já está lido DENTRO do worker — evita reler o arquivo quando o
   *  usuário confirma os avisos. */
  const analisado = useRef<
    { arquivo: File; tipo: TipoSada; cnpj: string; mapa: string; anos: number[] } | null
  >(null);

  /** Um worker por tela. Encerrado ao sair: um worker vivo depois da
   *  navegação continuaria segurando a planilha inteira em memória. */
  useEffect(() => {
    const w = new Worker(new URL("./importador.worker.ts", import.meta.url));
    w.onmessage = (e: MessageEvent<DoWorker>) => {
      const m = e.data;
      if (m.tipo === "status") { setStatus(m.texto); return; }
      if (m.tipo === "progresso") { setProgresso(m.pct); return; }
      const pendente = emCurso.current;
      emCurso.current = null;
      if (!pendente) return;
      if (m.tipo === "erro") pendente.falha(new Error(m.mensagem));
      else pendente.ok(m);
    };
    w.onerror = () => {
      const pendente = emCurso.current;
      emCurso.current = null;
      pendente?.falha(new Error("Falha ao processar a planilha no navegador."));
    };
    worker.current = w;
    return () => { w.terminate(); worker.current = null; };
  }, []);

  /**
   * Tempo restante, estimado pelo ritmo até agora.
   *
   * Só a partir de 5%: antes disso a conta é dominada pela leitura inicial e
   * produziria números absurdos ("faltam 2 h") que ninguém leva a sério
   * depois. Fica em silêncio enquanto não há base para estimar — é o caso do
   * caminho do servidor, que não reporta percentual durante a leitura.
   */
  useEffect(() => {
    if (!rodando) { inicio.current = null; setRestante(null); return; }
    if (inicio.current === null) inicio.current = Date.now();
    if (progresso < 5 || progresso >= 100) { setRestante(null); return; }
    const decorrido = Date.now() - inicio.current;
    setRestante(duracao((decorrido / progresso) * (100 - progresso)));
  }, [rodando, progresso]);

  // Pergunta ao servidor, ao abrir a tela, se ele aguenta arquivo grande.
  // Sem isto a pessoa só descobriria a recusa depois de escolher um arquivo de
  // 2 GB e ver o envio ser barrado.
  useEffect(() => {
    fetch("/api/sada/importar/arquivo?capacidade=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setCapacidade({ suportaGrande: !!j.suportaGrande, via: String(j.via) }))
      .catch(() => {});
  }, []);

  /** Manda uma mensagem e espera a resposta final (análise, envio ou erro). */
  function pedir(msg: ParaWorker, transferir?: Transferable[]): Promise<DoWorker> {
    const w = worker.current;
    if (!w) return Promise.reject(new Error("Processador da planilha indisponível."));
    return new Promise<DoWorker>((ok, falha) => {
      emCurso.current = { ok, falha };
      w.postMessage(msg, transferir ?? []);
    });
  }

  /** Troca de arquivo/tipo invalida a verificação anterior. */
  function resetarVerificacao() {
    setRelatorio(null); setErro(""); setConcluido(null);
    analisado.current = null;
  }

  /** Busca o DE/PARA do ente. Sem cadastro a API devolve o layout posicional
   *  padrão (`padrao: true`), então esta tela funciona igual para ente antigo. */
  async function carregarDePara(cnpjLimpo: string, t: TipoSada, nome: string): Promise<ConfigDePara> {
    const q = nome ? `&nome=${encodeURIComponent(nome)}` : "";
    const r = await fetch(`/api/sada/depara?cnpj=${encodeURIComponent(cnpjLimpo)}&tipo=${t}${q}`);
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro || "Falha ao carregar o DE/PARA do ente.");

    const rv = await fetch(`/api/sada/depara/valores?cnpj=${encodeURIComponent(cnpjLimpo)}`);
    const jv = await rv.json().catch(() => ({ pares: [] }));

    return {
      mapa: j.depara.mapa ?? {},
      abasModo: j.depara.abas_modo ?? "ano_no_nome",
      abas: j.depara.abas ?? null,
      padrao: !!j.padrao,
      nomes: j.nomes ?? [],
      opcionais: j.depara.campos_opcionais ?? [],
      pares: rv.ok
        ? (jv.pares ?? []).filter((p: { campo: string }) => p.campo === "sigla" || p.campo === "fase")
        : [],
    };
  }

  /** Lista os mapas do ente+tipo para o seletor. Silencioso de propósito:
   *  falhar aqui não impede importar, só esconde a escolha. */
  async function carregarMapas(t: TipoSada) {
    const c = somenteDigitos(cnpj);
    if (!c) { setMapasDisponiveis([]); return; }
    try {
      const r = await fetch(`/api/sada/depara?cnpj=${encodeURIComponent(c)}&tipo=${t}`);
      const j = await r.json();
      const nomes: string[] = r.ok ? (j.nomes ?? []) : [];
      setMapasDisponiveis(nomes);
      setMapaNome((atual) => (nomes.includes(atual) ? atual : ""));
    } catch {
      setMapasDisponiveis([]);
    }
  }

  async function post(url: string, body: unknown) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
    return j;
  }

  /**
   * `forcar` = usuário já viu os avisos e mandou seguir mesmo assim.
   *
   * O arquivo e a posição na fila vêm por PARÂMETRO, não do estado: ao
   * encadear o próximo da fila, `setIndice` ainda não terá surtido efeito e
   * esta função importaria o arquivo anterior de novo.
   */
  async function atualizar(forcar = false, alvo?: File, posicao?: number) {
    const arq = alvo ?? arquivo;
    const pos = posicao ?? indice;
    setErro(""); setConcluido(null);
    if (!cnpj.trim()) { setErro("Informe o CNPJ do ente."); return; }
    if (!arq) { setErro("Selecione a planilha (.xlsx)."); return; }

    // Recusa antes de começar: subir 2 GB para receber "não suportado" no fim
    // seria desperdiçar a espera inteira.
    if (arq.size > LIMITE_NAVEGADOR && capacidade?.suportaGrande === false) {
      setErro(
        `Este servidor lê no máximo ${Math.round(LIMITE_NAVEGADOR / 1048576)} MB por arquivo ` +
        "(não tem disco próprio). Peça o arquivo dividido — por ano, por exemplo — ou em CSV menor.",
      );
      return;
    }

    setRodando(true); setProgresso(0); setStatus("Preparando…"); setJob(null);
    marcar(pos, "rodando");
    let importacaoId: number | null = null;
    /** Encadear o próximo DENTRO do try ligava o arquivo seguinte antes de
     *  este terminar, e o `finally` daqui apagava o "rodando" com a próxima
     *  importação já em curso. O encadeamento é no fim, depois do finally. */
    let seguir = false;

    try {
      // Arquivo grande não passa pelo navegador: sobe para o servidor, que lê
      // em streaming. A verificação de qualidade continua existindo — só que
      // roda lá, com o mesmo código.
      if (arq.size > LIMITE_NAVEGADOR) {
        await enviarAoServidor(arq);
        return;
      }
      // Só dígitos: a mesma chave usada pelo DE/PARA e gravada nas tabelas.
      const cnpjLimpo = somenteDigitos(cnpj);

      // Planilha já lida no worker: confirmar os avisos não reabre o arquivo
      // — são dezenas de segundos de leitura a menos.
      const feito = analisado.current;
      let anos: number[];
      if (forcar && feito && feito.arquivo === arq && feito.tipo === tipo
          && feito.cnpj === cnpjLimpo && feito.mapa === mapaNome) {
        anos = feito.anos;
      } else {
        setStatus("Carregando o DE/PARA do ente…");
        const cfg = await carregarDePara(cnpjLimpo, tipo, mapaNome);

        const buffer = await arq.arrayBuffer();
        // O ArrayBuffer é TRANSFERIDO, não copiado: são dezenas de MB.
        const resp = await pedir(
          {
            acao: "analisar",
            arquivo: buffer,
            tipo,
            cnpj: cnpjLimpo,
            cfg: {
              mapa: cfg.mapa,
              abasModo: cfg.abasModo,
              abas: cfg.abas,
              opcionais: cfg.opcionais,
              pares: cfg.pares,
            },
          },
          [buffer],
        );
        if (resp.tipo !== "analise") throw new Error("Resposta inesperada do processador.");

        setRelatorio(resp.relatorio);
        analisado.current = { arquivo: arq, tipo, cnpj: cnpjLimpo, mapa: mapaNome, anos: resp.anos };
        anos = resp.anos;

        if (resp.relatorio.temBloqueio) {
          throw new Error(
            "A planilha tem dados incorretos ou vazios que impedem a importação. " +
            "Corrija na origem e envie novamente — nada foi alterado.",
          );
        }
        // Só avisos: espera a confirmação explícita do usuário.
        if (resp.relatorio.achados.length > 0 && !forcar) return;
      }

      // O lote só é aberto depois da verificação — e nasce não vigente. O
      // retrato anterior continua valendo durante toda a carga e só é
      // aposentado em /finalizar, com as linhas todas no lugar.
      setStatus("Iniciando importação…");
      setProgresso(0);
      const ini = await post("/api/sada/importar", {
        cnpj: cnpjLimpo, tipo, arquivoNome: arq.name,
        // Sem isto o servidor aposenta todos os lotes do ente+tipo, e uma
        // importação de um ano só faz os demais sumirem dos dashboards.
        anos,
      });
      importacaoId = ini.importacaoId;

      const fim = await pedir({ acao: "enviar", importacaoId: importacaoId as number, lote: LOTE });
      if (fim.tipo !== "enviado") throw new Error("Resposta inesperada do processador.");

      setStatus("Finalizando…");
      await post("/api/sada/importar/finalizar", {
        importacaoId,
        total: fim.total,
        anoInicio: Math.min(...anos),
        anoFim: Math.max(...anos),
      });

      setProgresso(100);
      setRelatorio(null);
      analisado.current = null;
      const resultado =
        `${fim.total.toLocaleString("pt-BR")} linhas atualizadas ` +
        `(${Math.min(...anos)}–${Math.max(...anos)}).`;
      setConcluido(resultado);
      marcar(pos, "concluido", resultado);
      seguir = true;
    } catch (e) {
      setErro((e as Error).message);
      marcar(pos, "erro", (e as Error).message);
      if (importacaoId) {
        // desfaz o lote incompleto para não deixar dado parcial
        await post("/api/sada/importar/finalizar", { importacaoId, cancelar: true }).catch(() => {});
      }
      // A fila PARA no erro, de propósito: seguir adiante enterraria a falha
      // numa tela que continua rolando, e o arquivo seguinte pode depender de
      // o anterior ter entrado. Quem decide pular é a pessoa.
    } finally {
      setRodando(false); setStatus("");
      if (seguir) seguirFila(pos);
    }
  }

  /** Marca um item da fila sem depender do estado anterior em closure. */
  function marcar(pos: number, estado: ItemFila["estado"], mensagem?: string) {
    setFila((f) => f.map((it, i) => (i === pos ? { ...it, estado, mensagem } : it)));
  }

  /** Vai para o próximo arquivo pendente, se houver. */
  function seguirFila(pos: number) {
    const prox = pos + 1;
    if (prox >= fila.length) return;
    setIndice(prox);
    resetarVerificacao();
    void atualizar(false, fila[prox].arquivo, prox);
  }

  /** Pula o arquivo que falhou e continua a fila. */
  function pularEContinuar() {
    setErro(""); setRelatorio(null);
    seguirFila(indice);
  }

  /** Interrompe o envio. O worker para no lote seguinte e o catch acima
   *  cancela a importação, para não deixar meia planilha no banco. */
  function cancelar() {
    if (job) {
      void fetch(`/api/sada/importar/arquivo?id=${job.id}`, { method: "DELETE" });
      setStatus("Cancelando…");
      return;
    }
    worker.current?.postMessage({ acao: "cancelar" } as ParaWorker);
    setStatus("Cancelando…");
  }

  /**
   * Caminho dos arquivos grandes: sobe o arquivo e acompanha o servidor.
   *
   * O upload usa XMLHttpRequest e não fetch porque só ele informa o quanto já
   * subiu — num arquivo de vários GB, ficar sem retorno por meia hora é
   * indistinguível de travamento.
   */
  async function enviarAoServidor(arq: File) {
    const cnpjLimpo = somenteDigitos(cnpj);
    const url =
      `/api/sada/importar/arquivo?cnpj=${encodeURIComponent(cnpjLimpo)}&tipo=${tipo}` +
      `&arquivo=${encodeURIComponent(arq.name)}` +
      (mapaNome ? `&mapa=${encodeURIComponent(mapaNome)}` : "");

    setStatus("Enviando o arquivo ao servidor…");
    const id = await new Promise<number>((ok, falha) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgresso(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let j: { id?: number; erro?: string } = {};
        try { j = JSON.parse(xhr.responseText); } catch { /* resposta não-JSON */ }
        if (xhr.status >= 200 && xhr.status < 300 && j.id) ok(j.id);
        else falha(new Error(j.erro || `Falha no envio (HTTP ${xhr.status}).`));
      };
      xhr.onerror = () => falha(new Error("Conexão interrompida durante o envio."));
      xhr.send(arq);
    });

    setProgresso(0);
    setStatus("Arquivo recebido. O servidor está lendo…");
    await acompanhar(id);
  }

  /** Pergunta o andamento ao servidor até terminar. */
  async function acompanhar(id: number) {
    for (;;) {
      await new Promise((r) => setTimeout(r, 3000));
      const r = await fetch(`/api/sada/importar/arquivo?id=${id}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Falha ao consultar o andamento.");

      const atual = j.importacao as JobServidor;
      setJob(atual);
      setStatus(atual.mensagem || atual.status);
      if (atual.linhas_lidas > 0) {
        // Sem saber o total de linhas de antemão, o número lido é a única
        // medida honesta de andamento — não há percentual a mostrar.
        setStatus(
          `${atual.status === "gravando" ? "Lendo e gravando" : "Lendo"}: ` +
          `${Number(atual.linhas_lidas).toLocaleString("pt-BR")} linhas…`,
        );
      }

      if (atual.status === "concluido") {
        setProgresso(100);
        const anos = atual.anos ?? [];
        setConcluido(
          `${Number(atual.linhas_gravadas).toLocaleString("pt-BR")} linhas atualizadas` +
          (anos.length ? ` (${anos[0]}–${anos[anos.length - 1]})` : "") + ".",
        );
        return;
      }
      if (atual.status === "erro") throw new Error(atual.erro || "A importação falhou.");
      if (atual.status === "cancelado") throw new Error("Importação cancelada. Nada foi publicado.");
    }
  }

  return (
    <main className="sada-wrap">
      <header className="sada-head">
        <div>
          <h1>Atualização da Dívida</h1>
          <p className="sub">
            Suba a planilha (.xlsx) de um tipo. Os dados anteriores do mesmo ente e tipo
            viram histórico; o novo passa a valer no dashboard.
          </p>
        </div>
        <Link href="/sada" className="landing-cta secundario">← Dashboard</Link>
      </header>

      <div style={{ maxWidth: 560 }}>
        <ComoUsar chave="atualizacao" titulo="Como subir a planilha — passo a passo">
          <ol>
            <li>
              <strong>Escolha o tipo.</strong> Cada tipo tem colunas próprias e é
              guardado separado: subir lançamentos no lugar de dívida ativa não
              mistura os dados, mas deixa o tipo certo desatualizado.
            </li>
            <li>
              <strong>Informe o CNPJ do ente.</strong> É a chave que liga a planilha
              ao DE/PARA. Pontuação é ignorada.
            </li>
            <li>
              <strong>Confira o DE/PARA.</strong> É ele que diz de qual coluna da
              planilha sai cada campo. Se o ente ainda não tiver mapa cadastrado, o
              sistema lê <strong>por posição</strong> (1ª coluna, 2ª coluna…) — o que
              só funciona se o arquivo vier exatamente no layout histórico. Cadastre
              antes em <Link href="/sada/depara">DE/PARA</Link>.
            </li>
            <li>
              <strong>Selecione o arquivo</strong> e clique em <strong>Atualizar
              dívida</strong>.
            </li>
            <li>
              <strong>Leia o resultado da conferência.</strong> A planilha é lida e
              verificada <em>antes</em> de qualquer gravação: nada entra no banco
              enquanto isso. Item <span className="tag bloqueio">impeditivo</span>{" "}
              barra a importação — corrija na origem e envie de novo. Item{" "}
              <span className="tag aviso">aviso</span> deixa você decidir, em
              &ldquo;Importar mesmo assim&rdquo;, e fica registrado na tela de Qualidade.
            </li>
          </ol>

          <p>
            <strong>Como o arquivo precisa chegar:</strong> a primeira linha de cada
            aba é o cabeçalho, com o nome das colunas. O ano de cada linha vem de onde
            o DE/PARA mandar: do nome da aba (<code>2023</code>, <code>2024</code>…),
            das abas que você escolheu, ou de uma coluna com o ano. Linhas totalmente
            vazias são descartadas; valores como <code>1.234,56</code> e{" "}
            <code>1234.56</code> são entendidos dos dois jeitos.
          </p>
          <p>
            <strong>O que acontece com o que já estava lá:</strong> o lote novo passa a
            valer e o anterior vira histórico — mas só são aposentados os lotes que
            cobrem <em>os mesmos anos</em>. Importar 2026 não derruba o lote de
            2015–2025. Se a importação falhar ou for cancelada no meio, nada é
            publicado e o retrato anterior continua valendo.
          </p>
        </ComoUsar>
      </div>

      <section className="card" style={{ maxWidth: 560 }}>
        <div className="field">
          <label>
            Tipo de planilha
            <Dica
              titulo="Qual tipo escolher"
              texto={
                <>
                  <strong style={{ display: "block", color: "inherit", marginTop: 6 }}>
                    Dívida ativa
                  </strong>
                  os títulos inscritos em dívida, com principal, atualização, juros,
                  multa e total.
                  <br /><strong style={{ display: "block", color: "inherit", marginTop: 6 }}>
                    Lançamentos
                  </strong>
                  o que foi lançado no exercício (mês do lançamento, exercício, valor).
                  <br /><strong style={{ display: "block", color: "inherit", marginTop: 6 }}>
                    Recebimentos / Recebimentos DA
                  </strong>
                  os pagamentos — o segundo é o que foi pago de dívida ativa. Ambos
                  trazem os valores do DAM (VLAM, VLJM, VLMM, desconto, total).
                  <br />
                  Cada tipo tem o seu próprio DE/PARA e o seu próprio lote vigente.
                </>
              }
            />
          </label>
          <select value={tipo} disabled={rodando}
            onChange={(e) => {
              const t = e.target.value as TipoSada;
              setTipo(t); resetarVerificacao(); void carregarMapas(t);
            }}>
            {TIPOS_SADA.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
          </select>
        </div>

        <div className="field">
          <label>
            CNPJ do ente
            <Dica
              titulo="Precisa ser o mesmo do DE/PARA"
              texto={
                <>
                  O ente é identificado só pelos 14 dígitos — pontuação é ignorada.
                  Se o CNPJ digitado aqui não for o mesmo cadastrado no DE/PARA, o
                  sistema não acha o mapa e volta a ler a planilha por posição, sem
                  reclamar de nada: os dados entram nas colunas erradas.
                </>
              }
            />
          </label>
          <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="Somente números"
            onBlur={() => void carregarMapas(tipo)} disabled={rodando} />
          <small>A pontuação é ignorada — o ente é identificado só pelos dígitos.</small>
        </div>

        {mapasDisponiveis.length > 1 && (
          <div className="field">
            <label>
              DE/PARA a usar
              <Dica
                titulo="Quando existe mais de um mapa"
                texto={
                  <>
                    Aparece porque este ente tem mais de um DE/PARA para este tipo —
                    normalmente quando trocou de sistema e os arquivos antigos e novos
                    têm cabeçalhos diferentes. Escolha o que corresponde ao arquivo que
                    está subindo; &ldquo;Mais recente&rdquo; usa o último salvo.
                  </>
                }
              />
            </label>
            <select value={mapaNome} disabled={rodando}
              onChange={(e) => { setMapaNome(e.target.value); resetarVerificacao(); }}>
              <option value="">Mais recente</option>
              {mapasDisponiveis.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <small>Este ente tem mais de um mapa cadastrado para este tipo de planilha.</small>
          </div>
        )}

        <div className="field">
          <label>
            Planilha (.xlsx)
            <Dica
              titulo="O que o arquivo precisa ter"
              texto={
                <>
                  Primeira linha de cada aba = cabeçalho com o nome das colunas. O ano
                  de cada linha vem de onde o DE/PARA disser: nome da aba, abas
                  escolhidas ou uma coluna de ano.
                  <br /><br />
                  Até {Math.round(LIMITE_NAVEGADOR / 1048576)} MB o arquivo é lido aqui
                  no navegador. Acima disso ele sobe para o servidor, que lê em
                  streaming — e nesse caso você pode fechar a aba: o trabalho continua
                  lá e o andamento fica guardado pelo número da importação.
                  <br /><br />
                  Arquivo de vários GB: peça <strong>CSV</strong> ao ente. Num .xlsx os
                  textos ficam numa tabela que precisa caber inteira na memória; o CSV
                  é lido linha a linha e é bem mais rápido.
                </>
              }
            />
          </label>
          <input type="file" accept=".xlsx" multiple disabled={rodando}
            onChange={(e) => {
              const escolhidos = Array.from(e.target.files ?? []);
              // Ordem alfabética: os arquivos partidos saem numerados ("1
              // (1995-2015)", "2 (2016-2019)"), então é a ordem que a pessoa
              // espera — e não a ordem em que o sistema operacional entregou.
              escolhidos.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
              setFila(escolhidos.map((f) => ({ arquivo: f, estado: "pendente" as const })));
              setIndice(0);
              resetarVerificacao();
            }} />
          <small>
            Uma aba por ano. Até {Math.round(LIMITE_NAVEGADOR / 1048576)} MB o arquivo
            é lido no próprio navegador.
            {capacidade?.suportaGrande === false ? (
              <> Acima disso <strong>este servidor não aceita</strong>: ele não tem disco
              próprio. Peça o arquivo dividido (por ano) ou em CSV menor.</>
            ) : (
              <> Acima disso ele é enviado ao servidor, que lê em streaming — é o único
              caminho para arquivos de 1 GB ou mais.
              {capacidade?.via === "api" && (
                <> Atenção: a gravação está pela API (sem conexão direta ao banco), o que
                deixa a carga bem mais lenta.</>
              )}</>
            )}
            {" "}Pode escolher <strong>vários de uma vez</strong>: entram numa fila e são
            importados um depois do outro, cada um virando seu próprio lote.
          </small>

          {/* A fila: onde está, o que já entrou e o que falhou. Com cinco
              arquivos, saber em qual deles parou é metade da informação. */}
          {fila.length > 0 && (
            <table className="sada-tabela" style={{ marginTop: 10 }}>
              <thead>
                <tr><th>Arquivo</th><th>Tamanho</th><th>Situação</th></tr>
              </thead>
              <tbody>
                {fila.map((it, i) => (
                  <tr key={`${it.arquivo.name}-${i}`}
                    style={i === indice && rodando ? { fontWeight: 600 } : undefined}>
                    <td>
                      {it.arquivo.name}
                      {it.mensagem && <><br /><small>{it.mensagem}</small></>}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {(it.arquivo.size / 1048576).toFixed(1)} MB
                      {it.arquivo.size > LIMITE_NAVEGADOR && (
                        <><br /><small>
                          {capacidade?.suportaGrande === false
                            ? "grande demais para este servidor"
                            : "vai pelo servidor"}
                        </small></>
                      )}
                    </td>
                    <td>
                      {it.estado === "pendente" && <span className="detalhe">na fila</span>}
                      {it.estado === "rodando" && <span className="tag aviso">importando</span>}
                      {it.estado === "concluido" && <span className="tag ok">concluído</span>}
                      {it.estado === "erro" && <span className="tag bloqueio">falhou</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {rodando && (
          <div style={{ margin: "12px 0" }}>
            <div style={{ height: 10, background: "var(--track)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progresso}%`, background: "var(--primaria)", transition: "width .2s" }} />
            </div>
            <p className="detalhe" style={{ marginTop: 6 }}>
              {status} {progresso > 0 ? `${progresso}%` : ""}
              {/* Numa carga de vários minutos, percentual sozinho não responde
                  a única pergunta que a pessoa tem: dá tempo de tomar um café? */}
              {restante && <> · faltam ~{restante}</>}
              {job && (
                <>
                  {" "}· acompanhamento nº {job.id} — pode fechar a aba e voltar depois.
                </>
              )}
            </p>
          </div>
        )}

        {/* Uma linha, em vez de um aviso por linha do arquivo. Sem isto, um
            export sem inscrição rendia "Inscrição vazia" em todas as linhas e
            enterrava os achados reais. */}
        {relatorio && relatorio.camposNaoCobertos?.length > 0 && (
          <p className="detalhe" style={{ marginTop: 12 }}>
            O DE/PARA deste ente não cobre{" "}
            <strong>{relatorio.camposNaoCobertos.map(rotuloCampo).join(", ")}</strong> — as
            verificações desses campos foram puladas. Se a planilha tiver essas colunas,
            falta mapeá-las em <Link href="/sada/depara">DE/PARA</Link>.
          </p>
        )}

        {relatorio && relatorio.achados.length > 0 && (
          <div className={`qualidade-relatorio ${relatorio.temBloqueio ? "bloqueio" : "aviso"}`}>
            <strong>
              {relatorio.temBloqueio
                ? "Importação bloqueada — dados incorretos ou vazios na planilha"
                : "Dados incorretos ou vazios encontrados"}
            </strong>
            <p className="detalhe">
              {relatorio.totalLinhas.toLocaleString("pt-BR")} linhas verificadas.
              {relatorio.temBloqueio
                ? " Corrija os itens marcados como impeditivos e envie de novo."
                : " Você pode importar mesmo assim — os avisos ficam registrados na tela de Qualidade."}
            </p>
            <ul>
              {relatorio.achados.map((a) => (
                <li key={a.codigo}>
                  <span className={`tag ${a.severidade}`}>
                    {a.severidade === "bloqueio" ? "impeditivo" : "aviso"}
                  </span>{" "}
                  {a.rotulo} — <strong>{a.qtd.toLocaleString("pt-BR")}</strong>
                  {a.qtd === 1 ? " linha" : " linhas"}
                  <br />
                  <small>
                    ex.: {a.exemplos.join("; ")}{a.qtd > a.exemplos.length ? "…" : ""}
                  </small>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="actions">
          <button className="btn" onClick={() => atualizar(false, arquivo ?? undefined, indice)} disabled={rodando}>
            {rodando ? "Atualizando…" : "Atualizar dívida"}
          </button>
          {rodando && (
            <button className="btn secondary" onClick={cancelar}>Cancelar</button>
          )}
          {relatorio && !relatorio.temBloqueio && relatorio.achados.length > 0 && !rodando && (
            <button className="btn secondary" onClick={() => atualizar(true, arquivo ?? undefined, indice)}>
              Importar mesmo assim
            </button>
          )}
          {/* A fila para no erro de proposito; continuar é decisão de quem
              olhou o motivo. Os arquivos são independentes entre si. */}
          {!rodando && fila[indice]?.estado === "erro" && indice + 1 < fila.length && (
            <button className="btn secondary" onClick={pularEContinuar}>
              Pular e importar o próximo ({fila.length - indice - 1} na fila)
            </button>
          )}
          {erro && <span className="msg erro">{erro}</span>}
          {concluido && <span className="msg ok">✅ {concluido}</span>}
        </div>
      </section>
    </main>
  );
}

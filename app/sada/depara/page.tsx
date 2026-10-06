"use client";

/**
 * SADA · DE/PARA — cada ente manda a planilha no layout do seu próprio
 * sistema. Aqui se declara a tradução: qual coluna da planilha alimenta qual
 * campo das tabelas sada_*, e qual valor de origem vira qual valor canônico.
 *
 * O arquivo enviado nesta tela NÃO é importado: serve só para ler o cabeçalho,
 * sugerir o mapa e mostrar o preview. A importação continua em /sada/atualizacao.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { somenteDigitos } from "@/lib/mascaras";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import Modal from "@/app/components/Modal";
import { ComoUsar, Dica } from "@/app/components/Ajuda";
import { ROTULO_TIPO, TIPOS_SADA, TipoSada } from "@/lib/sada/import";
import {
  AbaEscolhida, AbasModo, camposDoTipo, CampoValor, chaveValor, compilarMapa,
  ehConstante, Mapa, podeDispensar, RegraMapa, sugerirMapa, Transform, validarMapa,
} from "@/lib/sada/depara";
// Só os tipos: o `xlsx` fica no bundle do worker, não no desta tela.
import type { DoPlanilhaWorker, ParaPlanilhaWorker } from "./planilha.worker";

interface Planilha {
  nomesAbas: string[];
  /** aba usada para ler cabeçalho e amostra */
  abaLida: string;
  cabecalho: string[];
  amostra: unknown[][];
  /** O arquivo em si. A aba de Valores relê dele quando precisa — guardar as
   *  linhas todas em estado era o que derrubava a aba com arquivo grande. */
  arquivo: File;
}


interface Par { valor_origem: string; valor_canonico: string }

/** Uma linha da listagem de mapas salvos (GET ?listar=1). */
interface MapaSalvo {
  cnpjOrgao: string;
  ente: string | null;
  tipo: string;
  nome: string;
  abasModo: string;
  abas: { nome: string; ano: number }[] | null;
  camposOpcionais: string[];
  campos: number;
  /** Mapa completo: a listagem mostra campo por campo sem abrir. */
  mapa: Mapa;
  observacao: string | null;
  atualizadoEm: string;
  porQuem: string | null;
}

const ROTULO_MODO: Record<string, string> = {
  ano_no_nome: "Nome da aba é o ano",
  abas_escolhidas: "Abas escolhidas, ano informado",
  ano_na_coluna: "Ano vem de uma coluna",
};

const SEM_ORIGEM = "";
const CONSTANTE = "\u0000constante";
/** Digitar o nome da coluna à mão — é o que permite incluir ou trocar um campo
 *  sem ter a planilha de referência em mãos. */
const DIGITAR = "\u0000digitar";
/** Origem gravada por POSIÇÃO (mapa padrão antigo), quando não há cabeçalho
 *  para mostrar o nome da coluna. O sufixo é o índice. */
const POSICAO = "\u0000pos:";

/** Transforms oferecidos por tipo de campo. Só aparece onde muda algo. */
const TRANSFORMS_INT: { valor: Transform | ""; rotulo: string }[] = [
  { valor: "", rotulo: "número da própria coluna" },
  { valor: "data_mes", rotulo: "mês extraído de uma data" },
  { valor: "data_ano", rotulo: "ano extraído de uma data" },
];

/** Como a origem de um campo aparece na listagem — em texto, sem seletor. */
function descreverRegra(r: RegraMapa | undefined) {
  if (!r) return <span className="detalhe">— não mapeado —</span>;
  if (ehConstante(r)) {
    const v = String(r.constante ?? "");
    return <>valor fixo: <strong>{v === "" ? "(vazio)" : v}</strong></>;
  }
  return typeof r.origem === "number"
    ? <>coluna <strong>{r.origem + 1}</strong> <small>(por posição)</small></>
    : <strong>{r.origem}</strong>;
}

export default function DeParaPage() {
  const [cnpj, setCnpj] = useState("");
  const [tipo, setTipo] = useState<TipoSada>("divida_ativa");
  const [aba, setAba] = useState<"colunas" | "valores" | "salvos">("colunas");

  const [planilha, setPlanilha] = useState<Planilha | null>(null);
  const [mapa, setMapa] = useState<Mapa>({});
  const [abasModo, setAbasModo] = useState<AbasModo>("ano_no_nome");
  const [abasEscolhidas, setAbasEscolhidas] = useState<AbaEscolhida[]>([]);
  const [observacao, setObservacao] = useState("");
  const [ehPadrao, setEhPadrao] = useState(true);
  // Um ente pode ter mais de um mapa por tipo (ex.: trocou de sistema no meio
  // do ano). O nome identifica qual está sendo editado; vazio = o mais recente.
  const [nome, setNome] = useState("");
  /** Nome com que o mapa está gravado. Diferente de `nome` = renomeação, e o
   *  PUT precisa saber qual linha aposentar — senão a edição do nome deixaria
   *  o mapa antigo vivo ao lado do novo. Vazio = mapa ainda não salvo. */
  const [nomeSalvo, setNomeSalvo] = useState("");
  const [nomesDisponiveis, setNomesDisponiveis] = useState<string[]>([]);
  /** Campos obrigatórios dispensados NESTE mapa (sada_depara.campos_opcionais). */
  const [camposOpcionais, setCamposOpcionais] = useState<string[]>([]);
  /** Admin ou superadmin: só eles dispensam obrigatoriedade. */
  const [podeDispensarAqui, setPodeDispensarAqui] = useState(false);
  /** Superadmin: só ele altera o mapa (PUT) e exclui (DELETE). */
  const [ehSuper, setEhSuper] = useState(false);
  /** Campos cuja origem está sendo digitada à mão, em vez de escolhida numa
   *  lista de colunas da planilha. */
  const [origemLivre, setOrigemLivre] = useState<string[]>([]);

  const [salvos, setSalvos] = useState<MapaSalvo[] | null>(null);
  /** Linha da listagem aberta mostrando os campos. */
  const [aberto, setAberto] = useState<string | null>(null);
  /** Mapa que o usuário pediu para excluir, aguardando confirmação. */
  const [excluindo, setExcluindo] = useState<MapaSalvo | null>(null);
  /** Caixa de confirmação depois de salvar — antes a confirmação era uma
   *  linha de texto no meio da tela, e passava despercebida. */
  const [salvoBox, setSalvoBox] = useState<{ titulo: string; linhas: string[] } | null>(null);

  const [campoValor, setCampoValor] = useState<CampoValor>("sigla");
  const [pares, setPares] = useState<Par[]>([]);

  const leitor = useRef<Worker | null>(null);
  /** Resolve ou rejeita a leitura em curso no worker. */
  const emCurso = useRef<{ ok: (m: DoPlanilhaWorker) => void; falha: (e: Error) => void } | null>(null);

  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ok, setOk] = useState("");
  const inputArquivo = useRef<HTMLInputElement>(null);

  // Os campos dependem do modo (o `ano` só existe quando vem de coluna) e das
  // dispensas gravadas no mapa.
  const campos = useMemo(
    () => camposDoTipo(tipo, abasModo, camposOpcionais),
    [tipo, abasModo, camposOpcionais],
  );

  // -------------------------------------------------------------------
  // Worker que lê a planilha de referência
  //
  // Um por tela, encerrado ao sair: um worker vivo depois da navegação
  // continuaria segurando a planilha em memória.
  // -------------------------------------------------------------------
  useEffect(() => {
    const w = new Worker(new URL("./planilha.worker.ts", import.meta.url));
    w.onmessage = (e: MessageEvent<DoPlanilhaWorker>) => {
      const pendente = emCurso.current;
      emCurso.current = null;
      if (!pendente) return;
      if (e.data.tipo === "erro") pendente.falha(new Error(e.data.mensagem));
      else pendente.ok(e.data);
    };
    w.onerror = () => {
      const pendente = emCurso.current;
      emCurso.current = null;
      pendente?.falha(new Error("Falha ao ler a planilha no navegador."));
    };
    leitor.current = w;
    return () => { w.terminate(); leitor.current = null; };
  }, []);

  /** Manda uma mensagem ao leitor e espera a resposta. O ArrayBuffer é
   *  TRANSFERIDO, não copiado: são dezenas de MB. */
  function pedirAoWorker(msg: ParaPlanilhaWorker): Promise<DoPlanilhaWorker> {
    const w = leitor.current;
    if (!w) return Promise.reject(new Error("Leitor de planilha indisponível."));
    return new Promise<DoPlanilhaWorker>((ok, falha) => {
      emCurso.current = { ok, falha };
      w.postMessage(msg, [msg.arquivo]);
    });
  }

  // Perfil do usuário: a dispensa de obrigatoriedade é de admin/superadmin.
  useEffect(() => {
    const sb = getSupabaseBrowserClient();
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await sb
        .from("gp_profiles")
        .select("perfil, is_superadmin")
        .eq("id", data.user.id)
        .single();
      setPodeDispensarAqui(!!p && (p.is_superadmin || p.perfil === "admin"));
      setEhSuper(!!p?.is_superadmin);
    });
  }, []);

  // -------------------------------------------------------------------
  // Carga do mapa salvo
  // -------------------------------------------------------------------
  /**
   * Carrega um mapa salvo.
   *
   * Recebe ente/tipo/nome por PARÂMETRO, e não só do estado: quem vem da
   * listagem ("Abrir") acabou de mandar trocar os três, e `setState` não é
   * imediato — ler do estado aqui buscaria o ente ANTERIOR, ou reclamaria de
   * CNPJ vazio na primeira vez.
   */
  async function carregar(
    cnpjAlvo: string = cnpj,
    tipoAlvo: TipoSada = tipo,
    nomeAlvo: string = nome,
  ) {
    setErro(""); setOk(""); setAviso("");
    const cnpjChave = somenteDigitos(cnpjAlvo);
    if (!cnpjChave) { setErro("Informe o CNPJ do ente."); return; }
    setCarregando(true);
    try {
      const q = nomeAlvo.trim() ? `&nome=${encodeURIComponent(nomeAlvo.trim())}` : "";
      const r = await fetch(`/api/sada/depara?cnpj=${encodeURIComponent(cnpjChave)}&tipo=${tipoAlvo}${q}`);
      const j = await r.json();
      if (r.status === 401) { window.location.href = "/login"; return; }
      if (!r.ok) throw new Error(j.erro || "Falha ao carregar.");

      setMapa(j.depara.mapa ?? {});
      setAbasModo(j.depara.abas_modo ?? "ano_no_nome");
      setAbasEscolhidas(j.depara.abas ?? []);
      setCamposOpcionais(j.depara.campos_opcionais ?? []);
      setObservacao(j.depara.observacao ?? "");
      setEhPadrao(!!j.padrao);
      setNomesDisponiveis(j.nomes ?? []);
      setNome(j.depara.nome ?? "");
      // Sem cadastro não há nome gravado: salvar depois é criação, não
      // renomeação.
      setNomeSalvo(j.padrao ? "" : String(j.depara.nome ?? ""));
      setOrigemLivre([]);

      const rv = await fetch(`/api/sada/depara/valores?cnpj=${encodeURIComponent(cnpjChave)}&campo=${campoValor}`);
      const jv = await rv.json();
      if (rv.ok) setPares(jv.pares ?? []);

      if (j.padrao) {
        setAviso(
          "Este ente ainda não tem DE/PARA cadastrado. O que aparece abaixo é o " +
          "layout posicional padrão — é exatamente o que a importação usa hoje.",
        );
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  // -------------------------------------------------------------------
  // Leitura da planilha de referência
  // -------------------------------------------------------------------
  async function lerArquivo(f: File) {
    setErro(""); setOk("");
    setCarregando(true);
    try {
      // A leitura roda no worker: o .xlsx é descompactado inteiro antes de
      // qualquer linha ser lida (13 s no export de 83 MB), e aqui isso seria
      // a aba congelada, sem nem pintar o "Lendo a planilha…".
      const resp = await pedirAoWorker({ acao: "preview", arquivo: await f.arrayBuffer() });
      if (resp.tipo !== "preview") throw new Error("Resposta inesperada do leitor.");

      const { nomesAbas, abaLida, cabecalho, amostra } = resp;
      setPlanilha({ nomesAbas, abaLida, cabecalho, amostra, arquivo: f });

      // Só sugere quando não há mapa cadastrado — não sobrescreve trabalho salvo.
      if (ehPadrao) {
        const sug = sugerirMapa(tipo, cabecalho, abasModo);
        setMapa(sug);
        const naoCasou = campos.filter((c) => !sug[c.campo]).map((c) => c.rotulo);
        setAviso(
          naoCasou.length === 0
            ? "Todas as colunas foram reconhecidas. Confira antes de salvar."
            : `Não reconheci: ${naoCasou.join(", ")}. Ajuste manualmente abaixo.`,
        );
      }

      // Abas cujo nome não é ano sugerem o modo "abas escolhidas".
      const todosAno = nomesAbas.every((n) => Number.isFinite(parseInt(n, 10)));
      if (!todosAno && abasModo === "ano_no_nome") {
        setAbasModo("abas_escolhidas");
        setAbasEscolhidas(nomesAbas.map((n) => ({
          nome: n,
          ano: Number.isFinite(parseInt(n, 10)) ? parseInt(n, 10) : new Date().getFullYear(),
        })));
      }
    } catch (e) {
      setErro((e as Error).message);
      setPlanilha(null);
    } finally {
      setCarregando(false);
    }
  }

  // -------------------------------------------------------------------
  // Edição do mapa
  // -------------------------------------------------------------------
  function definirOrigem(campo: string, valor: string) {
    setMapa((m) => {
      const novo = { ...m };
      const anterior = novo[campo];
      const transform = anterior && !ehConstante(anterior) ? anterior.transform : undefined;
      const comTransform = (origem: string | number): RegraMapa =>
        transform ? { origem, transform } : { origem };

      if (valor === SEM_ORIGEM) delete novo[campo];
      else if (valor === CONSTANTE) novo[campo] = { constante: "" };
      // Origem por posição continua sendo número: virar a string "3" mudaria o
      // sentido — passaria a procurar uma coluna CHAMADA "3".
      else if (valor.startsWith(POSICAO)) {
        novo[campo] = comTransform(Number(valor.slice(POSICAO.length)));
      } else novo[campo] = comTransform(valor);
      return novo;
    });
    setOk("");
  }

  /** Passa o campo para digitação livre do nome da coluna. É o caminho de quem
   *  edita um mapa salvo sem ter a planilha à mão — a lista de colunas só
   *  existe quando um arquivo de referência foi enviado. */
  function digitarOrigem(campo: string) {
    setOrigemLivre((l) => (l.includes(campo) ? l : [...l, campo]));
    setOk("");
  }

  function escolherDaLista(campo: string) {
    setOrigemLivre((l) => l.filter((c) => c !== campo));
  }

  /** Remove o campo do mapa. Equivale a "— não mapear —", mas explícito:
   *  excluir um campo é uma das coisas que se faz editando um mapa salvo. */
  function excluirCampo(campo: string) {
    setMapa((m) => {
      const novo = { ...m };
      delete novo[campo];
      return novo;
    });
    setOrigemLivre((l) => l.filter((c) => c !== campo));
    setOk("");
  }

  function definirTransform(campo: string, t: string) {
    setMapa((m) => {
      const r = m[campo];
      if (!r || ehConstante(r)) return m;
      const novo = { ...m };
      novo[campo] = t ? { origem: r.origem, transform: t as Transform } : { origem: r.origem };
      return novo;
    });
    setOk("");
  }

  function definirConstante(campo: string, v: string) {
    setMapa((m) => ({ ...m, [campo]: { constante: v } }));
    setOk("");
  }

  function valorSelect(r: RegraMapa | undefined): string {
    if (!r) return SEM_ORIGEM;
    if (ehConstante(r)) return CONSTANTE;
    if (typeof r.origem === "number") {
      return planilha?.cabecalho[r.origem] ?? `${POSICAO}${r.origem}`;
    }
    return r.origem;
  }

  /**
   * Opção extra do seletor quando a origem gravada não está entre as colunas
   * oferecidas — por posição, ou por nome de uma planilha que não foi enviada
   * nesta sessão.
   *
   * Sem ela o `<select>` ficaria com um valor que não existe nas opções: o
   * navegador não mostra nada selecionado e o mapa salvo PARECE vazio, mesmo
   * estando correto.
   */
  function opcaoExtra(valor: string): { valor: string; rotulo: string } | null {
    if (valor === SEM_ORIGEM || valor === CONSTANTE) return null;
    if (valor.startsWith(POSICAO)) {
      const i = Number(valor.slice(POSICAO.length));
      return { valor, rotulo: `coluna ${i + 1} (por posição)` };
    }
    if (planilha?.cabecalho.includes(valor)) return null;
    return {
      valor,
      rotulo: planilha ? `${valor} (salvo — não está nesta planilha)` : valor,
    };
  }

  // -------------------------------------------------------------------
  // Preview + validação
  // -------------------------------------------------------------------
  const compilado = useMemo(() => {
    if (!planilha) return null;
    return compilarMapa(tipo, mapa, planilha.cabecalho);
  }, [planilha, mapa, tipo]);

  const validacao = useMemo(
    () => validarMapa(tipo, mapa, { abasModo, opcionais: camposOpcionais }),
    [tipo, mapa, abasModo, camposOpcionais],
  );

  const preview = useMemo(() => {
    if (!planilha || !compilado) return [];
    return planilha.amostra.map((l) => compilado.aplicar(l));
  }, [planilha, compilado]);

  const camposMapeados = campos.filter((c) => mapa[c.campo]).length;

  // -------------------------------------------------------------------
  // Valores distintos (aba Valores)
  // -------------------------------------------------------------------
  /**
   * Lista os valores que o ente usa, relendo o arquivo — uma amostra dele.
   *
   * Reler custa alguns segundos; guardar as linhas todas em estado custava a
   * aba inteira num arquivo grande. E a amostra basta: siglas e fases são um
   * punhado de valores distintos, que aparecem logo nas primeiras linhas.
   */
  async function carregarValoresDaPlanilha() {
    if (!planilha) { setErro("Envie uma planilha de referência primeiro."); return; }
    setErro(""); setOk("");
    setCarregando(true);
    try {
      const resp = await pedirAoWorker({
        acao: "valores",
        arquivo: await planilha.arquivo.arrayBuffer(),
        tipo,
        mapa,
        cabecalho: planilha.cabecalho,
        campo: campoValor,
      });
      if (resp.tipo !== "valores") throw new Error("Resposta inesperada do leitor.");

      setPares((atuais) => {
        const jaTem = new Set(atuais.map((p) => chaveValor(p.valor_origem)));
        const novos = resp.distintos
          .filter((v) => !jaTem.has(chaveValor(v)))
          .map((v) => ({ valor_origem: v, valor_canonico: "" }));
        return [...atuais, ...novos];
      });
      setOk(
        `${resp.distintos.length} valor(es) distinto(s) em ${resp.lidas.toLocaleString("pt-BR")} linhas lidas — ` +
        `amostra das primeiras ${resp.limitePorAba.toLocaleString("pt-BR")} linhas de cada aba. ` +
        "Se o ente usar uma sigla só lá no fim do arquivo, acrescente a linha à mão.",
      );
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  // -------------------------------------------------------------------
  // Gravação
  // -------------------------------------------------------------------
  async function salvarColunas() {
    setErro(""); setOk("");
    if (!somenteDigitos(cnpj)) { setErro("Informe o CNPJ do ente."); return; }
    if (!validacao.ok) { setErro(validacao.erros.join(" ")); return; }

    setSalvando(true);
    try {
      const r = await fetch("/api/sada/depara", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj: somenteDigitos(cnpj), tipo, nome: nome.trim(), mapa, abasModo,
          // Renomeação: o servidor grava com o nome novo e apaga o antigo.
          nomeAnterior: nomeSalvo || null,
          // No modo de coluna a lista é opcional: vazia = todas as abas.
          abas: abasModo === "ano_no_nome" ? null : abasEscolhidas,
          observacao: observacao.trim() || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Falha ao salvar.");
      setEhPadrao(false);
      setNomeSalvo(nome.trim() || "Padrão");
      setOk("DE/PARA de colunas salvo.");
      if (j.avisos?.length) setAviso(j.avisos.join(" "));
      setSalvos(null);
      setSalvoBox({
        titulo: "DE/PARA de colunas salvo",
        linhas: [
          `Ente ${somenteDigitos(cnpj)} · ${ROTULO_TIPO[tipo]} · mapa "${nome.trim() || "Padrão"}".`,
          ...(j.renomeadoDe ? [`Renomeado de "${j.renomeadoDe}" — o mapa antigo deixou de existir.`] : []),
          `${Object.keys(mapa).length} campo(s) mapeado(s). ${ROTULO_MODO[abasModo]}.`,
          ...(camposOpcionais.length
            ? [`Obrigatoriedade dispensada em: ${camposOpcionais.join(", ")}.`]
            : []),
          ...(j.avisos?.length ? j.avisos : []),
          "A próxima importação deste ente já usa este mapa.",
        ],
      });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function salvarValores() {
    setErro(""); setOk("");
    if (!cnpj.trim()) { setErro("Informe o CNPJ do ente."); return; }
    setSalvando(true);
    try {
      const r = await fetch("/api/sada/depara/valores", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpj: somenteDigitos(cnpj), campo: campoValor, pares }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Falha ao salvar.");
      setOk(`${j.gravados} tradução(ões) de valor gravada(s).`);
      setSalvoBox({
        titulo: "DE/PARA de valores salvo",
        linhas: [
          `${j.gravados} tradução(ões) de "${campoValor}" gravada(s) para o ente ${somenteDigitos(cnpj)}.`,
          "Vale para todas as planilhas deste ente, em qualquer tipo.",
        ],
      });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  /** Lista os mapas cadastrados (todos os entes). */
  async function carregarSalvos() {
    setErro("");
    try {
      const r = await fetch("/api/sada/depara?listar=1");
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Falha ao listar os mapas.");
      setSalvos(j.mapas ?? []);
    } catch (e) {
      setErro((e as Error).message);
      setSalvos([]);
    }
  }

  /** Abre um mapa da listagem na aba de edição. */
  async function editarSalvo(m: MapaSalvo) {
    setCnpj(m.cnpjOrgao);
    setTipo(m.tipo as TipoSada);
    setNome(m.nome);
    setAba("colunas");
    // A planilha de referência anterior é de outro ente: manter confundiria
    // as colunas oferecidas.
    setPlanilha(null);
    await carregar(m.cnpjOrgao, m.tipo as TipoSada, m.nome);
  }

  /**
   * Abre uma CÓPIA do mapa, com outro nome e sem vínculo com o original.
   *
   * É como se atende o caso mais comum: ente novo que usa o mesmo sistema de
   * outro já cadastrado. Basta trocar o CNPJ e salvar — refazer trinta campos
   * à mão era o que sobrava antes.
   */
  async function duplicarSalvo(m: MapaSalvo) {
    await editarSalvo(m);
    setNome(`${m.nome} (cópia)`);
    // Sem nome gravado: salvar cria um registro novo em vez de renomear este.
    setNomeSalvo("");
    setAviso(
      `Cópia de "${m.nome}" do ente ${m.cnpjOrgao}. Ajuste o CNPJ e o nome e ` +
      "clique em Salvar — o original continua como está.",
    );
    setOk("");
  }

  /** Apaga um mapa. Confirmado no modal, porque sem mapa a importação daquele
   *  ente volta ao layout posicional padrão sem avisar ninguém. */
  async function excluirSalvo(m: MapaSalvo) {
    setErro(""); setOk("");
    setSalvando(true);
    try {
      const q = new URLSearchParams({ cnpj: m.cnpjOrgao, tipo: m.tipo, nome: m.nome });
      const r = await fetch(`/api/sada/depara?${q.toString()}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Falha ao excluir.");
      setExcluindo(null);
      setAberto(null);
      await carregarSalvos();
      // Se o mapa aberto na aba de edição era esse, o que está na tela não
      // existe mais no banco — limpar evita salvar de volta sem querer.
      if (somenteDigitos(cnpj) === m.cnpjOrgao && tipo === m.tipo && nomeSalvo === m.nome) {
        setMapa({}); setNomeSalvo(""); setNome(""); setEhPadrao(true); setCamposOpcionais([]);
      }
      setSalvoBox({
        titulo: "Mapa excluído",
        linhas: [
          `"${m.nome}" · ${ROTULO_TIPO[m.tipo as TipoSada] ?? m.tipo} · ente ${m.cnpjOrgao}.`,
          j.restantes === 0
            ? "Era o último mapa deste ente para este tipo: a próxima importação volta a usar o layout posicional padrão."
            : `Restam ${j.restantes} mapa(s) deste ente para este tipo.`,
          "As importações já feitas não mudam — o mapa só é usado ao ler o arquivo.",
        ],
      });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  /**
   * Dispensa (ou volta a exigir) um campo obrigatório neste mapa.
   * Grava na hora, por PATCH: é decisão de admin e não depende de salvar o
   * mapa inteiro — que é operação de superadmin.
   */
  async function alternarDispensa(campo: string, dispensar: boolean) {
    const novos = dispensar
      ? Array.from(new Set([...camposOpcionais, campo]))
      : camposOpcionais.filter((c) => c !== campo);
    setErro("");
    try {
      const r = await fetch("/api/sada/depara", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj: somenteDigitos(cnpj), tipo,
          // O nome GRAVADO: se o campo do nome foi editado e ainda não salvo,
          // a linha a alterar continua sendo a antiga.
          nome: nomeSalvo || nome.trim(),
          camposOpcionais: novos,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Falha ao alterar a obrigatoriedade.");
      setCamposOpcionais(j.camposOpcionais ?? novos);
      setOk(dispensar
        ? `"${campo}" deixou de ser obrigatório neste mapa.`
        : `"${campo}" voltou a ser obrigatório neste mapa.`);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  // -------------------------------------------------------------------
  return (
    <main className="sada-wrap">
      <header className="sada-head">
        <div>
          <h1>DE/PARA</h1>
          <p className="sub">
            Traduz a planilha do ente para as colunas do SADA. Cada cliente manda
            o arquivo no layout do próprio sistema — aqui se declara a equivalência.
          </p>
        </div>
        <Link href="/sada" className="landing-cta secundario">← Dashboard</Link>
      </header>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="depara-filtros">
          <div className="field">
            <label>
              CNPJ do ente
              <Dica
                titulo="É a chave do cadastro"
                texto={
                  <>
                    Só os 14 dígitos contam — a pontuação é descartada, então{" "}
                    <code>12.345.678/0001-90</code> e <code>12345678000190</code> são o
                    mesmo ente. Use exatamente o CNPJ que será informado na importação:
                    é por ele que a Atualização da Dívida encontra este mapa.
                  </>
                }
              />
            </label>
            <input value={cnpj} onChange={(e) => { setCnpj(e.target.value); setOk(""); }}
              placeholder="Somente números" disabled={carregando || salvando} />
          </div>
          <div className="field">
            <label>
              Nome do mapa
              <Dica
                titulo="Para que serve o nome"
                texto={
                  <>
                    Um ente pode ter mais de um mapa para o mesmo tipo — por exemplo,
                    quando trocou de sistema e os arquivos antigos e novos têm
                    cabeçalhos diferentes. O nome é o que distingue os dois na hora de
                    importar. Deixe em branco e ele vira <code>Padrão</code>.
                    <br /><br />
                    Mudar o nome de um mapa já salvo e clicar em Salvar{" "}
                    <strong>renomeia</strong>: o antigo deixa de existir.
                  </>
                }
              />
            </label>
            <input value={nome} list="depara-nomes" disabled={carregando || salvando}
              onChange={(e) => { setNome(e.target.value); setOk(""); }}
              placeholder="Padrão" />
            <datalist id="depara-nomes">
              {nomesDisponiveis.map((n) => <option key={n} value={n} />)}
            </datalist>
          </div>
          <div className="field">
            <label>Tipo de planilha</label>
            <select value={tipo} disabled={carregando || salvando}
              onChange={(e) => { setTipo(e.target.value as TipoSada); setMapa({}); setPlanilha(null); setOk(""); }}>
              {TIPOS_SADA.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
            </select>
          </div>
          {/* Sem a seta o React passaria o evento de clique como primeiro
              argumento, que agora é o CNPJ. */}
          <button className="btn" onClick={() => void carregar()} disabled={carregando || salvando}>
            {carregando ? "Carregando…" : "Carregar"}
          </button>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>
            Planilha de referência (.xlsx)
            <Dica
              titulo="Este arquivo não é importado"
              texto={
                <>
                  Serve só para ler o cabeçalho (a primeira linha de cada aba), sugerir
                  o mapa, listar as abas e mostrar o preview. Nenhuma linha dele entra
                  no banco — a importação é feita em Atualização da Dívida.
                  <br /><br />
                  Por isso pode ser um recorte pequeno do arquivo real, desde que
                  tenha <strong>as mesmas colunas</strong> e os mesmos nomes de aba.
                </>
              }
            />
          </label>
          <input ref={inputArquivo} type="file" accept=".xlsx" disabled={carregando || salvando}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) lerArquivo(f); }} />
          <small>
            Só para ler o cabeçalho e sugerir o mapa — <strong>este arquivo não é importado</strong>.
            A importação continua em <Link href="/sada/atualizacao">Atualização da Dívida</Link>.
          </small>
        </div>

        {ehPadrao && (
          <p className="detalhe" style={{ marginTop: 8 }}>
            Situação: <strong>sem cadastro</strong> — a importação usa o layout posicional padrão.
          </p>
        )}
        {erro && <p className="msg erro">{erro}</p>}
        {aviso && <p className="msg" style={{ opacity: 0.85 }}>{aviso}</p>}
        {ok && <p className="msg ok">✅ {ok}</p>}
      </section>

      <div className="depara-abas">
        <button className={aba === "colunas" ? "ativa" : ""} onClick={() => setAba("colunas")}>
          Colunas ({camposMapeados}/{campos.length})
        </button>
        <button className={aba === "valores" ? "ativa" : ""} onClick={() => setAba("valores")}>
          Valores ({pares.length})
        </button>
        <button
          className={aba === "salvos" ? "ativa" : ""}
          onClick={() => { setAba("salvos"); if (!salvos) void carregarSalvos(); }}
        >
          Mapas salvos{salvos ? ` (${salvos.length})` : ""}
        </button>
      </div>

      {aba === "colunas" && (
        <>
          <ComoUsar chave="depara-colunas" titulo="Como montar o DE/PARA de colunas">
            <p>
              Esta aba responde a uma pergunta por campo do SADA:{" "}
              <em>de qual coluna da planilha deste ente sai este valor?</em> Sem esse
              cadastro a importação lê <strong>por posição</strong> (1ª coluna, 2ª
              coluna…), que só acerta se o arquivo vier no layout histórico.
            </p>
            <ol>
              <li>
                Informe o <strong>CNPJ</strong> e o <strong>tipo</strong> e clique em{" "}
                <strong>Carregar</strong>: traz o que já estiver salvo para este ente.
              </li>
              <li>
                Envie a <strong>planilha de referência</strong>. Ela serve só para ler
                o cabeçalho e mostrar o preview — <strong>não é importada</strong>.
                Pode ser um recorte com poucas linhas.
              </li>
              <li>
                O sistema tenta reconhecer as colunas pelo nome e preenche o que
                conseguir. <strong>Confira campo a campo</strong>: o palpite erra, e um
                mapa errado traduz a planilha inteira sem dar erro nenhum.
              </li>
              <li>
                Diga <strong>de onde vem o ano</strong> de cada linha (quadro abaixo).
              </li>
              <li>
                Olhe o <strong>preview</strong> no fim da página — são as primeiras
                linhas já traduzidas. É aí que o erro aparece.
              </li>
              <li>Clique em <strong>Salvar DE/PARA de colunas</strong>.</li>
            </ol>
            <p>
              <strong>Regras que valem a pena saber:</strong> campo marcado{" "}
              <span className="tag bloqueio">obrigatório</span> impede salvar enquanto
              ficar sem origem (admin pode dispensar em &ldquo;não exigir neste
              ente&rdquo;, quando o sistema do ente realmente não exporta aquela
              coluna). Campo não mapeado entra vazio. <strong>Valor fixo</strong> serve
              para o que não vem na planilha mas é sempre o mesmo. Quando mês e ano
              estão numa <em>única</em> coluna de data, aponte os dois campos para ela
              e escolha a conversão &ldquo;mês extraído de uma data&rdquo; e
              &ldquo;ano extraído de uma data&rdquo;.
            </p>
            <p>
              Sem a planilha em mãos o mapa continua editável: escolha{" "}
              <strong>digitar o nome da coluna…</strong> para incluir ou trocar um
              campo, e <strong>excluir campo</strong> para tirá-lo.
            </p>
          </ComoUsar>

          <section className="card" style={{ marginBottom: 16 }}>
            <h2>
              De onde sai o ano de cada linha
              <Dica
                titulo="Os três modos"
                texto={
                  <>
                    Toda linha do SADA é guardada com um ano. Escolha como ele chega:
                    <br /><br />
                    <strong style={{ display: "block", color: "inherit" }}>
                      Nome da aba é o ano
                    </strong>
                    o arquivo tem abas <code>2023</code>, <code>2024</code>… É o formato
                    histórico.
                    <br /><br />
                    <strong style={{ display: "block", color: "inherit" }}>
                      Abas escolhidas
                    </strong>
                    as abas têm outros nomes e você informa o ano de cada uma.
                    <br /><br />
                    <strong style={{ display: "block", color: "inherit" }}>
                      Ano vem de uma coluna
                    </strong>
                    tudo numa aba só, ou abas que separam outra coisa (mês, tributo,
                    unidade). Aparece o campo &ldquo;Ano / exercício da linha&rdquo; para
                    mapear — e linha sem ano válido impede a importação.
                  </>
                }
              />
            </h2>
            <div className="field">
              <select value={abasModo} disabled={salvando}
                onChange={(e) => setAbasModo(e.target.value as AbasModo)}>
                <option value="ano_no_nome">O nome da aba é o ano (2015, 2016…)</option>
                <option value="abas_escolhidas">Escolher as abas e informar o ano de cada uma</option>
                <option value="ano_na_coluna">Uma coluna da planilha traz o ano de cada linha</option>
              </select>
              <small>
                {abasModo === "ano_na_coluna"
                  ? "Para quem manda tudo numa aba só, ou cujas abas separam outra coisa (mês, tributo, unidade). Mapeie a coluna no campo “Ano / exercício da linha”, abaixo."
                  : "O SADA guarda cada linha com um ano. Se o arquivo não for organizado por ano, use a última opção."}
              </small>
            </div>

            {abasModo === "ano_na_coluna" && (
              <>
                {!planilha && (
                  <p className="detalhe">
                    Todas as abas do arquivo entram. Envie a planilha de referência
                    se quiser escolher apenas algumas.
                  </p>
                )}
                {planilha && (
                  <>
                    <p className="detalhe">
                      Marque as abas que entram. Sem nenhuma marcada, entram todas —
                      o ano não depende da aba neste modo.
                    </p>
                    <table className="sada-tabela">
                      <thead><tr><th>Aba do arquivo</th><th>Entra?</th></tr></thead>
                      <tbody>
                        {planilha.nomesAbas.map((nomeAba) => (
                          <tr key={nomeAba}>
                            <td>{nomeAba}</td>
                            <td>
                              <input
                                type="checkbox"
                                disabled={salvando}
                                checked={abasEscolhidas.some((a) => a.nome === nomeAba)}
                                onChange={(e) => setAbasEscolhidas((lista) => e.target.checked
                                  ? [...lista, { nome: nomeAba, ano: 0 }]
                                  : lista.filter((a) => a.nome !== nomeAba))}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </>
            )}

            {abasModo === "abas_escolhidas" && (
              <>
                {!planilha && <p className="vazio">Envie uma planilha para listar as abas.</p>}
                {planilha && (
                  <table className="sada-tabela">
                    <thead><tr><th>Aba do arquivo</th><th>Entra?</th><th>Ano</th></tr></thead>
                    <tbody>
                      {planilha.nomesAbas.map((nome) => {
                        const sel = abasEscolhidas.find((a) => a.nome === nome);
                        return (
                          <tr key={nome}>
                            <td>{nome}</td>
                            <td>
                              <input type="checkbox" checked={!!sel} disabled={salvando}
                                onChange={(e) => setAbasEscolhidas((lista) => e.target.checked
                                  ? [...lista, { nome, ano: new Date().getFullYear() }]
                                  : lista.filter((a) => a.nome !== nome))} />
                            </td>
                            <td>
                              <input type="number" value={sel?.ano ?? ""} disabled={!sel || salvando}
                                style={{ width: 90 }}
                                onChange={(e) => setAbasEscolhidas((lista) => lista.map((a) =>
                                  a.nome === nome ? { ...a, ano: parseInt(e.target.value, 10) } : a))} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </section>

          <section className="card" style={{ marginBottom: 16 }}>
            <h2>Colunas</h2>
            {!planilha && (
              <p className="detalhe">
                Sem planilha de referência a lista de colunas fica vazia, mas o mapa
                continua editável: use <strong>digitar o nome da coluna…</strong> para
                incluir ou trocar um campo e <strong>excluir campo</strong> para tirá-lo
                do mapa. Envie o arquivo acima quando quiser escolher pela lista e ver
                o preview.
              </p>
            )}

            <table className="sada-tabela">
              <thead>
                <tr>
                  <th>Campo do SADA</th>
                  <th>Coluna da planilha</th>
                  <th>Conversão</th>
                </tr>
              </thead>
              <tbody>
                {campos.map((def) => {
                  const regra = mapa[def.campo];
                  const dispensados = new Set(camposOpcionais);
                  const constante = regra && ehConstante(regra);
                  const atual = valorSelect(regra);
                  const extra = opcaoExtra(atual);
                  const livre = origemLivre.includes(def.campo);
                  return (
                    <tr key={def.campo}>
                      <td>
                        {def.rotulo}
                        {def.obrigatorio && <span className="tag bloqueio" style={{ marginLeft: 6 }}>obrigatório</span>}
                        {dispensados.has(def.campo) && (
                          <span className="tag aviso" style={{ marginLeft: 6 }}>obrigatoriedade dispensada</span>
                        )}
                        {def.recomendado && !regra && !dispensados.has(def.campo) && (
                          <span className="tag aviso" style={{ marginLeft: 6 }}>recomendado</span>
                        )}
                        <br /><small>{def.campo}</small>
                        {/* Só admin/superadmin, só em mapa já salvo e só em
                            campo que admite dispensa (o ano nunca admite). */}
                        {podeDispensarAqui && podeDispensar(def.campo)
                          && (def.obrigatorio || dispensados.has(def.campo)) && !ehPadrao && (
                          <label className="detalhe" style={{ display: "block", marginTop: 4 }}>
                            <input
                              type="checkbox"
                              checked={dispensados.has(def.campo)}
                              disabled={salvando}
                              onChange={(e) => void alternarDispensa(def.campo, e.target.checked)}
                            />{" "}
                            não exigir neste ente
                          </label>
                        )}
                      </td>
                      <td>
                        {livre ? (
                          <>
                            <input
                              autoFocus
                              placeholder="nome da coluna na planilha"
                              disabled={salvando}
                              value={regra && !ehConstante(regra) && typeof regra.origem === "string"
                                ? regra.origem
                                : ""}
                              onChange={(e) => definirOrigem(def.campo, e.target.value)}
                            />
                            <button className="btn secondary mini" style={{ marginTop: 4 }}
                              disabled={salvando} onClick={() => escolherDaLista(def.campo)}>
                              escolher da lista
                            </button>
                          </>
                        ) : (
                          <select value={atual} disabled={salvando}
                            onChange={(e) => e.target.value === DIGITAR
                              ? digitarOrigem(def.campo)
                              : definirOrigem(def.campo, e.target.value)}>
                            <option value={SEM_ORIGEM}>— não mapear —</option>
                            {extra && <option value={extra.valor}>{extra.rotulo}</option>}
                            {planilha?.cabecalho.map((c, i) => (
                              <option key={`${c}-${i}`} value={c}>{c || `(coluna ${i + 1})`}</option>
                            ))}
                            <option value={CONSTANTE}>valor fixo…</option>
                            <option value={DIGITAR}>digitar o nome da coluna…</option>
                          </select>
                        )}
                        {constante && (
                          <input style={{ marginTop: 4 }} placeholder="valor fixo" disabled={salvando}
                            value={String((regra as { constante: string | number | null }).constante ?? "")}
                            onChange={(e) => definirConstante(def.campo, e.target.value)} />
                        )}
                        {regra && !livre && (
                          <button className="btn secondary mini" style={{ marginTop: 4 }}
                            disabled={salvando} title="Tira este campo do mapa"
                            onClick={() => excluirCampo(def.campo)}>
                            excluir campo
                          </button>
                        )}
                      </td>
                      <td>
                        {def.tipo === "int" && regra && !constante ? (
                          <select value={(regra as { transform?: Transform }).transform ?? ""}
                            disabled={salvando}
                            onChange={(e) => definirTransform(def.campo, e.target.value)}>
                            {TRANSFORMS_INT.map((t) => (
                              <option key={t.valor} value={t.valor}>{t.rotulo}</option>
                            ))}
                          </select>
                        ) : <span className="detalhe">{def.tipo}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {compilado && compilado.origensAusentes.length > 0 && (
              <p className="msg erro" style={{ marginTop: 8 }}>
                Não encontrei na planilha: {compilado.origensAusentes.join(", ")}
              </p>
            )}
            {validacao.erros.map((e) => <p key={e} className="msg erro">{e}</p>)}
            {validacao.avisos.map((a) => <p key={a} className="detalhe">⚠ {a}</p>)}

            <div className="actions">
              <button className="btn" onClick={salvarColunas} disabled={salvando || !validacao.ok}>
                {salvando ? "Salvando…" : "Salvar DE/PARA de colunas"}
              </button>
              {planilha && (
                <button className="btn secondary" disabled={salvando}
                  onClick={() => { setMapa(sugerirMapa(tipo, planilha.cabecalho, abasModo)); setOk(""); }}>
                  Detectar novamente
                </button>
              )}
            </div>
          </section>

          {preview.length > 0 && (
            <section className="card">
              <h2>Preview — {preview.length} primeiras linhas traduzidas</h2>
              <p className="detalhe">
                Aba <strong>{planilha?.abaLida}</strong>. Confira se os valores caíram
                nas colunas certas antes de salvar.
              </p>
              <div style={{ overflowX: "auto" }}>
                <table className="sada-tabela">
                  <thead>
                    <tr>{campos.filter((c) => mapa[c.campo]).map((c) => <th key={c.campo}>{c.campo}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.map((linha, i) => (
                      <tr key={i}>
                        {campos.filter((c) => mapa[c.campo]).map((c) => (
                          <td key={c.campo}>
                            {linha[c.campo] === null || linha[c.campo] === undefined
                              ? <span className="detalhe">null</span>
                              : String(linha[c.campo])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {aba === "valores" && (
        <>
        <ComoUsar chave="depara-valores" titulo="Como usar o DE/PARA de valores">
          <p>
            Aqui não se traduz coluna, e sim <strong>o conteúdo</strong> de duas delas:
            a sigla do tributo e a fase. É o que resolve o mesmo tributo aparecer como{" "}
            <code>IPTU</code>, <code>I.P.T.U.</code> e <code>01</code> em arquivos
            diferentes do mesmo ente.
          </p>
          <ol>
            <li>Carregue o ente na aba Colunas e envie a planilha de referência.</li>
            <li>
              Volte aqui, escolha o campo (sigla ou fase) e clique em{" "}
              <strong>Buscar valores na planilha</strong>: lista o que o ente realmente
              usa, sem você adivinhar.
            </li>
            <li>
              Preencha o <strong>valor canônico</strong> — o nome que o SADA deve usar.
              Deixe vazio o que já estiver certo: valor sem tradução passa direto.
            </li>
            <li>Salve.</li>
          </ol>
          <p>
            <strong>Vale para o ente inteiro</strong>, não por tipo de planilha: a sigla
            precisa casar entre dívida ativa, lançamentos e recebimentos, senão o mesmo
            tributo é contado duas vezes nos rankings. Maiúsculas, acentos e espaços
            extras são ignorados na comparação.
          </p>
        </ComoUsar>
        <section className="card">
          <h2>DE/PARA de valores</h2>
          <p className="detalhe">
            Normaliza o vocabulário do ente. Vale para o ente inteiro, não por tipo
            de planilha: a sigla precisa casar entre dívida ativa, lançamentos e
            recebimentos, senão o ranking conta o mesmo tributo duas vezes.
            Valor sem tradução passa direto.
          </p>

          <div className="depara-filtros" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Campo</label>
              <select value={campoValor} disabled={salvando}
                onChange={(e) => { setCampoValor(e.target.value as CampoValor); setPares([]); }}>
                <option value="sigla">Sigla do tributo</option>
                <option value="fase">Fase / situação</option>
              </select>
            </div>
            <button className="btn secondary" disabled={salvando || carregando || !planilha}
              onClick={() => void carregarValoresDaPlanilha()}>
              {carregando ? "Lendo a planilha…" : "Buscar valores na planilha"}
            </button>
            <button className="btn secondary" disabled={salvando}
              onClick={() => setPares((p) => [...p, { valor_origem: "", valor_canonico: "" }])}>
              + Linha
            </button>
          </div>

          {pares.length === 0 && (
            <p className="vazio">
              Nenhuma tradução. Envie a planilha e clique em “Buscar valores” para
              listar o que o ente realmente usa.
            </p>
          )}

          {pares.length > 0 && (
            <table className="sada-tabela">
              <thead><tr><th>Valor na planilha (DE)</th><th>Valor canônico (PARA)</th><th /></tr></thead>
              <tbody>
                {pares.map((p, i) => (
                  <tr key={i}>
                    <td>
                      <input value={p.valor_origem} disabled={salvando}
                        onChange={(e) => setPares((l) => l.map((x, j) =>
                          j === i ? { ...x, valor_origem: e.target.value } : x))} />
                    </td>
                    <td>
                      <input value={p.valor_canonico} disabled={salvando} placeholder="deixe vazio para não traduzir"
                        onChange={(e) => setPares((l) => l.map((x, j) =>
                          j === i ? { ...x, valor_canonico: e.target.value } : x))} />
                    </td>
                    <td>
                      <button className="btn secondary" disabled={salvando}
                        onClick={() => setPares((l) => l.filter((_, j) => j !== i))}>remover</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="actions">
            <button className="btn" onClick={salvarValores} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar traduções de valor"}
            </button>
          </div>
        </section>
        </>
      )}

      {aba === "salvos" && (
        <>
        <ComoUsar chave="depara-salvos" titulo="Como usar os mapas salvos">
          <p>
            É a lista de todos os DE/PARA de colunas já cadastrados, de todos os entes.
            Serve para conferir o que está valendo antes de uma importação e para
            manter o cadastro.
          </p>
          <ul>
            <li>
              <strong>Ver campos</strong> — abre o mapa inteiro na própria linha, campo
              por campo, sem trocar o que você está editando.
            </li>
            <li>
              <strong>Abrir para editar</strong> — carrega nas abas acima. Lá dá para
              incluir, trocar ou excluir campo.
            </li>
            <li>
              <strong>Renomear</strong> — abra, mude o &ldquo;Nome do mapa&rdquo; e
              salve: o mapa antigo deixa de existir, não fica um duplicado.
            </li>
            <li>
              <strong>Duplicar</strong> — cria outro mapa a partir deste. É o caminho
              para um ente novo que usa o mesmo sistema de um já cadastrado: duplique,
              troque o CNPJ e salve.
            </li>
            <li>
              <strong>Excluir</strong> — apaga o cadastro. Os dados já importados não
              mudam, mas se for o último mapa daquele ente para aquele tipo, a próxima
              importação volta a ler a planilha por posição.
            </li>
          </ul>
          <p>
            Alterar e excluir são de superadmin; a dispensa de obrigatoriedade de um
            campo é de admin ou superadmin. Conferir é de quem usa o SADA.
          </p>
        </ComoUsar>
        <section className="card">
          <h2>Mapas cadastrados</h2>
          <p className="detalhe">
            Todos os DE/PARA de colunas já salvos, de todos os entes.
            <strong> Ver campos</strong> mostra o mapa inteiro aqui mesmo;
            <strong> Abrir para editar</strong> carrega nas abas acima, onde se
            inclui, troca ou exclui campo — e, salvando com outro nome, renomeia.
            {ehSuper
              ? " Duplicar cria um mapa novo a partir deste (ente novo com o mesmo sistema) e Excluir apaga o cadastro."
              : " Alterar e excluir mapa é de superadmin; aqui você consegue conferir."}
          </p>

          <div className="actions" style={{ marginBottom: 8 }}>
            <button className="btn secondary" onClick={() => void carregarSalvos()}>
              Atualizar lista
            </button>
          </div>

          {!salvos && <p className="vazio">Carregando…</p>}
          {salvos && salvos.length === 0 && (
            <p className="vazio">Nenhum mapa cadastrado ainda.</p>
          )}
          {salvos && salvos.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table className="sada-tabela">
                <thead>
                  <tr>
                    <th>Ente</th><th>Tipo</th><th>Mapa</th><th>Ano</th>
                    <th>Campos</th><th>Atualizado</th><th>Por</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {salvos.map((m) => {
                  const chave = `${m.cnpjOrgao}-${m.tipo}-${m.nome}`;
                  const expandido = aberto === chave;
                  return (
                  <Fragment key={chave}>
                    <tr>
                      <td>
                        {m.ente ?? "—"}
                        <br /><small>{m.cnpjOrgao}</small>
                      </td>
                      <td>{ROTULO_TIPO[m.tipo as TipoSada] ?? m.tipo}</td>
                      <td>
                        {m.nome}
                        {m.observacao && <><br /><small>{m.observacao}</small></>}
                      </td>
                      <td>
                        {ROTULO_MODO[m.abasModo] ?? m.abasModo}
                        {m.abas && m.abas.length > 0 && (
                          <><br /><small>{m.abas.length} aba(s)</small></>
                        )}
                      </td>
                      <td>
                        {m.campos}
                        {m.camposOpcionais.length > 0 && (
                          <>
                            <br />
                            <small>dispensados: {m.camposOpcionais.join(", ")}</small>
                          </>
                        )}
                      </td>
                      <td>{new Date(m.atualizadoEm).toLocaleString("pt-BR")}</td>
                      <td>{m.porQuem ?? "—"}</td>
                      <td>
                        <div className="depara-acoes">
                          <button className="btn secondary mini"
                            onClick={() => setAberto(expandido ? null : chave)}>
                            {expandido ? "ocultar campos" : "ver campos"}
                          </button>
                          <button className="btn secondary mini" onClick={() => void editarSalvo(m)}>
                            Abrir para editar
                          </button>
                          {ehSuper && (
                            <button className="btn secondary mini" disabled={salvando}
                              title="Cria outro mapa a partir deste, sem alterar o original"
                              onClick={() => void duplicarSalvo(m)}>
                              Duplicar
                            </button>
                          )}
                          {ehSuper && (
                            <button className="btn perigo mini" disabled={salvando}
                              onClick={() => setExcluindo(m)}>
                              Excluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandido && (
                      <tr>
                        {/* Campo por campo, só leitura: dá para conferir o mapa
                            inteiro sem trocar o ente que está aberto na edição. */}
                        <td colSpan={8} style={{ background: "var(--bg-suave)" }}>
                          <table className="sada-tabela">
                            <thead>
                              <tr><th>Campo do SADA</th><th>Vem de</th><th>Conversão</th></tr>
                            </thead>
                            <tbody>
                              {camposDoTipo(
                                m.tipo as TipoSada,
                                m.abasModo as AbasModo,
                                m.camposOpcionais,
                              ).map((def) => {
                                const r = m.mapa?.[def.campo];
                                return (
                                  <tr key={def.campo}>
                                    <td>
                                      {def.rotulo}
                                      {def.obrigatorio && (
                                        <span className="tag bloqueio" style={{ marginLeft: 6 }}>obrigatório</span>
                                      )}
                                      {m.camposOpcionais.includes(def.campo) && (
                                        <span className="tag aviso" style={{ marginLeft: 6 }}>dispensado</span>
                                      )}
                                      <br /><small>{def.campo}</small>
                                    </td>
                                    <td>{descreverRegra(r)}</td>
                                    <td>
                                      {r && !ehConstante(r) && r.transform
                                        ? r.transform
                                        : <span className="detalhe">{def.tipo}</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <div className="actions">
                            <button className="btn secondary mini" onClick={() => void editarSalvo(m)}>
                              Abrir para editar estes campos
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                  );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </>
      )}

      {aba !== "salvos" && (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="field">
            <label>Observação (opcional)</label>
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)}
              placeholder="ex.: layout do sistema X, exportação de janeiro/2026" disabled={salvando} />
          </div>
        </section>
      )}

      {excluindo && (
        <Modal titulo="Excluir este DE/PARA?" onFechar={() => setExcluindo(null)}>
          <p>
            Mapa <strong>{excluindo.nome}</strong> ·{" "}
            {ROTULO_TIPO[excluindo.tipo as TipoSada] ?? excluindo.tipo} ·{" "}
            {excluindo.ente ?? excluindo.cnpjOrgao}
            {excluindo.ente && <> <small>({excluindo.cnpjOrgao})</small></>}
          </p>
          <ul style={{ margin: "0 0 12px 18px" }}>
            <li>{excluindo.campos} campo(s) mapeado(s) — a configuração é perdida.</li>
            <li>
              Os dados já importados <strong>não</strong> mudam: o mapa só é usado ao
              ler o arquivo.
            </li>
            <li>
              Se este for o último mapa do ente para este tipo, a próxima importação
              volta a ler a planilha <strong>por posição</strong> (layout padrão) — o
              que pode traduzir tudo errado sem dar erro.
            </li>
          </ul>
          <div className="actions">
            <button className="btn perigo" disabled={salvando}
              onClick={() => void excluirSalvo(excluindo)}>
              {salvando ? "Excluindo…" : "Excluir mapa"}
            </button>
            <button className="btn secondary" disabled={salvando} onClick={() => setExcluindo(null)}>
              Cancelar
            </button>
          </div>
        </Modal>
      )}

      {salvoBox && (
        <Modal titulo={`✅ ${salvoBox.titulo}`} onFechar={() => setSalvoBox(null)}>
          <ul style={{ margin: "0 0 12px 18px" }}>
            {salvoBox.linhas.map((l) => <li key={l}>{l}</li>)}
          </ul>
          <div className="actions">
            <button className="btn" onClick={() => setSalvoBox(null)}>Entendi</button>
          </div>
        </Modal>
      )}
    </main>
  );
}

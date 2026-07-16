import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { RelatorioAnaliseTR } from "@/lib/tr/relatorioPdf";
import { Achado, AchadoEstado, EnteInfo, ResultadoAnaliseTR } from "@/lib/tr/types";
import { NovoContatoInput, contatoValido } from "@/lib/orgaos/types";
import { getProfileAtual, getSupabaseRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ReportRequestBody {
  orgaoId: string;
  /** Um contato já cadastrado no órgão (caso exista ao menos um). */
  contatoId?: string;
  /** Preenchido quando o órgão ainda não tem nenhum contato — cria um novo
   * contato no próprio órgão antes de salvar o cadastro. */
  novoContato?: NovoContatoInput;
  nomeArquivoTr: string;
  resultado: ResultadoAnaliseTR;
  achados: (Achado & { estado: AchadoEstado })[];
  mensagensOk: string[];
}

export async function POST(req: NextRequest) {
  try {
    const profile = await getProfileAtual();
    if (!profile) {
      return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
    }
    const nomeUsuario = profile.nome_completo || profile.email;

    const body = (await req.json()) as ReportRequestBody;

    if (!body.orgaoId) {
      return NextResponse.json({ erro: "Órgão não informado." }, { status: 400 });
    }
    if (!body.contatoId && !body.novoContato) {
      return NextResponse.json(
        { erro: "É necessário um contato do órgão (existente ou recém-cadastrado) para gerar o relatório." },
        { status: 400 }
      );
    }

    // Revalida no servidor as mesmas regras de bloqueio da tela: toda ciência
    // deve estar confirmada, e todo comentário obrigatório deve estar preenchido.
    const pendencias = body.achados.filter(
      (a) => !a.estado?.ciente || (a.comentarioObrigatorio && !a.estado?.comentario?.trim())
    );
    if (pendencias.length > 0) {
      return NextResponse.json(
        {
          erro:
            "Existem ciências ou comentários obrigatórios pendentes. Não é possível gerar o relatório.",
        },
        { status: 422 }
      );
    }

    const supabase = getSupabaseRouteClient();

    const { data: orgao, error: erroOrgao } = await supabase
      .from("gp_orgaos")
      .select("*")
      .eq("id", body.orgaoId)
      .single();
    if (erroOrgao || !orgao) {
      return NextResponse.json({ erro: "Órgão não encontrado." }, { status: 404 });
    }

    // Resolve o contato: usa um já existente, ou cria um novo no próprio órgão.
    let contato: { nome_completo: string; cargo: string; telefone: string | null; email: string };
    if (body.contatoId) {
      const { data: contatoExistente, error: erroContato } = await supabase
        .from("gp_orgaos_contatos")
        .select("nome_completo, cargo, telefone, email")
        .eq("id", body.contatoId)
        .eq("orgao_id", body.orgaoId)
        .single();
      if (erroContato || !contatoExistente) {
        return NextResponse.json({ erro: "Contato não encontrado neste órgão." }, { status: 404 });
      }
      contato = contatoExistente;
    } else {
      const faltando = contatoValido(body.novoContato!);
      if (faltando.length > 0) {
        return NextResponse.json(
          { erro: "Campos obrigatórios do contato não preenchidos: " + faltando.join(", ") },
          { status: 400 }
        );
      }
      const { data: novoContato, error: erroNovoContato } = await supabase
        .from("gp_orgaos_contatos")
        .insert({
          orgao_id: body.orgaoId,
          nome_completo: body.novoContato!.nomeCompleto.trim(),
          cargo: body.novoContato!.cargo.trim(),
          telefone: body.novoContato!.telefone?.trim() || null,
          email: body.novoContato!.email.trim(),
        })
        .select("nome_completo, cargo, telefone, email")
        .single();
      if (erroNovoContato || !novoContato) {
        return NextResponse.json(
          { erro: "Falha ao salvar o contato: " + (erroNovoContato?.message || "erro desconhecido") },
          { status: 500 }
        );
      }
      contato = novoContato;
    }

    const ente: EnteInfo = {
      classificacao: orgao.tipo_ente,
      nomeEnte: orgao.razao_social,
      uf: orgao.uf,
      nomeResponsavel: contato.nome_completo,
      cargo: contato.cargo,
      telefone: contato.telefone || "",
      email: contato.email,
      objetoTR: "Securitizacao",
    };

    // Salva o cadastro e os achados no histórico antes de gerar o PDF — a
    // mesma validação de pendências acima também condiciona o salvamento.
    const { data: cadastro, error: erroCadastro } = await supabase
      .from("gp_cadastros_tr")
      .insert({
        criado_por: profile.id,
        orgao_id: orgao.id,
        classificacao: ente.classificacao,
        nome_ente: ente.nomeEnte,
        uf: ente.uf,
        nome_responsavel: ente.nomeResponsavel,
        cargo: ente.cargo,
        telefone: ente.telefone || null,
        email: ente.email,
        objeto_tr: ente.objetoTR,
        nome_arquivo_tr: body.nomeArquivoTr,
        resultado_bruto_ia: body.resultado,
        status: "concluida",
        relatorio_gerado_em: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (erroCadastro || !cadastro) {
      throw new Error("Falha ao salvar o cadastro no histórico: " + (erroCadastro?.message || "erro desconhecido"));
    }

    if (body.achados.length > 0) {
      const { error: erroAchados } = await supabase.from("gp_achados_tr").insert(
        body.achados.map((a) => ({
          cadastro_id: cadastro.id,
          achado_id: a.id,
          item_numero: a.itemNumero,
          titulo: a.titulo,
          texto: a.texto,
          comentario_obrigatorio: a.comentarioObrigatorio,
          ciente: a.estado.ciente,
          comentario: a.estado.comentario || null,
          ciente_em: a.estado.ciente ? new Date().toISOString() : null,
        }))
      );
      if (erroAchados) {
        throw new Error("Falha ao salvar os achados no histórico: " + erroAchados.message);
      }
    }

    const buffer = await renderToBuffer(
      RelatorioAnaliseTR({
        ente,
        nomeArquivoTr: body.nomeArquivoTr,
        achados: body.achados,
        mensagensOk: body.mensagensOk || [],
        geradoEm: new Date(),
        nomeUsuario,
      })
    );

    const nomeArquivo = `Analise TR - ${ente.classificacao} de ${ente.nomeEnte}.pdf`.replace(
      /[\\/:*?"<>|]/g,
      ""
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(nomeArquivo)}"`,
      },
    });
  } catch (erro) {
    console.error("Erro ao gerar relatório de análise de TR:", erro);
    const mensagem = erro instanceof Error ? erro.message : "Erro desconhecido.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}

import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { Achado, AchadoEstado, EnteInfo } from "./types";

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 60, paddingHorizontal: 44, fontSize: 10, fontFamily: "Helvetica" },
  titulo: { fontSize: 16, fontWeight: "bold", marginBottom: 4, color: "#1F4E3D" },
  subtitulo: { fontSize: 10, color: "#555555", marginBottom: 16 },
  h2: { fontSize: 12, fontWeight: "bold", marginTop: 16, marginBottom: 8, color: "#1F4E3D" },
  linhaEnte: { flexDirection: "row", marginBottom: 3 },
  labelEnte: { width: 140, fontWeight: "bold" },
  valorEnte: { flex: 1 },
  achadoBox: { marginBottom: 12, padding: 8, borderWidth: 1, borderColor: "#D8DEE3", borderRadius: 3 },
  achadoTitulo: { fontWeight: "bold", marginBottom: 4, color: "#1F4E3D" },
  achadoTexto: { marginBottom: 6, lineHeight: 1.4 },
  achadoCiencia: { fontSize: 9, color: "#1f7a3d", marginBottom: 4 },
  achadoComentarioLabel: { fontSize: 9, fontWeight: "bold", marginTop: 4 },
  achadoComentarioTexto: { fontSize: 9, fontStyle: "italic", color: "#33383D" },
  itemOk: { marginBottom: 4, fontSize: 10 },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 44,
    right: 44,
    fontSize: 8,
    color: "#888888",
    borderTopWidth: 1,
    borderTopColor: "#D8DEE3",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export interface RelatorioProps {
  ente: EnteInfo;
  nomeArquivoTr: string;
  achados: (Achado & { estado: AchadoEstado })[];
  mensagensOk: string[];
  geradoEm: Date;
  nomeUsuario: string;
}

function formatarDataHora(d: Date): string {
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();
  const hora = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${ano} ${hora}:${min}`;
}

export function RelatorioAnaliseTR({
  ente,
  nomeArquivoTr,
  achados,
  mensagensOk,
  geradoEm,
  nomeUsuario,
}: RelatorioProps) {
  const dataHora = formatarDataHora(geradoEm);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.titulo}>Relatório de Análise de Termo de Referência</Text>
        <Text style={styles.subtitulo}>Objeto: Securitização de Dívida Ativa</Text>

        <Text style={styles.h2}>Dados do ente</Text>
        <View style={styles.linhaEnte}>
          <Text style={styles.labelEnte}>Classificação:</Text>
          <Text style={styles.valorEnte}>{ente.classificacao}</Text>
        </View>
        <View style={styles.linhaEnte}>
          <Text style={styles.labelEnte}>Nome do ente:</Text>
          <Text style={styles.valorEnte}>{ente.nomeEnte} — {ente.uf}</Text>
        </View>
        <View style={styles.linhaEnte}>
          <Text style={styles.labelEnte}>Responsável:</Text>
          <Text style={styles.valorEnte}>{ente.nomeResponsavel} ({ente.cargo})</Text>
        </View>
        <View style={styles.linhaEnte}>
          <Text style={styles.labelEnte}>Contato:</Text>
          <Text style={styles.valorEnte}>{ente.email}{ente.telefone ? ` · ${ente.telefone}` : ""}</Text>
        </View>
        <View style={styles.linhaEnte}>
          <Text style={styles.labelEnte}>Arquivo do TR:</Text>
          <Text style={styles.valorEnte}>{nomeArquivoTr}</Text>
        </View>
        <View style={styles.linhaEnte}>
          <Text style={styles.labelEnte}>Data da análise:</Text>
          <Text style={styles.valorEnte}>{dataHora}</Text>
        </View>

        <Text style={styles.h2}>Achados que exigiram atenção ({achados.length})</Text>
        {achados.length === 0 && <Text>Nenhum ponto de atenção identificado neste TR.</Text>}
        {achados.map((a) => (
          <View style={styles.achadoBox} key={a.id} wrap={false}>
            <Text style={styles.achadoTitulo}>Item {a.itemNumero} — {a.titulo}</Text>
            <Text style={styles.achadoTexto}>{a.texto}</Text>
            <Text style={styles.achadoCiencia}>
              {a.estado.ciente ? "✓ Ciência confirmada pelo usuário." : "Ciência NÃO confirmada."}
            </Text>
            {a.estado.comentario ? (
              <>
                <Text style={styles.achadoComentarioLabel}>Comentário do usuário:</Text>
                <Text style={styles.achadoComentarioTexto}>{a.estado.comentario}</Text>
              </>
            ) : null}
          </View>
        ))}

        {mensagensOk.length > 0 && (
          <>
            <Text style={styles.h2}>Itens sem pontos de atenção</Text>
            {mensagensOk.map((msg, idx) => (
              <Text style={styles.itemOk} key={idx}>
                • {msg}
              </Text>
            ))}
          </>
        )}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Usuário: ${nomeUsuario}  —  ${dataHora}  —  página ${pageNumber} de ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}

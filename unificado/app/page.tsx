import { redirect } from "next/navigation";

/** A partir da introdução do cadastro central de órgãos, o acesso à análise
 * de TR e à geração de propostas passa a ser feito sempre a partir da
 * seleção de um órgão em /orgaos. */
export default function Home() {
  redirect("/orgaos");
}

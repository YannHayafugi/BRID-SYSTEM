import { redirect } from "next/navigation";

/** Aba inicial após o login: Dashboard (decisão D11). */
export default function Home() {
  redirect("/dashboard");
}

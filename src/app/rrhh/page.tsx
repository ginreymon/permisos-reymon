import { redirect } from "next/navigation";
import { estadoRRHH } from "@/app/actions/rrhh";
import Rrhh from "@/components/rrhh/Rrhh";

// Vista de Talento Humano (escritorio). Supabase Auth, rol `rrhh` (ve todo vía RLS).
// Clasifica para nómina, grafica por área y exporta a Excel.
export default async function Page() {
  const estado = await estadoRRHH();
  if (!estado) redirect("/"); // sin sesión de RRHH -> login principal
  return <Rrhh estado={estado} />;
}

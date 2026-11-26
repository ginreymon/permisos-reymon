import { redirect } from "next/navigation";
import { estadoCoordinador } from "@/app/actions/coordinador";
import { tiposCatalogo } from "@/app/actions/colaborador";
import Coordinador from "@/components/coordinador/Coordinador";

// Vista del Coordinador de área (celular). Supabase Auth + RLS por centro de costo.
export default async function Page() {
  const [estado, tipos] = await Promise.all([estadoCoordinador(), tiposCatalogo()]);
  if (!estado) redirect("/"); // sin sesión de coordinador -> login principal
  return <Coordinador estado={estado} tipos={tipos} />;
}

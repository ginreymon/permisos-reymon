import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import Ingreso from "@/components/auth/Ingreso";

// Entrada única. Si ya hay sesión de staff, va directo a su bandeja.
// Si no, muestra el login staff + el acceso al flujo de colaborador (/solicitar).
export default async function Page() {
  const supa = await crearClienteServidor();
  const { data: { user } } = await supa.auth.getUser();
  if (user) {
    const { data: rol } = await supa.rpc("mi_rol");
    if (rol === "coordinador") redirect("/coordinador");
    if (rol === "porteria") redirect("/porteria");
    if (rol === "rrhh") redirect("/rrhh");
  }
  return <Ingreso />;
}

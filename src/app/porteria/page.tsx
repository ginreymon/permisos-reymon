import { estadoPorteria } from "@/app/actions/porteria";
import { tiposCatalogo } from "@/app/actions/colaborador";
import Porteria from "@/components/porteria/Porteria";

// Vista de portería (celular/tablet en planta). Supabase Auth, rol `porteria`.
// Registra salida y regreso reales contra los permisos aprobados de hoy.
// `tipos` alimenta la vista "Mis permisos" (el portero pide permisos para sí mismo).
export default async function Page() {
  const [estado, tipos] = await Promise.all([estadoPorteria(), tiposCatalogo()]);
  return <Porteria estado={estado} tipos={tipos} />;
}

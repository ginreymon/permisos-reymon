import { leerSesion } from "@/lib/colaborador/session";
import { enmascararNombre, enmascararCedula } from "@/lib/colaborador/identidad";
import { tiposCatalogo, refrescarPermisos } from "@/app/actions/colaborador";
import Colaborador from "@/components/colaborador/Colaborador";
import type { IdentidadVista, PermisoVista } from "@/lib/colaborador/tipos";

// Vista del Colaborador (celular). Sin Supabase Auth: sesión propia por cookie.
export default async function Page() {
  const [tipos, sesion] = await Promise.all([tiposCatalogo(), leerSesion()]);

  let identidad: IdentidadVista | null = null;
  let permisos: PermisoVista[] = [];
  if (sesion) {
    identidad = { cedula: enmascararCedula(sesion.doc), nombreMask: enmascararNombre(sesion.nom), area: sesion.cc };
    const r = await refrescarPermisos();
    if (r.ok) permisos = r.permisos;
  }

  return <Colaborador tipos={tipos} identidadInicial={identidad} permisosIniciales={permisos} />;
}

"use client";

import { useEffect, useState, useTransition } from "react";
import CrearPorCedula from "@/components/coordinador/CrearPorCedula";
import { miEmpleadoPorteria, crearMiPermisoPorteria } from "@/app/actions/porteria";
import type { EmpleadoCoord } from "@/app/actions/coordinador";
import type { SolicitudCupo } from "@/lib/reglas";
import type { TipoCatalogo } from "@/lib/colaborador/tipos";

// "Solicitud" de portería: el portero genera su propio permiso. La cuenta ya lo
// identifica, así que no se pide la cédula; se precarga su empleado y se reutiliza
// el formulario del coordinador con modo "futuro" (regla de 24 h, lo aprueba la
// Dirección General).
export default function MisPermisosPorteria({ tipos, onDone }: { tipos: TipoCatalogo[]; onDone: () => void }) {
  const [emp, setEmp] = useState<EmpleadoCoord | null>(null);
  const [previas, setPrevias] = useState<SolicitudCupo[]>([]);
  const [err, setErr] = useState("");
  const [, start] = useTransition();

  useEffect(() => {
    start(async () => {
      const r = await miEmpleadoPorteria();
      if (r.ok) { setEmp(r.empleado); setPrevias(r.previas); } else setErr(r.error);
    });
  }, []);

  if (err) {
    return (
      <div className="card">
        <p className={`err on`}>{err}</p>
        <button className="btn btn-out btn-xl" style={{ marginTop: 12 }} onClick={onDone}>Volver</button>
      </div>
    );
  }
  if (!emp) return <div className="card"><p className="label">Cargando tu información…</p></div>;

  return (
    <CrearPorCedula
      tipos={tipos} esDirector={false} modoFijo="futuro"
      empleadoInicial={emp} previasIniciales={previas}
      crearPermiso={crearMiPermisoPorteria}
      titulo="Solicitar permiso" subtitulo="Generar un permiso para ti."
      onDone={onDone}
    />
  );
}

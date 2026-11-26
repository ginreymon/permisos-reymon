"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  validarIdentidad, crearPermiso, subirSoporte, refrescarPermisos, salir,
} from "@/app/actions/colaborador";
import { cupoDelMes, type SolicitudCupo } from "@/lib/reglas";
import { fmtDuracion, fmtFechaCorta } from "@/lib/colaborador/formato";
import { aTitulo } from "@/lib/colaborador/identidad";
import { fmt12, minutosAHHMM, sumarMinutosHora, limite24hBogota, diaSiguiente } from "@/lib/colaborador/hora";
import SelectorHora from "@/components/ui/SelectorHora";
import type { CodigoTipo, EstadoSolicitud } from "@/lib/supabase/database.types";
import type { IdentidadVista, PermisoVista, TipoCatalogo } from "@/lib/colaborador/tipos";

type Paso = "identidad" | "lista" | "formulario" | "enviado" | "detalle";

// Turno laboral (minutos desde medianoche).
const TURNO_INICIO = 5 * 60; // 5:00 a. m.
const TURNO_FIN = 22 * 60; // 10:00 p. m.
const DUR_MIN = 15;
const SALIDA_MAX = TURNO_FIN - DUR_MIN; // deja al menos 15 min de permiso antes del fin de turno
const DUR_MAX_ABS = 8 * 60;
const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// Historial del colaborador: solo ve Pendiente y Aprobado. en_curso/cerrado (ya
// aprobados) se muestran como "Aprobado"; rechazados/cancelados no llegan aquí.
function Insignia({ estado }: { estado: EstadoSolicitud }) {
  if (estado === "pendiente") return <span className="badge b-pen"><i />Pendiente</span>;
  return <span className="badge b-ok"><i />Aprobado</span>;
}

/** Comprime la foto en el navegador antes de subir (max 1600px, JPEG q0.7). */
async function comprimir(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * escala), h = Math.round(bitmap.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.7));
    if (!blob) return file;
    return new File([blob], "soporte.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export default function Colaborador({
  tipos, identidadInicial, permisosIniciales,
}: {
  tipos: TipoCatalogo[];
  identidadInicial: IdentidadVista | null;
  permisosIniciales: PermisoVista[];
}) {
  const [paso, setPaso] = useState<Paso>(identidadInicial ? "lista" : "identidad");
  const [identidad, setIdentidad] = useState<IdentidadVista | null>(identidadInicial);
  const [permisos, setPermisos] = useState<PermisoVista[]>(permisosIniciales);
  const [selId, setSelId] = useState<number | null>(null);
  const [nuevoId, setNuevoId] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  // Identidad
  const [cedula, setCedula] = useState("");
  const [apellido, setApellido] = useState("");
  const [habeas, setHabeas] = useState(false);
  const [errIdent, setErrIdent] = useState("");

  // Formulario — regla: el permiso debe pedirse con al menos 24 h de anticipación
  // respecto a la hora de salida. No se permite el mismo día.
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }); // YYYY-MM-DD
  const manana = diaSiguiente(hoy);
  const lim24 = useMemo(() => limite24hBogota(), []);
  // Primer día seleccionable: el de +24 h; si a esa hora ya pasó el último horario
  // de salida del turno, el primer día usable es el siguiente.
  const fechaMin = lim24.minutos > SALIDA_MAX ? diaSiguiente(lim24.fecha) : lim24.fecha;
  // Salida mínima permitida para una fecha dada (por la regla de 24 h).
  const salidaMinParaFecha = (f: string) =>
    f === lim24.fecha ? clampN(lim24.minutos, TURNO_INICIO, SALIDA_MAX) : TURNO_INICIO;

  const [tipo, setTipo] = useState<CodigoTipo | "">("");
  const [fecha, setFecha] = useState(fechaMin);
  const [salidaMin, setSalidaMin] = useState(() => salidaMinParaFecha(fechaMin));
  const [duracionMin, setDuracionMin] = useState(60);
  const [obs, setObs] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errForm, setErrForm] = useState("");
  const [confirmoSinSoporte, setConfirmoSinSoporte] = useState(false);
  const fileNuevo = useRef<HTMLInputElement>(null);
  const fileTardio = useRef<HTMLInputElement>(null);
  const fileFecha = useRef<HTMLInputElement>(null);

  const catalogo = useMemo(() => new Map(tipos.map((t) => [t.codigo, t])), [tipos]);
  const sel = permisos.find((p) => p.id === selId) ?? null;
  const pedido = duracionMin;

  const salidaMinLimite = salidaMinParaFecha(fecha);
  const durMax = Math.min(DUR_MAX_ABS, TURNO_FIN - salidaMin);
  const puedeManana = manana >= fechaMin;
  const chipActivo = fecha === manana ? "manana" : "otro";
  const horaSalidaStr = minutosAHHMM(salidaMin); // "HH:MM" 24h
  const regresoStr = sumarMinutosHora(horaSalidaStr, duracionMin);
  // La duración está topada por el fin de turno (no por el máximo absoluto).
  const topeTurno = durMax < DUR_MAX_ABS && duracionMin >= durMax;

  // Si la salida quedó antes del mínimo permitido para la fecha, ajústala.
  useEffect(() => {
    if (salidaMin < salidaMinLimite) setSalidaMin(salidaMinLimite);
  }, [salidaMin, salidaMinLimite]);

  // Recorta la duración si el regreso pasa del fin de turno.
  useEffect(() => {
    if (duracionMin > durMax) setDuracionMin(Math.max(DUR_MIN, durMax));
  }, [duracionMin, durMax]);

  const cupo = useMemo(() => {
    if (!tipo) return null;
    const cat = catalogo.get(tipo);
    if (!cat || cat.topeMinMes == null) return null;
    const previas: SolicitudCupo[] = permisos.map((p) => ({
      tipo: p.tipo, fecha: p.fecha, estado: p.estado, min_cubierto: p.minCubierto,
    }));
    return cupoDelMes(pedido, cat.topeMinMes, previas, tipo, fecha, "preview");
  }, [tipo, pedido, fecha, permisos, catalogo]);

  const exigeSoporte = tipo ? (catalogo.get(tipo)?.exigeSoporte ?? false) : false;

  // ── Acciones ──
  function enviarIdentidad() {
    if (!cedula.trim() || !apellido.trim()) return setErrIdent("Completa la cédula y el primer apellido.");
    if (!habeas) return setErrIdent("Debes autorizar el tratamiento de tus datos.");
    setErrIdent("");
    const fd = new FormData();
    fd.set("cedula", cedula); fd.set("apellido", apellido); fd.set("habeas", "on");
    startTransition(async () => {
      const r = await validarIdentidad(fd);
      if (!r.ok) return setErrIdent(r.error);
      setIdentidad(r.identidad); setPermisos(r.permisos); setPaso("lista");
    });
  }

  function abrirNuevo() {
    setTipo(""); setFecha(fechaMin); setObs(""); setArchivo(null); setConfirmoSinSoporte(false);
    setErrForm("");
    setSalidaMin(salidaMinParaFecha(fechaMin));
    setDuracionMin(60);
    setPaso("formulario");
  }

  function fijarFecha(valor: string) {
    setFecha(valor);
    setSalidaMin((s) => clampN(s, salidaMinParaFecha(valor), SALIDA_MAX));
  }

  function abrirSelectorFecha() {
    const el = fileFecha.current;
    if (!el) return;
    if (el.showPicker) el.showPicker();
    else el.click();
  }

  function enviarPermiso() {
    if (!tipo) return setErrForm("Selecciona el tipo de permiso.");
    if (!fecha) return setErrForm("Indica la fecha del permiso.");
    if (exigeSoporte && !archivo && !confirmoSinSoporte) {
      setConfirmoSinSoporte(true);
      return setErrForm(
        "Este tipo de permiso necesita soporte. Puedes enviarlo ahora y subir el soporte hasta 24 horas después de tu regreso.",
      );
    }
    setErrForm("");
    startTransition(async () => {
      const fd = new FormData();
      fd.set("tipo", tipo);
      fd.set("horas", String(Math.floor(duracionMin / 60)));
      fd.set("minutos", String(duracionMin % 60));
      fd.set("fecha", fecha); fd.set("hora", horaSalidaStr); if (obs) fd.set("observaciones", obs);
      if (archivo) fd.set("soporte", await comprimir(archivo));
      const r = await crearPermiso(fd);
      if (!r.ok) return setErrForm(r.error);
      setNuevoId(r.id);
      const ref = await refrescarPermisos();
      if (ref.ok) setPermisos(ref.permisos);
      setPaso("enviado");
    });
  }

  function verDetalle(id: number) { setSelId(id); setPaso("detalle"); }

  function onTardio(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || selId == null) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", String(selId)); fd.set("soporte", await comprimir(f));
      const r = await subirSoporte(fd);
      if (r.ok) setPermisos(r.permisos);
      else setErrForm(r.error);
    });
  }

  function cerrarSesion() {
    startTransition(async () => {
      await salir();
      setIdentidad(null); setPermisos([]); setCedula(""); setApellido(""); setHabeas(false);
      setPaso("identidad");
    });
  }

  // ── Render ──
  return (
    <>
      <div className="header">
        <span className="titulo">Mis permisos</span>
        <span className="der">Talento humano</span>
      </div>

      <div className="marco">
        {/* IDENTIDAD */}
        {paso === "identidad" && (
          <section className="paso on">
            <div className="card">
              <div className="card-h">
                <span className="ico">👤</span>
                <div><h3>Identifícate</h3><p>No necesitas usuario ni contraseña.</p></div>
              </div>
              <div className="campo">
                <label className="label" htmlFor="cedula">Número de cédula</label>
                <input id="cedula" inputMode="numeric" autoComplete="off" placeholder="Sin puntos ni comas"
                  value={cedula} onChange={(e) => setCedula(e.target.value)} />
              </div>
              <div className="campo">
                <label className="label" htmlFor="apellido">Primer apellido</label>
                <input id="apellido" autoComplete="off" placeholder="Como aparece en tu contrato"
                  value={apellido} onChange={(e) => setApellido(e.target.value)} />
              </div>
              <label className="check">
                <input type="checkbox" checked={habeas} onChange={(e) => setHabeas(e.target.checked)} />
                <span>Autorizo el tratamiento de mis datos personales para la gestión de mis permisos.</span>
              </label>
              <p className={`err ${errIdent ? "on" : ""}`}>{errIdent}</p>
              <button className="btn btn-xl" style={{ marginTop: 16 }} disabled={pending} onClick={enviarIdentidad}>
                {pending ? "Validando…" : "Continuar"}
              </button>
            </div>
          </section>
        )}

        {/* LISTA */}
        {paso === "lista" && identidad && (
          <section className="paso on">
            <div className="card">
              <div className="ident">
                <span className="ident-n mono">{identidad.nombreMask}</span>
                <span className="ident-m">{identidad.area}</span>
                <span className="ident-cc mono">C.C. {identidad.cedula}</span>
              </div>
              <button className="btn btn-xl" onClick={abrirNuevo}>Solicitar un permiso</button>
            </div>

            <p className="label" style={{ margin: "24px 0 10px" }}>Historial · últimos 60 días</p>
            <div>
              {permisos.length === 0 ? (
                <div className="vacio">
                  <span className="ico-vacio" aria-hidden>🗂️</span>
                  <p>
                    Todavía no has solicitado ningún permiso.
                    <span className="sec">Cuando solicites uno, lo verás aquí con su estado.</span>
                  </p>
                </div>
              ) : (
                permisos.map((p) => (
                  <button key={p.id} className="fila" onClick={() => verDetalle(p.id)}>
                    <span className="f1">
                      <span className="f-tipo">{p.tipoNombre}</span>
                      <span className="f-dur mono">{p.duracion}</span>
                    </span>
                    <span className="f2">
                      <span className="f-fecha mono">{p.fechaHora}</span>
                      <Insignia estado={p.estado} />
                    </span>
                    {p.faltaSoporte && (
                      <span className="badge b-pen" style={{ marginTop: 8 }}><i />Falta soporte</span>
                    )}
                  </button>
                ))
              )}
            </div>

            <button className="btn btn-out btn-md" style={{ marginTop: 24 }} disabled={pending} onClick={cerrarSesion}>Salir</button>
          </section>
        )}

        {/* FORMULARIO */}
        {paso === "formulario" && identidad && (
          <section className="paso on">
            <div className="card">
              <div className="card-h">
                <span className="ico">📝</span>
                <div><h3>Nuevo permiso</h3><p>Tu coordinador de {aTitulo(identidad.area)} recibirá la solicitud.</p></div>
              </div>

              <div className="campo">
                <label className="label" htmlFor="tipo">Tipo de permiso</label>
                <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as CodigoTipo | "")}>
                  <option value="">Selecciona una opción</option>
                  {tipos.map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
                </select>
              </div>

              {cupo && (() => {
                const exceso = cupo.personal;
                const clase = exceso ? "n-amb" : "n-neu";
                let contenido: React.ReactNode;
                if (!exceso) {
                  contenido = <><b>Cupo del periodo (25 al 24)</b>Llevas {fmtDuracion(cupo.usado)} de {fmtDuracion(cupo.tope!)}. Te quedan {fmtDuracion(cupo.restante ?? 0)}.</>;
                } else if (!cupo.cubierto) {
                  contenido = <><b>Cupo agotado</b>Ya usaste {fmtDuracion(cupo.tope!)} en este periodo, así que este permiso quedará completo como permiso personal, que sí se descuenta del salario.</>;
                } else {
                  contenido = <><b>Este permiso se reparte</b>Te queda {fmtDuracion(cupo.restante ?? 0)} de cupo: {fmtDuracion(cupo.cubierto)} se registran en este tipo y {fmtDuracion(exceso)} quedan como permiso personal, que sí se descuenta.</>;
                }
                return <div className={`nota ${clase}`} style={{ marginBottom: 16 }}>{contenido}</div>;
              })()}

              {/* 1. Fecha: chips. Mínimo 24 h de anticipación -> sin "Hoy". */}
              <div className="campo">
                <label className="label">Fecha</label>
                <div className="chips" role="radiogroup" aria-label="Fecha del permiso">
                  {puedeManana && (
                    <button type="button" className="chip" role="radio" aria-checked={chipActivo === "manana"}
                      onClick={() => fijarFecha(manana)}>Mañana</button>
                  )}
                  <button type="button" className="chip" role="radio" aria-checked={chipActivo === "otro"}
                    onClick={abrirSelectorFecha}>
                    📅 {chipActivo === "otro" ? fmtFechaCorta(fecha) : "Otro día"}
                  </button>
                  <input ref={fileFecha} type="date" lang="es-CO" min={fechaMin} value={fecha}
                    onChange={(e) => e.target.value && fijarFecha(e.target.value)}
                    style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />
                </div>
                <p className="tiempo-hint">El permiso debe pedirse con al menos 24 horas de anticipación. De lo contrario, pídele a tu coordinador que genere la solicitud del permiso directamente.</p>
              </div>

              {/* 2. Hora de salida: selector 12h + AM/PM */}
              <div className="campo">
                <label className="label">Hora de salida</label>
                <SelectorHora
                  valor={salidaMin} min={salidaMinLimite} max={SALIDA_MAX} conAmPm
                  etiqueta="Hora de salida" onChange={setSalidaMin}
                />
              </div>

              {/* 3. Duración: cajas Horas / Minutos (sin AM/PM) */}
              <div className="campo">
                <label className="label">Duración</label>
                <SelectorHora
                  valor={duracionMin} min={DUR_MIN} max={durMax} conAmPm={false}
                  etiqueta="Duración" onChange={setDuracionMin}
                />
                {topeTurno && <p className="tiempo-hint">Ajustamos la duración al fin del turno.</p>}
              </div>

              {/* 4. Resumen */}
              <div className="resumen-regreso" style={{ marginBottom: 16 }}>
                <span>Regresas a las</span>
                <span className="v">{fmt12(regresoStr)}</span>
              </div>

              <div className="campo">
                <label className="label" htmlFor="obs">Observaciones · opcional</label>
                <textarea id="obs" placeholder="Cuéntale a tu coordinador para qué necesitas el permiso."
                  value={obs} onChange={(e) => setObs(e.target.value)} />
              </div>

              <div className="campo">
                <label className="label">Documento soporte{" "}
                  <span className={`req ${exigeSoporte ? "on" : ""}`}>· {exigeSoporte ? "obligatorio" : "opcional"}</span>
                </label>
                <div className={`soltar${exigeSoporte ? " soltar-oblig" : ""}`} onClick={() => fileNuevo.current?.click()}>
                  <span>📷</span><b>{archivo ? archivo.name : "Toca para tomar la foto"}</b>
                </div>
                <input ref={fileNuevo} type="file" accept="image/*" capture="environment" hidden
                  onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
              </div>

              <p className={`err ${errForm ? "on" : ""}`}>{errForm}</p>
              <div className="barra-fija">
                <button className="btn btn-xl" disabled={pending} onClick={enviarPermiso}>
                  {pending ? "Enviando…" : confirmoSinSoporte && !archivo ? "Enviar sin soporte por ahora" : "Enviar solicitud"}
                </button>
                <button className="btn btn-out btn-md" onClick={() => setPaso("lista")}>Cancelar</button>
              </div>
            </div>
          </section>
        )}

        {/* ENVIADO */}
        {paso === "enviado" && identidad && (
          <section className="paso on">
            <div className="card" style={{ textAlign: "center" }}>
              <span className="badge b-ok" style={{ marginBottom: 14 }}><i />Enviada</span>
              <p className="label" style={{ marginBottom: 4 }}>Permiso</p>
              <p className="mono consecutivo">N.º {nuevoId}</p>
              <p className="ayuda">Le llegó a tu coordinador de {identidad.area}.</p>
              <button className="btn btn-xl" style={{ marginTop: 18 }} onClick={() => setPaso("lista")}>Ver mis permisos</button>
            </div>
          </section>
        )}

        {/* DETALLE */}
        {paso === "detalle" && sel && (
          <section className="paso on">
            <div className="card">
              <div className="det-top">
                <span className="label" style={{ margin: 0 }}>Permiso N.º {sel.id}</span>
                <Insignia estado={sel.estado} />
              </div>

              <table className="resumen">
                <tbody>
                  <tr><th>Tipo</th><td>{sel.tipoNombre}</td></tr>
                  <tr><th>Duración</th><td className="mono">{sel.duracion}</td></tr>
                  {sel.minPersonal > 0 && sel.tipo !== "PP" && (
                    <tr><th>Se registra como</th><td>
                      {sel.minCubierto
                        ? <>{fmtDuracion(sel.minCubierto)} en {sel.tipoNombre.toLowerCase()}<br />{fmtDuracion(sel.minPersonal)} como personal</>
                        : "Todo como permiso personal"}
                    </td></tr>
                  )}
                  <tr><th>Fecha y hora</th><td className="mono">{sel.fechaHora}</td></tr>
                  <tr><th>Radicado</th><td>{sel.radicado}</td></tr>
                </tbody>
              </table>

              {sel.faltaSoporte && !sel.plazoVencido && (
                <>
                  <div className="nota n-amb" style={{ marginBottom: 14 }}>
                    <b>Falta el documento soporte</b>
                    Tienes 24 horas después de tu regreso para subirlo.
                  </div>
                  <button className="btn btn-xl" style={{ marginBottom: 12 }} disabled={pending}
                    onClick={() => fileTardio.current?.click()}>Subir soporte ahora</button>
                  <input ref={fileTardio} type="file" accept="image/*" capture="environment" hidden onChange={onTardio} />
                </>
              )}

              {sel.faltaSoporte && sel.plazoVencido && (
                <div className="nota n-red" style={{ marginBottom: 14 }}>
                  <b>Plazo de soporte vencido</b>
                  Pasaron las 24 horas sin soporte; Talento Humano descontará este tiempo del salario.
                </div>
              )}

              {(sel.comentario || sel.motivoRechazo) && (
                <div className="nota n-neu" style={{ marginBottom: 14 }}>
                  {sel.motivoRechazo ? (
                    <>
                      <b>Motivo: {sel.motivoRechazo}</b>
                      {sel.comentario || ""}
                    </>
                  ) : (
                    <>
                      <b>Comentario de tu coordinador</b>
                      {sel.comentario}
                    </>
                  )}
                </div>
              )}

              <button className="btn btn-out btn-xl" style={{ marginTop: 10 }} onClick={() => setPaso("lista")}>Volver</button>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

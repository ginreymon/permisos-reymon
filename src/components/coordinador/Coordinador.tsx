"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cerrarSesion, aprobar, rechazar, verSoporte, subirSoporteCoord, type EstadoCoordinador,
} from "@/app/actions/coordinador";
import { aTitulo } from "@/lib/colaborador/identidad";
import CrearPorCedula from "@/components/coordinador/CrearPorCedula";
import type { CoordVista } from "@/lib/coordinador/vista";
import type { TipoCatalogo } from "@/lib/colaborador/tipos";
import type { EstadoSolicitud } from "@/lib/supabase/database.types";

type Paso = "bandeja" | "detalle" | "aprobar" | "rechazar";

const MOTIVOS = [
  { v: "No reconozco esta solicitud", s: "El colaborador no me la pidió" },
  { v: "No hay cubrimiento ese día", s: "La operación no puede quedarse sin la persona" },
  { v: "Falta el documento soporte", s: "" },
  { v: "Otro motivo", s: "" },
];

// Placeholder del comentario según el motivo. "Otro motivo" es el único obligatorio.
const PLACEHOLDER_REC: Record<string, string> = {
  "No reconozco esta solicitud": "Ej. Si no fuiste tú, avísale a Talento Humano.",
  "No hay cubrimiento ese día": "Ej. Podemos moverlo al jueves en la tarde.",
  "Falta el documento soporte": "Ej. Súbelo y vuelve a solicitarlo.",
  "Otro motivo": "Sin esto, el colaborador no sabe qué corregir.",
};

const DECIDIDO: Record<Exclude<EstadoSolicitud, "pendiente">, { t: string; c: string }> = {
  aprobado: { t: "Aprobado por ti", c: "b-ok" },
  rechazado: { t: "Rechazado por ti", c: "b-no" },
  en_curso: { t: "En curso", c: "b-info" },
  cerrado: { t: "Finalizado", c: "b-neu" },
};
function BadgeEstado({ estado }: { estado: EstadoSolicitud }) {
  if (estado === "pendiente") return <span className="badge b-pen"><i />Pendiente</span>;
  const d = DECIDIDO[estado];
  return <span className={`badge ${d.c}`}><i />{d.t}</span>;
}

export default function Coordinador({ estado, tipos }: { estado: EstadoCoordinador | null; tipos: TipoCatalogo[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // Navegación
  const [paso, setPaso] = useState<Paso>("bandeja");
  const [tab, setTab] = useState<"pendiente" | "resueltos">("pendiente");
  const [sel, setSel] = useState<CoordVista | null>(null);
  const [menu, setMenu] = useState(false); // sidebar hamburguesa
  const [vista, setVista] = useState<"aprobacion" | "solicitud">("aprobacion");
  const fileSoporte = useRef<HTMLInputElement>(null);

  // Decisión
  const [comentario, setComentario] = useState("");
  const [motivo, setMotivo] = useState(""); // ninguno marcado por defecto
  const [comentRec, setComentRec] = useState("");
  const [recInvalido, setRecInvalido] = useState(false);
  const [errDec, setErrDec] = useState("");
  const opcionesRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<HTMLTextAreaElement>(null);

  function salir() {
    start(async () => { await cerrarSesion(); router.push("/"); });
  }

  function abrir(s: CoordVista, destino: Paso) {
    setSel(s); setComentario(""); setMotivo(""); setComentRec(""); setRecInvalido(false); setErrDec("");
    setPaso(destino);
  }

  function elegirMotivo(v: string) {
    setMotivo(v); setErrDec(""); setRecInvalido(false);
    if (v === "Otro motivo") setTimeout(() => recRef.current?.focus(), 0);
  }

  function confirmarAprobar() {
    if (!sel) return;
    start(async () => {
      const r = await aprobar(sel.id, comentario);
      if (!r.ok) return setErrDec(r.error);
      router.refresh(); setPaso("bandeja");
    });
  }

  function confirmarRechazar() {
    if (!sel) return;
    if (!motivo) {
      setErrDec("Elige un motivo para rechazar.");
      opcionesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (motivo === "Otro motivo" && !comentRec.trim()) {
      setErrDec("Cuéntale al colaborador por qué lo rechazas.");
      setRecInvalido(true);
      recRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      recRef.current?.focus();
      return;
    }
    start(async () => {
      const r = await rechazar(sel.id, motivo, comentRec);
      if (!r.ok) return setErrDec(r.error);
      router.refresh(); setPaso("bandeja");
    });
  }

  function abrirSoporte(id: number) {
    // Abre la pestaña dentro del gesto del tap (síncrono). Si se abriera tras el
    // await, el bloqueador de pop-ups del móvil la cancela. Luego se le fija la URL.
    const w = window.open("", "_blank");
    start(async () => {
      const r = await verSoporte(id);
      if (!r.ok) { w?.close(); return setErrDec(r.error); }
      if (w) { w.opener = null; w.location.href = r.url; } else window.location.href = r.url;
    });
  }

  // Coordinador sube el soporte faltante de un permiso resuelto (sin límite de tiempo).
  function onSoporteCoord(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !sel) return;
    start(async () => {
      const fd = new FormData();
      fd.set("id", String(sel.id)); fd.set("soporte", f);
      const r = await subirSoporteCoord(fd);
      if (!r.ok) return setErrDec(r.error);
      router.refresh(); setPaso("bandeja");
    });
  }

  // Sin sesión válida de coordinador: la página redirige al login principal (/).
  if (!estado) return null;

  const area = estado.esDirector ? "Dirección General" : (estado.areas.map(aTitulo).join(", ") || "Tu área");
  const lista = tab === "pendiente" ? estado.pendientes : estado.resueltos;
  const nPend = estado.pendientes.length;
  const nSinSoporte = estado.resueltos.filter((s) => s.faltaSoporte).length;
  const sub = `${area} · ${nPend === 0 ? "sin solicitudes por responder" : nPend === 1 ? "1 persona esperando respuesta" : `${nPend} personas esperando respuesta`}`;

  return (
    <>
      <div className="header">
        <div className="header-l">
          <button className="ham" aria-label="Abrir menú" onClick={() => setMenu(true)}>
            <span /><span /><span />
          </button>
          <span className="titulo">Aprobaciones</span>
        </div>
        <span className="der">{estado.esDirector ? area : `Coordinación de ${area}`}</span>
      </div>

      {menu && (
        <div className="drawer-ov" onClick={() => setMenu(false)}>
          <aside className="nav" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Menú">
            <div className="drawer-h">
              <span className="titulo">Menú</span>
              <button className="drawer-x" aria-label="Cerrar" onClick={() => setMenu(false)}>✕</button>
            </div>
            <div className="nav-body">
              <button className={`nav-item ${vista === "solicitud" ? "on" : ""}`}
                onClick={() => { setVista("solicitud"); setMenu(false); }}>
                <span className="nav-ico">📝</span>
                <span><b>Solicitud</b><small>Generar un permiso por cédula</small></span>
              </button>
              <button className={`nav-item ${vista === "aprobacion" ? "on" : ""}`}
                onClick={() => { setVista("aprobacion"); setPaso("bandeja"); setMenu(false); }}>
                <span className="nav-ico">✅</span>
                <span><b>Aprobación</b><small>Revisar y responder solicitudes</small></span>
              </button>
            </div>
            <div style={{ marginTop: "auto", padding: 12 }}>
              <button className="btn btn-out btn-xl" disabled={pending} onClick={salir}>
                Cerrar sesión
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="marco">
        {/* SOLICITUD · generar permiso por cédula (visual del colaborador) */}
        {vista === "solicitud" && (
          <section className="paso on">
            <CrearPorCedula tipos={tipos} esDirector={estado.esDirector} onDone={() => setVista("aprobacion")} />
          </section>
        )}

        {vista === "aprobacion" && (<>
        {/* BANDEJA */}
        {paso === "bandeja" && (
          <section className="paso on">
            <p className="det-sub" style={{ marginBottom: 12 }}>{sub}</p>
            <div className="tabs">
              <button aria-pressed={tab === "pendiente"} onClick={() => setTab("pendiente")}>
                Pendientes{nPend > 0 && <span className="cont">{nPend}</span>}
              </button>
              <button aria-pressed={tab === "resueltos"} onClick={() => setTab("resueltos")}>
                Resueltos{nSinSoporte > 0 && <span className="cont cont-amb" title="Permisos sin documento soporte">{nSinSoporte}</span>}
              </button>
            </div>

            <div>
              {lista.length === 0 ? (
                <div className="vacio"><p>{tab === "pendiente"
                  ? "Nada pendiente. Todo el equipo está al día."
                  : "Todavía no has respondido ninguna solicitud."}</p></div>
              ) : (
                lista.map((s) => (
                  <div key={s.id} className="card sol">
                    <div className="sol-top">
                      <div>
                        <p className="sol-nom">{s.nombre}</p>
                        <p className="sol-ced mono">C.C. {s.documento}</p>
                      </div>
                      <span className="badge b-info"><i />{s.tipoCorto}</span>
                    </div>

                    <div className="sol-horas">
                      <div><span className="label">Fecha</span><span className="v mono">{s.fechaTexto}</span></div>
                      <div><span className="label">Salida</span><span className="v mono">{s.salida}</span></div>
                      <div><span className="label">Regreso</span><span className="v mono">{s.regreso}</span></div>
                      <div><span className="label">Duración</span><span className="v mono">{s.duracion}</span></div>
                    </div>

                    {s.faltaSoporte && (
                      <div className="nota n-red" style={{ marginTop: 12 }}>
                        <b>Sin documento soporte</b>El colaborador tiene plazo de 24 h después del regreso para subir el soporte.
                      </div>
                    )}
                    {s.solapado && (
                      <div className="nota n-amb" style={{ marginTop: 12 }}><b>Permiso solapado</b>{s.solapado}</div>
                    )}

                    <p className="sol-hist">{s.historial}</p>
                    <p className="sol-rad">Radicado {s.radicado.toLowerCase()}</p>

                    {s.estado === "pendiente" ? (
                      <>
                        <div className="duo" style={{ marginTop: 14 }}>
                          <button className="btn btn-ok btn-xl" onClick={() => abrir(s, "aprobar")}>Aprobar</button>
                          <button className="btn btn-no btn-xl" onClick={() => abrir(s, "rechazar")}>Rechazar</button>
                        </div>
                        <button className="ver" onClick={() => abrir(s, "detalle")}>Ver detalle</button>
                      </>
                    ) : (
                      <>
                        <div style={{ marginTop: 14 }}><BadgeEstado estado={s.estado} /></div>
                        <button className="ver" onClick={() => abrir(s, "detalle")}>Ver detalle</button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* DETALLE */}
        {paso === "detalle" && sel && (
          <section className="paso on">
            <div className="card">
              <p className="det-nom">{sel.nombre}</p>
              <p className="det-sub">Permiso N.º {sel.id} · {area}</p>

              <table className="resumen">
                <tbody>
                  <tr><th>Cédula</th><td className="mono">{sel.documento}</td></tr>
                  <tr><th>Tipo</th><td>{sel.tipoNombre}</td></tr>
                  <tr><th>Duración</th><td className="mono">{sel.duracion}</td></tr>
                  <tr><th>Fecha</th><td className="mono">{sel.fechaTexto}</td></tr>
                  <tr><th>Hora de salida</th><td className="mono">{sel.salida}</td></tr>
                  <tr><th>Hora de regreso</th><td className="mono">{sel.regreso}</td></tr>
                </tbody>
              </table>
              <p className="hist-det">{sel.historial}</p>

              {sel.observaciones && (
                <div className="nota n-neu" style={{ marginBottom: 12 }}>
                  <b>Observaciones del colaborador</b>{sel.observaciones}
                </div>
              )}
              {sel.tieneSoporte && (
                <div className="soporte" onClick={() => abrirSoporte(sel.id)}>
                  <span className="mini" />Ver documento soporte
                </div>
              )}
              {sel.faltaSoporte && (
                <div className="nota n-red" style={{ marginBottom: 12 }}>
                  <b>Sin documento soporte</b>El colaborador tiene plazo de 24 h después del regreso para subir el soporte.
                </div>
              )}
              {sel.faltaSoporte && sel.estado !== "pendiente" && (
                <>
                  <button className="btn btn-xl" style={{ marginBottom: 12 }} disabled={pending}
                    onClick={() => fileSoporte.current?.click()}>
                    {pending ? "Subiendo…" : "Subir soporte por el colaborador"}
                  </button>
                  <input ref={fileSoporte} type="file" accept="image/*" hidden onChange={onSoporteCoord} />
                  <p className={`err ${errDec ? "on" : ""}`}>{errDec}</p>
                </>
              )}
              {sel.solapado && (
                <div className="nota n-amb" style={{ marginBottom: 12 }}><b>Permiso solapado</b>{sel.solapado}</div>
              )}
              {(sel.salidaReal || sel.regresoReal) && (
                <div className="nota n-blu" style={{ marginBottom: 12 }}>
                  <b>Registro en portería</b>Salió a las {sel.salidaReal ?? "—"} y regresó a las {sel.regresoReal ?? "—"}.
                </div>
              )}

              {sel.estado !== "pendiente" && (
                <div style={{ margin: "14px 0 12px" }}>
                  <BadgeEstado estado={sel.estado} />
                  {(sel.comentario || sel.motivoRechazo) && (
                    <div className="nota n-neu" style={{ marginTop: 12 }}>
                      {sel.motivoRechazo
                        ? <><b>Motivo: {sel.motivoRechazo}</b>{sel.comentario || ""}</>
                        : <><b>Tu comentario</b>{sel.comentario}</>}
                    </div>
                  )}
                </div>
              )}

              {sel.estado === "pendiente" && (
                <div className="duo" style={{ marginTop: 16 }}>
                  <button className="btn btn-ok btn-xl" onClick={() => setPaso("aprobar")}>Aprobar</button>
                  <button className="btn btn-no btn-xl" onClick={() => setPaso("rechazar")}>Rechazar</button>
                </div>
              )}
              <button className="btn btn-out btn-xl" style={{ marginTop: 10 }} onClick={() => setPaso("bandeja")}>Volver a la bandeja</button>
            </div>
          </section>
        )}

        {/* APROBAR */}
        {paso === "aprobar" && sel && (
          <section className="paso on">
            <div className="card">
              <div className="card-h">
                <span className="ico">✅</span>
                <div><h3>Aprobar permiso</h3><p>{sel.nombre} · {sel.duracion} · {sel.fechaTexto} {sel.salida}</p></div>
              </div>

              {sel.faltaSoporte && (
                <div className="nota n-red" style={{ marginBottom: 16 }}>
                  <b>Sin documento soporte</b>El colaborador tiene plazo de 24 h después del regreso para subir el soporte.
                </div>
              )}
              <div className="nota n-amb" style={{ marginBottom: 16 }}>
                <b>Esto no se puede revertir</b>
              </div>

              <div className="campo">
                <label className="label" htmlFor="apr-com">Comentario · opcional, lo verá el colaborador</label>
                <textarea id="apr-com" placeholder="Ej. Avísale a tu líder de turno antes de salir."
                  value={comentario} onChange={(e) => setComentario(e.target.value)} />
              </div>

              <p className={`err ${errDec ? "on" : ""}`}>{errDec}</p>
              <button className="btn btn-ok btn-xl" disabled={pending} onClick={confirmarAprobar}>
                {pending ? "Aprobando…" : "Aprobar permiso"}
              </button>
              <button className="btn btn-out btn-xl" style={{ marginTop: 10 }} onClick={() => setPaso("detalle")}>Volver</button>
            </div>
          </section>
        )}

        {/* RECHAZAR */}
        {paso === "rechazar" && sel && (
          <section className="paso on">
            <div className="card">
              <div className="card-h">
                <span className="ico">❌</span>
                <div><h3>Rechazar permiso</h3><p>{sel.nombre} · {sel.duracion} · {sel.fechaTexto} {sel.salida}</p></div>
              </div>

              <label className="label">Motivo del rechazo</label>
              <div className="opciones" ref={opcionesRef}>
                {MOTIVOS.map((m) => (
                  <label key={m.v} className="opcion">
                    <input type="radio" name="motrec" value={m.v} checked={motivo === m.v} onChange={() => elegirMotivo(m.v)} />
                    <span className="t">{m.v}{m.s && <small>{m.s}</small>}</span>
                  </label>
                ))}
              </div>

              {motivo === "No reconozco esta solicitud" && (
                <div className="nota n-amb" style={{ marginTop: 12 }}>
                  <b>Se avisará a Talento Humano</b>
                  Talento Humano recibirá una alerta para revisar quién hizo esta solicitud.
                </div>
              )}

              <div className="campo">
                {motivo === "Otro motivo" ? (
                  <label className="label" htmlFor="rec-com">
                    Explícale al colaborador · <span className="req on">obligatorio</span>
                  </label>
                ) : (
                  <label className="label" htmlFor="rec-com">Comentario para el colaborador · opcional</label>
                )}
                <textarea id="rec-com" ref={recRef}
                  style={recInvalido ? { borderColor: "var(--red-600)" } : undefined}
                  placeholder={motivo ? PLACEHOLDER_REC[motivo] : "Elige primero un motivo."}
                  value={comentRec}
                  onChange={(e) => { setComentRec(e.target.value); setErrDec(""); setRecInvalido(false); }} />
              </div>

              <p className={`err ${errDec ? "on" : ""}`}>{errDec}</p>
              <button className="btn btn-no btn-xl" disabled={pending} onClick={confirmarRechazar}>
                {pending ? "Rechazando…" : "Rechazar permiso"}
              </button>
              <button className="btn btn-out btn-xl" style={{ marginTop: 10 }} onClick={() => setPaso("detalle")}>Volver</button>
            </div>
          </section>
        )}
        </>)}
      </div>
    </>
  );
}

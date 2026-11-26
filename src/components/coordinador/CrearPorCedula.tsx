"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buscarEmpleadoCoord, crearComoCoordinador, type EmpleadoCoord, type ResultadoEmpleado, type ResultadoCrearCoord } from "@/app/actions/coordinador";
import { cupoDelMes, type SolicitudCupo } from "@/lib/reglas";
import { aTitulo } from "@/lib/colaborador/identidad";
import { fmtDuracion, fmtFechaCorta } from "@/lib/colaborador/formato";
import { fmt12, minutosAHHMM, sumarMinutosHora, proximoCuartoBogota, diaSiguiente, limite24hBogota } from "@/lib/colaborador/hora";
import SelectorHora from "@/components/ui/SelectorHora";
import type { CodigoTipo } from "@/lib/supabase/database.types";
import type { TipoCatalogo } from "@/lib/colaborador/tipos";

// Turno laboral (minutos desde medianoche), igual que en la vista del colaborador.
const TURNO_INICIO = 5 * 60; // 5:00 a. m.
const TURNO_FIN = 22 * 60; // 10:00 p. m.
const DUR_MIN = 15;
const SALIDA_MAX = TURNO_FIN - DUR_MIN;
const DUR_MAX_ABS = 8 * 60;
const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// Modo según el destino del permiso:
//  urgente -> colaborador normal: solo dentro de las próximas 24 h, nace aprobado.
//  futuro  -> cargo directivo creado por un coordinador: solo a futuro, lo aprueba la Dirección.
//  libre   -> cargo directivo creado por la Dirección General: cualquier fecha, nace aprobado.
type Modo = "urgente" | "futuro" | "libre";
function modoDe(empleado: EmpleadoCoord | null, esDirector: boolean): Modo {
  if (!empleado || !empleado.esDirectivo) return "urgente";
  return esDirector ? "libre" : "futuro";
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

type Paso = "cedula" | "form" | "listo";

export default function CrearPorCedula({
  tipos, esDirector, onDone,
  buscarEmpleado = buscarEmpleadoCoord,
  crearPermiso = crearComoCoordinador,
  modoFijo,
  titulo = "Generar permiso",
  subtitulo = "Escribe la cédula del colaborador o la tuya.",
  empleadoInicial,
  previasIniciales,
}: {
  tipos: TipoCatalogo[];
  esDirector: boolean;
  onDone: () => void;
  // Portería reutiliza esta vista con sus propias acciones y un modo fijo.
  buscarEmpleado?: (cedula: string) => Promise<ResultadoEmpleado>;
  crearPermiso?: (fd: FormData) => Promise<ResultadoCrearCoord>;
  modoFijo?: Modo;
  titulo?: string;
  subtitulo?: string;
  // Portería: el dueño de la cuenta ya está identificado -> se salta el paso de cédula.
  empleadoInicial?: EmpleadoCoord | null;
  previasIniciales?: SolicitudCupo[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [paso, setPaso] = useState<Paso>(empleadoInicial ? "form" : "cedula");

  // Paso 1: cédula
  const [cedula, setCedula] = useState("");
  const [empleado, setEmpleado] = useState<EmpleadoCoord | null>(empleadoInicial ?? null);
  const [previas, setPrevias] = useState<SolicitudCupo[]>(previasIniciales ?? []);
  const [errCed, setErrCed] = useState("");

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const manana = diaSiguiente(hoy);
  const lim = useMemo(() => limite24hBogota(), []); // instante actual + 24 h (Bogotá)

  // Primera salida válida para una fecha, según el modo.
  const salidaMinDe = (f: string, m: Modo) => {
    if (f === hoy && m !== "futuro") return clampN(proximoCuartoBogota(), TURNO_INICIO, SALIDA_MAX);
    if (m === "futuro" && f === lim.fecha) return clampN(lim.minutos, TURNO_INICIO, SALIDA_MAX);
    return TURNO_INICIO;
  };

  // Fecha/salida iniciales: si entramos directo al formulario (portería), respetan el modo fijo.
  const fechaInicial = empleadoInicial && modoFijo === "futuro"
    ? (lim.minutos > SALIDA_MAX ? diaSiguiente(lim.fecha) : lim.fecha)
    : hoy;

  // Paso 2: permiso
  const [tipo, setTipo] = useState<CodigoTipo | "">("");
  const [fecha, setFecha] = useState(fechaInicial);
  const [salidaMin, setSalidaMin] = useState(() => salidaMinDe(fechaInicial, modoFijo ?? "urgente"));
  const [duracionMin, setDuracionMin] = useState(60);
  const [obs, setObs] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errForm, setErrForm] = useState("");
  const [confirmoSinSoporte, setConfirmoSinSoporte] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileFecha = useRef<HTMLInputElement>(null);

  // Paso 3: resultado
  const [resultado, setResultado] = useState<{ id: number; pendiente: boolean } | null>(null);

  const modo = modoFijo ?? modoDe(empleado, esDirector);
  const fechaMinFuturo = lim.minutos > SALIDA_MAX ? diaSiguiente(lim.fecha) : lim.fecha;
  const fechaMin = modo === "futuro" ? fechaMinFuturo : hoy;
  const puedeHoy = modo !== "futuro";
  const puedeManana = manana >= fechaMin;
  const permiteOtroDia = modo !== "urgente";

  const catalogo = useMemo(() => new Map(tipos.map((t) => [t.codigo, t])), [tipos]);
  const exigeSoporte = tipo ? (catalogo.get(tipo)?.exigeSoporte ?? false) : false;
  const salidaMinLimite = salidaMinDe(fecha, modo);
  const salidaEff = clampN(salidaMin, salidaMinLimite, SALIDA_MAX);
  const salidaStr = minutosAHHMM(salidaEff);
  const durMax = Math.min(DUR_MAX_ABS, TURNO_FIN - salidaEff);
  const durEff = clampN(duracionMin, DUR_MIN, durMax);
  const regresoStr = sumarMinutosHora(salidaStr, durEff);
  const chipActivo = fecha === hoy ? "hoy" : fecha === manana ? "manana" : "otro";

  const catSel = tipo ? catalogo.get(tipo) : undefined;
  const cupo = tipo && catSel && catSel.topeMinMes != null
    ? cupoDelMes(durEff, catSel.topeMinMes, previas, tipo, fecha, "preview")
    : null;

  function buscar() {
    const c = cedula.trim();
    if (!c) return setErrCed("Escribe la cédula del colaborador.");
    setErrCed("");
    start(async () => {
      const r = await buscarEmpleado(c);
      if (!r.ok) return setErrCed(r.error);
      const m = modoFijo ?? modoDe(r.empleado, esDirector);
      const fIni = m === "futuro" ? fechaMinFuturo : hoy;
      setEmpleado(r.empleado);
      setPrevias(r.previas);
      setTipo(""); setObs(""); setArchivo(null); setConfirmoSinSoporte(false); setErrForm("");
      setFecha(fIni); setSalidaMin(salidaMinDe(fIni, m)); setDuracionMin(60);
      setPaso("form");
    });
  }

  function fijarFecha(valor: string) {
    setFecha(valor);
    setSalidaMin((sm) => clampN(sm, salidaMinDe(valor, modo), SALIDA_MAX));
  }
  function abrirSelectorFecha() {
    const el = fileFecha.current;
    if (!el) return;
    if (el.showPicker) el.showPicker(); else el.click();
  }

  function crear() {
    if (!empleado) return;
    if (!tipo) return setErrForm("Selecciona el tipo de permiso.");
    if (exigeSoporte && !archivo && !confirmoSinSoporte) {
      setConfirmoSinSoporte(true);
      return setErrForm("Este tipo de permiso necesita soporte. Puedes crearlo ahora y subirlo después.");
    }
    setErrForm("");
    start(async () => {
      const fd = new FormData();
      fd.set("cedula", empleado.documento);
      fd.set("tipo", tipo);
      fd.set("horas", String(Math.floor(durEff / 60)));
      fd.set("minutos", String(durEff % 60));
      fd.set("fecha", fecha);
      fd.set("hora", salidaStr);
      if (obs) fd.set("observaciones", obs);
      if (archivo) fd.set("soporte", await comprimir(archivo));
      const r = await crearPermiso(fd);
      if (!r.ok) return setErrForm(r.error);
      setResultado({ id: r.id, pendiente: r.pendiente });
      setPaso("listo");
      router.refresh();
    });
  }

  // ── PASO 1 · CÉDULA ──
  if (paso === "cedula") {
    return (
      <div className="card">
        <div className="card-h">
          <span className="ico">🪪</span>
          <div><h3>{titulo}</h3><p>{subtitulo}</p></div>
        </div>
        <div className="campo">
          <label className="label" htmlFor="cc-ced">Número de cédula</label>
          <input id="cc-ced" inputMode="numeric" autoComplete="off" placeholder="Sin puntos ni comas"
            value={cedula} onChange={(e) => setCedula(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()} />
        </div>
        <p className={`err ${errCed ? "on" : ""}`}>{errCed}</p>
        <button className="btn btn-xl" disabled={pending} onClick={buscar}>
          {pending ? "Buscando…" : "Continuar"}
        </button>
      </div>
    );
  }

  // ── PASO 3 · LISTO ──
  if (paso === "listo" && resultado) {
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <span className={`badge ${resultado.pendiente ? "b-pen" : "b-ok"}`} style={{ marginBottom: 14 }}>
          <i />{resultado.pendiente ? "Enviado a Dirección" : "Aprobado"}
        </span>
        <p className="label" style={{ marginBottom: 4 }}>Permiso</p>
        <p className="mono consecutivo">N.º {resultado.id}</p>
        <p className="ayuda">
          {resultado.pendiente
            ? "Quedó pendiente para que lo apruebe la Dirección General."
            : "Quedó aprobado. Ya aparece en la bandeja del colaborador y en portería."}
        </p>
        <button className="btn btn-xl" style={{ marginTop: 18 }}
          onClick={() => {
            setResultado(null);
            setTipo(""); setObs(""); setArchivo(null); setConfirmoSinSoporte(false); setErrForm("");
            if (empleadoInicial) {
              // Portería: misma persona, formulario limpio.
              setFecha(fechaInicial); setSalidaMin(salidaMinDe(fechaInicial, modo)); setDuracionMin(60);
              setPaso("form");
            } else {
              setCedula(""); setEmpleado(null); setPaso("cedula");
            }
          }}>
          Generar otro permiso
        </button>
        <button className="btn btn-out btn-md" style={{ marginTop: 10 }} onClick={onDone}>
          {empleadoInicial ? "Volver" : "Volver a aprobación"}
        </button>
      </div>
    );
  }

  // ── PASO 2 · FORMULARIO ──
  if (!empleado) return null;
  return (
    <div className="card">
      <div className="ident">
        <span className="ident-n">{empleado.nombre}</span>
        <span className="ident-m">{aTitulo(empleado.area)}</span>
        <span className="ident-cc mono">C.C. {empleado.documento}</span>
      </div>

      {modo === "futuro" && empleado.esDirectivo && (
        <div className="nota n-amb" style={{ marginBottom: 16 }}>
          <b>Cargo directivo</b>
          Este permiso lo aprueba la Dirección General y debe ser a futuro (más de 24 h). Quedará pendiente, no aprobado por ti.
        </div>
      )}

      <div className="campo">
        <label className="label" htmlFor="cc-tipo">Tipo de permiso</label>
        <select id="cc-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as CodigoTipo | "")}>
          <option value="">Selecciona una opción</option>
          {tipos.map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
        </select>
      </div>

      {cupo && (() => {
        const exceso = cupo.personal;
        const clase = exceso ? "n-amb" : "n-neu";
        let contenido: React.ReactNode;
        if (!exceso) {
          contenido = <><b>Cupo del periodo (25 al 24)</b>Lleva {fmtDuracion(cupo.usado)} de {fmtDuracion(cupo.tope!)}. Le quedan {fmtDuracion(cupo.restante ?? 0)}.</>;
        } else if (!cupo.cubierto) {
          contenido = <><b>Cupo agotado</b>Ya usó {fmtDuracion(cupo.tope!)} en este periodo; este permiso queda completo como permiso personal, que sí se descuenta del salario.</>;
        } else {
          contenido = <><b>Este permiso se reparte</b>Le queda {fmtDuracion(cupo.restante ?? 0)} de cupo: {fmtDuracion(cupo.cubierto)} en este tipo y {fmtDuracion(exceso)} como permiso personal, que sí se descuenta.</>;
        }
        return <div className={`nota ${clase}`} style={{ marginBottom: 16 }}>{contenido}</div>;
      })()}

      <div className="campo">
        <label className="label">Fecha</label>
        <div className="chips" role="radiogroup" aria-label="Fecha del permiso">
          {puedeHoy && (
            <button type="button" className="chip" role="radio" aria-checked={chipActivo === "hoy"}
              onClick={() => fijarFecha(hoy)}>Hoy</button>
          )}
          {puedeManana && (
            <button type="button" className="chip" role="radio" aria-checked={chipActivo === "manana"}
              onClick={() => fijarFecha(manana)}>Mañana</button>
          )}
          {permiteOtroDia && (
            <button type="button" className="chip" role="radio" aria-checked={chipActivo === "otro"}
              onClick={abrirSelectorFecha}>
              📅 {chipActivo === "otro" ? fmtFechaCorta(fecha) : "Otro día"}
            </button>
          )}
          <input ref={fileFecha} type="date" lang="es-CO" min={fechaMin} value={fecha}
            onChange={(e) => e.target.value && fijarFecha(e.target.value)}
            style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />
        </div>
        <p className="tiempo-hint">
          {modo === "urgente"
            ? "Solo permisos urgentes: la salida debe ser dentro de las próximas 24 horas. Los futuros los solicita el propio colaborador."
            : modo === "futuro"
            ? "Permiso a futuro (más de 24 horas). Lo aprobará la Dirección General."
            : "Puedes generar el permiso para cualquier fecha."}
        </p>
      </div>

      <div className="campo">
        <label className="label">Hora de salida</label>
        <SelectorHora valor={salidaEff} min={salidaMinLimite} max={SALIDA_MAX} conAmPm
          etiqueta="Hora de salida" onChange={setSalidaMin} />
      </div>

      <div className="campo">
        <label className="label">Duración</label>
        <SelectorHora valor={durEff} min={DUR_MIN} max={durMax} conAmPm={false}
          etiqueta="Duración" onChange={setDuracionMin} />
      </div>

      <div className="resumen-regreso" style={{ marginBottom: 16 }}>
        <span>Regresa a las</span>
        <span className="v">{fmt12(regresoStr)}</span>
      </div>

      <div className="campo">
        <label className="label" htmlFor="cc-obs">Observaciones · opcional</label>
        <textarea id="cc-obs" placeholder="Motivo del permiso."
          value={obs} onChange={(e) => setObs(e.target.value)} />
      </div>

      <div className="campo">
        <label className="label">Documento soporte{" "}
          <span className={`req ${exigeSoporte ? "on" : ""}`}>· {exigeSoporte ? "obligatorio" : "opcional"}</span>
        </label>
        <div className={`soltar${exigeSoporte ? " soltar-oblig" : ""}`} onClick={() => fileRef.current?.click()}>
          <span>📷</span><b>{archivo ? archivo.name : "Toca para adjuntar la foto"}</b>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
      </div>

      <p className={`err ${errForm ? "on" : ""}`}>{errForm}</p>
      <div className="barra-fija">
        <button className="btn btn-xl" disabled={pending} onClick={crear}>
          {pending ? "Generando…"
            : modo === "futuro" ? "Enviar a Dirección General"
            : confirmoSinSoporte && !archivo ? "Crear sin soporte por ahora"
            : "Generar permiso aprobado"}
        </button>
        {empleadoInicial ? (
          <button className="btn btn-out btn-md" onClick={onDone}>Cancelar</button>
        ) : (
          <button className="btn btn-out btn-md" onClick={() => { setEmpleado(null); setPaso("cedula"); }}>
            Cambiar colaborador
          </button>
        )}
      </div>
    </div>
  );
}

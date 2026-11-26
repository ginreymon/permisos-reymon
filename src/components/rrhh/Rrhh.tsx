"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { iniciarSesion, cerrarSesion, verSoporte } from "@/app/actions/rrhh";
import { fmtDuracion } from "@/lib/colaborador/formato";
import type { EstadoSolicitud } from "@/lib/supabase/database.types";
import type { EstadoRRHH, RrhhVista } from "@/lib/rrhh/vista";

const ESTADO_TXT: Partial<Record<EstadoSolicitud, string>> = {
  pendiente: "Pendiente", aprobado: "Aprobado", en_curso: "En curso",
  cerrado: "Cerrado", rechazado: "Rechazado",
};
const ESTADO_CLS: Record<EstadoSolicitud, string> = {
  pendiente: "b-pen", aprobado: "b-ok", en_curso: "b-info",
  cerrado: "b-neu", rechazado: "b-no",
};
const DESC_CLS: Record<string, string> = {
  no_descontable: "b-ok", descontable: "b-no", parcial: "b-pen", por_definir: "b-neu",
};
const DESC_TXT: Record<string, string> = {
  no_descontable: "No descontable", descontable: "Descontable", parcial: "Parcial", por_definir: "Por definir",
};

// Íconos pequeños (heredan color con currentColor).
const svg = { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  style: { verticalAlign: "-2px", marginRight: 4 } };
const IcoClip = () => (<svg {...svg}><path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49" /></svg>);
const IcoReloj = () => (<svg {...svg}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
const IcoAlerta = () => (<svg {...svg}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>);

function hoyBogota(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}
function inicioMes(): string {
  return hoyBogota().slice(0, 8) + "01";
}
function fmtVence(min: number): string {
  if (min >= 60) { const h = Math.round(min / 60); return `Vence en ${h} h`; }
  return `Vence en ${Math.max(0, min)} min`;
}

interface AreaAgg { nombre: string; n: number; min: number; gente: Record<string, { n: number; min: number }>; valor: number }

export default function Rrhh({ estado }: { estado: EstadoRRHH | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // Login
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [errLogin, setErrLogin] = useState("");

  // Filtros
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(""); // sin tope: incluye permisos futuros
  const [area, setArea] = useState("");
  const [estadoF, setEstadoF] = useState("");
  const [descF, setDescF] = useState("");
  const [sopF, setSopF] = useState("");
  const [alertaF, setAlertaF] = useState("");

  // Gráfica
  const [modoGraf, setModoGraf] = useState<"cantidad" | "tiempo">("cantidad");
  const [hover, setHover] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);

  function entrar() {
    if (!correo.trim() || !clave) return setErrLogin("Escribe tu correo y contraseña.");
    setErrLogin("");
    const fd = new FormData();
    fd.set("correo", correo); fd.set("clave", clave);
    start(async () => {
      const r = await iniciarSesion(fd);
      if (!r.ok) return setErrLogin(r.error);
      setClave("");
      router.refresh();
    });
  }
  function salir() {
    start(async () => { await cerrarSesion(); router.refresh(); });
  }
  function abrirSoporte(id: number) {
    start(async () => {
      const r = await verSoporte(id);
      if (r.ok) window.open(r.url, "_blank", "noopener");
    });
  }

  const permisos = estado?.permisos ?? [];

  const lista = useMemo(() => permisos.filter((p) =>
    (!desde || p.fecha >= desde) && (!hasta || p.fecha <= hasta) &&
    (!area || p.area === area) && (!estadoF || p.estado === estadoF) &&
    (!descF || p.descuentoTipo === descF) && (!sopF || p.soporteTipo === sopF) &&
    (!alertaF ||
      (alertaF === "identidad" && p.alertaRRHH) ||
      (alertaF === "sin_regreso" && p.sinRegreso) ||
      (alertaF === "por_vencer" && p.soporteTipo === "pendiente")),
  ).sort((a, b) =>
    // Cercano -> lejano: por fecha, luego hora de salida autorizada.
    a.fecha !== b.fecha ? a.fecha.localeCompare(b.fecha) : a.autorizado.localeCompare(b.autorizado),
  ), [permisos, desde, hasta, area, estadoF, descF, sopF, alertaF]);

  const nPendientes = useMemo(
    () => permisos.filter((p) => p.soporteTipo === "pendiente").length, [permisos]);

  const chart = useMemo<AreaAgg[]>(() => {
    const acc: Record<string, AreaAgg> = {};
    for (const p of lista) {
      if (p.estado !== "aprobado" && p.estado !== "cerrado") continue;
      const a = (acc[p.area] ??= { nombre: p.area, n: 0, min: 0, gente: {}, valor: 0 });
      a.n++; a.min += p.realMin;
      const g = (a.gente[p.nombre] ??= { n: 0, min: 0 });
      g.n++; g.min += p.realMin;
    }
    return Object.values(acc)
      .map((a) => ({ ...a, valor: modoGraf === "cantidad" ? a.n : a.min }))
      .sort((x, y) => y.valor - x.valor);
  }, [lista, modoGraf]);

  function exportar() {
    const filas = lista.map((p) => ({
      cedula: p.documento, nombre: p.nombre, tipo: p.tipoNombre, area: p.area, duracion: p.duracion,
      minutos_descontables: p.descuentoMin ?? "",
      razon_descuento: p.descuentoTipo === "no_aplica" ? "" : (p.descuentoRazon || DESC_TXT[p.descuentoTipo] || ""),
    }));
    const ws = XLSX.utils.json_to_sheet(filas, {
      header: ["cedula", "nombre", "tipo", "area", "duracion", "minutos_descontables", "razon_descuento"],
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Permisos");
    XLSX.writeFile(wb, `permisos-nomina-${desde}_a_${hasta}.xlsx`);
    setToast(`Exportados ${filas.length} permisos con minutos y razón de descuento.`);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(""), 2800);
  }

  // ── LOGIN ──
  if (!estado) {
    return (
      <>
        <div className="header"><span className="titulo">Permisos</span></div>
        <main>
          <div className="card" style={{ maxWidth: 420, margin: "24px auto", width: "100%" }}>
            <div className="card-h">
              <span className="ico">🔒</span>
              <div><h3>Talento Humano</h3><p>Ingresa con tu correo corporativo.</p></div>
            </div>
            <div className="campo">
              <label className="label" htmlFor="correo">Correo corporativo</label>
              <input id="correo" type="email" autoComplete="username" placeholder="talento.humano@empresa.com"
                value={correo} onChange={(e) => setCorreo(e.target.value)} />
            </div>
            <div className="campo">
              <label className="label" htmlFor="clave">Contraseña</label>
              <input id="clave" type="password" autoComplete="current-password"
                value={clave} onChange={(e) => setClave(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && entrar()} />
            </div>
            <p className={`err ${errLogin ? "on" : ""}`}>{errLogin}</p>
            <button className="btn btn-xl" disabled={pending} onClick={entrar}>
              {pending ? "Entrando…" : "Entrar"}
            </button>
          </div>
        </main>
      </>
    );
  }

  const tope = Math.max(1, ...chart.map((f) => f.valor));
  const sync = estado.ultimaSync
    ? new Date(estado.ultimaSync).toLocaleString("es-CO", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota",
      })
    : "sin datos";

  function CeldaSoporte({ p }: { p: RrhhVista }) {
    switch (p.soporteTipo) {
      case "no_requiere": return <span style={{ color: "var(--slate-400)" }}>—</span>;
      case "adjunto":
        return (
          <button className="lnk" style={{ color: "var(--blue-900)" }} onClick={() => abrirSoporte(p.id)}>
            <IcoClip />Ver
          </button>
        );
      case "pendiente":
        return <span style={{ color: "var(--amber-700)", fontWeight: 700 }}><IcoReloj />{fmtVence(p.venceEnMin ?? 0)}</span>;
      case "no_entregado":
        return <span style={{ color: "var(--red-700)", fontWeight: 700 }}><IcoAlerta />No entregado</span>;
      default: return <span style={{ color: "var(--slate-400)" }}>—</span>;
    }
  }

  function CeldaDescuento({ p }: { p: RrhhVista }) {
    if (p.descuentoTipo === "no_aplica") return <span style={{ color: "var(--slate-400)" }}>—</span>;
    const detalle =
      p.descuentoTipo === "descontable" ? `${fmtDuracion(p.minutos)} · ${p.descuentoRazon}`
      : p.descuentoTipo === "parcial" ? null // dos líneas abajo
      : p.descuentoTipo === "por_definir" ? "según soporte"
      : null;
    return (
      <>
        <span className={`badge ${DESC_CLS[p.descuentoTipo]}`}><i />{DESC_TXT[p.descuentoTipo]}</span>
        {p.descuentoTipo === "parcial" ? (
          <>
            <span className="sub">Descuenta {fmtDuracion(p.descuentoMin ?? 0)} de {fmtDuracion(p.descuentoTotal ?? p.minutos)}</span>
            <span className="sub">cupo del mes agotado</span>
          </>
        ) : detalle ? <span className="sub">{detalle}</span> : null}
      </>
    );
  }

  return (
    <>
      <div className="header">
        <span className="titulo">Permisos</span>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {nPendientes > 0 && (
            <button className="pill" style={{ display: "inline-flex", cursor: "pointer" }}
              onClick={() => setSopF("pendiente")}>{nPendientes} soporte(s) pendiente(s)</button>
          )}
          <span className="der">Última sincronización con el ERP<br />{sync} · {estado.empleadosActivos} empleados activos</span>
          <button className="btn btn-out" disabled={pending} onClick={salir}>Salir</button>
        </div>
      </div>

      <main>
        {/* GRÁFICA */}
        <div className="card" style={{ position: "relative" }}>
          <div className="graf-h">
            <h3>Permisos por área</h3>
            <span className="toggle">
              <button aria-pressed={modoGraf === "cantidad"} onClick={() => setModoGraf("cantidad")}>Cantidad</button>
              <button aria-pressed={modoGraf === "tiempo"} onClick={() => setModoGraf("tiempo")}>Tiempo real</button>
            </span>
          </div>
          <div id="barras">
            {chart.length === 0 ? <p className="sin">Sin datos para graficar.</p>
              : chart.map((f, i) => (
                <div key={f.nombre} className="bfila"
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <span className="bet">{f.nombre}</span>
                  <span className="bpista"><span className="bbar" style={{ width: `${Math.max(3, (f.valor / tope) * 100)}%` }} /></span>
                  <span className="bval mono">{modoGraf === "cantidad" ? f.valor : fmtDuracion(f.valor)}</span>
                </div>
              ))}
          </div>
          {hover !== null && chart[hover] && (
            <div className="globo" style={{ display: "block", top: 60 + hover * 40, left: 160 }}>
              <b>{chart[hover].nombre}</b>
              {Object.entries(chart[hover].gente)
                .sort((a, b) => (modoGraf === "cantidad" ? b[1].n - a[1].n : b[1].min - a[1].min))
                .map(([nom, dd]) => (
                  <span key={nom} className="lin">
                    <span>{nom}</span>
                    <span className="mono">{modoGraf === "cantidad" ? `${dd.n} ${dd.n === 1 ? "permiso" : "permisos"}` : fmtDuracion(dd.min)}</span>
                  </span>
                ))}
            </div>
          )}
        </div>

        {/* FILTROS */}
        <div className="card">
          <div className="filtros">
            <div><label className="label" htmlFor="f-desde">Desde</label>
              <input type="date" id="f-desde" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
            <div><label className="label" htmlFor="f-hasta">Hasta</label>
              <input type="date" id="f-hasta" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
            <div className="crece"><label className="label" htmlFor="f-area">Área</label>
              <select id="f-area" value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="">Todas</option>
                {estado.areas.map((a) => <option key={a} value={a}>{a}</option>)}
              </select></div>
            <div><label className="label" htmlFor="f-estado">Estado</label>
              <select id="f-estado" value={estadoF} onChange={(e) => setEstadoF(e.target.value)}>
                <option value="">Todos</option>
                <option value="pendiente">Pendiente</option>
                <option value="aprobado">Aprobado</option>
                <option value="en_curso">En curso</option>
                <option value="cerrado">Cerrado</option>
                <option value="rechazado">Rechazado</option>
              </select></div>
            <div><label className="label" htmlFor="f-desc">Descuento</label>
              <select id="f-desc" value={descF} onChange={(e) => setDescF(e.target.value)}>
                <option value="">Todos</option>
                <option value="no_descontable">No descontable</option>
                <option value="descontable">Descontable</option>
                <option value="parcial">Parcial</option>
                <option value="por_definir">Por definir</option>
              </select></div>
            <div><label className="label" htmlFor="f-sop">Soporte</label>
              <select id="f-sop" value={sopF} onChange={(e) => setSopF(e.target.value)}>
                <option value="">Todos</option>
                <option value="adjunto">Adjunto</option>
                <option value="pendiente">Pendiente</option>
                <option value="no_entregado">No entregado</option>
                <option value="no_requiere">No requiere</option>
              </select></div>
            <div><label className="label" htmlFor="f-alerta">Alertas</label>
              <select id="f-alerta" value={alertaF} onChange={(e) => setAlertaF(e.target.value)}>
                <option value="">Todas</option>
                <option value="identidad">Revisar identidad</option>
                <option value="sin_regreso">Sin regreso registrado</option>
                <option value="por_vencer">Soporte por vencer</option>
              </select></div>
            <div className="der"><button className="btn" onClick={exportar} disabled={!lista.length}>Exportar a Excel</button></div>
          </div>
        </div>

        {/* TABLA */}
        <div className="tabla">
          <table className="t-rrhh">
            <colgroup>
              <col style={{ width: 56 }} /><col style={{ width: 220 }} /><col style={{ width: 140 }} />
              <col style={{ width: 110 }} /><col style={{ width: 72 }} /><col style={{ width: 120 }} />
              <col style={{ width: 150 }} /><col style={{ width: 96 }} /><col style={{ width: 120 }} />
              <col style={{ width: 150 }} /><col style={{ width: 190 }} />
            </colgroup>
            <thead><tr>
              <th>N.º</th><th className="sticky-col">Colaborador</th><th>Área</th><th>Tipo</th><th>Fecha</th>
              <th>Autorizado</th><th>Real</th><th>Duración</th><th>Estado</th><th>Soporte</th><th>Descuento</th>
            </tr></thead>
            <tbody>
              {lista.length === 0 ? (
                <tr><td colSpan={11} className="sin">Sin información registrada.</td></tr>
              ) : lista.map((p) => (
                <tr key={p.id}>
                  <td className="mono b">{p.id}</td>
                  <td className="sticky-col">
                    <span className="nom">{p.nombre}</span>
                    <span className="sub mono">{p.documento}</span>
                    {p.alertaRRHH && (
                      <span className="alerta-id"><IcoAlerta />Revisar identidad</span>
                    )}
                  </td>
                  <td>{p.area}</td>
                  <td>{p.tipoNombre}</td>
                  <td className="mono nowrap">{p.fechaCorta}</td>
                  <td className="mono nowrap">{p.autorizado}</td>
                  <td className={`mono nowrap ${p.sinRegreso ? "alerta" : "tenue"}`}>{p.real}</td>
                  <td className="mono b nowrap">{p.duracion}</td>
                  <td><span className={`badge ${ESTADO_CLS[p.estado]}`}><i />{ESTADO_TXT[p.estado] ?? p.estado}</span></td>
                  <td className="nowrap"><CeldaSoporte p={p} /></td>
                  <td><CeldaDescuento p={p} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      <div className={`toast ${toast ? "ver" : ""}`}>{toast}</div>
    </>
  );
}

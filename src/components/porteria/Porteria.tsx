"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SelectorHora from "@/components/ui/SelectorHora";
import MisPermisosPorteria from "@/components/porteria/MisPermisosPorteria";
import {
  iniciarSesion, cerrarSesion, registrarSalida, registrarRegreso, deshacer,
} from "@/app/actions/porteria";
import { minutosAHHMM } from "@/lib/colaborador/hora";
import { iniciales, minutosDia, type AccionPorteria, type PortVista } from "@/lib/porteria/vista";
import { soloDigitos } from "@/lib/colaborador/identidad";
import type { TipoCatalogo } from "@/lib/colaborador/tipos";

interface Ultimo {
  solicitudId: number; accion: AccionPorteria; hora: string; nombre: string;
}

export default function Porteria({ estado, tipos }: { estado: PortVista[] | null; tipos: TipoCatalogo[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // Login
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [errLogin, setErrLogin] = useState("");

  // Navegación: registro (tablero/confirmar) o solicitud (el portero pide para sí).
  const [vista, setVista] = useState<"registro" | "misPermisos">("registro");
  const [menu, setMenu] = useState(false);

  // Tablero
  const [lista, setLista] = useState<PortVista[]>(estado ?? []);
  const [q, setQ] = useState("");
  const [paso, setPaso] = useState<"tablero" | "confirmar">("tablero");
  const [sel, setSel] = useState<PortVista | null>(null);
  const [accion, setAccion] = useState<AccionPorteria>("salida");
  const [horaMin, setHoraMin] = useState(12 * 60); // minutos desde medianoche
  const [errDec, setErrDec] = useState("");

  // Deshacer
  const [ultimo, setUltimo] = useState<Ultimo | null>(null);
  const timerUndo = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincroniza el tablero cuando el servidor re-renderiza (p. ej. tras login), sin
  // efecto: patrón oficial "ajustar estado en render" al cambiar la prop del servidor.
  const [estadoPrev, setEstadoPrev] = useState(estado);
  if (estado && estado !== estadoPrev) {
    setEstadoPrev(estado);
    setLista(estado);
  }

  function entrar() {
    if (!correo.trim() || !clave) return setErrLogin("Escribe el usuario y la contraseña.");
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

  function abrir(p: PortVista) {
    const acc: AccionPorteria = p.estado === "aprobado" ? "salida" : "regreso";
    const ref = acc === "salida" ? p.salida : p.regreso;
    setSel(p); setAccion(acc); setHoraMin(minutosDia(ref)); setErrDec("");
    setPaso("confirmar");
  }

  function mostrarUndo(u: Ultimo) {
    setUltimo(u);
    if (timerUndo.current) clearTimeout(timerUndo.current);
    timerUndo.current = setTimeout(() => setUltimo(null), 12000);
  }

  function confirmar() {
    if (!sel) return;
    const hhmm = minutosAHHMM(horaMin);
    const persona = sel, acc = accion;
    start(async () => {
      const r = acc === "salida"
        ? await registrarSalida(persona.id, hhmm)
        : await registrarRegreso(persona.id, hhmm);
      if (!r.ok) return setErrDec(r.error);
      setLista(r.estado);
      mostrarUndo({ solicitudId: persona.id, accion: acc, hora: hhmm, nombre: persona.nombre });
      setPaso("tablero");
    });
  }

  function onDeshacer() {
    if (!ultimo) return;
    const u = ultimo;
    setUltimo(null);
    if (timerUndo.current) clearTimeout(timerUndo.current);
    start(async () => {
      const r = await deshacer(u.solicitudId, u.accion, null);
      if (r.ok) setLista(r.estado);
    });
  }

  // Botón hamburguesa y menú lateral (igual al del coordinador). Elementos, no
  // componentes anidados, para no reiniciar estado en cada render.
  const ham = (
    <button className="ham" aria-label="Abrir menú" onClick={() => setMenu(true)}>
      <span /><span /><span />
    </button>
  );
  const drawer = menu && (
    <div className="drawer-ov" onClick={() => setMenu(false)}>
      <aside className="nav" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Menú">
        <div className="drawer-h">
          <span className="titulo">Menú</span>
          <button className="drawer-x" aria-label="Cerrar" onClick={() => setMenu(false)}>✕</button>
        </div>
        <div className="nav-body">
          <button className={`nav-item ${vista === "misPermisos" ? "on" : ""}`}
            onClick={() => { setVista("misPermisos"); setMenu(false); }}>
            <span className="nav-ico">📝</span>
            <span><b>Solicitud</b><small>Generar un permiso para ti</small></span>
          </button>
          <button className={`nav-item ${vista === "registro" ? "on" : ""}`}
            onClick={() => { setVista("registro"); setPaso("tablero"); setMenu(false); }}>
            <span className="nav-ico">🛡️</span>
            <span><b>Registro</b><small>Salidas y regresos del turno</small></span>
          </button>
        </div>
        <div style={{ marginTop: "auto", padding: 12 }}>
          <button className="btn btn-out btn-xl" disabled={pending} onClick={salir}>
            Cerrar sesión
          </button>
        </div>
      </aside>
    </div>
  );

  // ── LOGIN ──
  if (!estado) {
    return (
      <>
        <div className="header"><span className="titulo">Portería</span></div>
        <div className="marco">
          <section className="paso on">
            <div className="card">
              <div className="card-h">
                <span className="ico">🛡️</span>
                <div><h3>Vigilancia</h3><p>La sesión queda abierta durante el turno.</p></div>
              </div>
              <div className="campo">
                <label className="label" htmlFor="correo">Usuario</label>
                <input id="correo" type="email" autoComplete="username" placeholder="porteria@empresa.com"
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
          </section>
        </div>
      </>
    );
  }

  // ── SOLICITUD (el portero genera su propio permiso; la cuenta ya lo identifica) ──
  // Regla de 24 h como el colaborador; el permiso del PORTERO lo aprueba la Dirección General.
  if (vista === "misPermisos") {
    return (
      <>
        <div className="header">
          <div className="header-l">{ham}<span className="titulo">Solicitud</span></div>
          <span className="der">Portería</span>
        </div>
        {drawer}
        <div className="marco">
          <section className="paso on">
            <MisPermisosPorteria tipos={tipos} onDone={() => setVista("registro")} />
          </section>
        </div>
      </>
    );
  }

  // ── CONFIRMAR ──
  if (paso === "confirmar" && sel) {
    return (
      <>
        <div className="header">
          <div className="header-l">{ham}<span className="titulo">Portería</span></div>
          <span className="der">Turno actual</span>
        </div>
        {drawer}
        <div className="marco">
          <section className="paso on">
            <div className="card">
              <p className="label">{accion === "salida" ? "Registrar salida" : "Registrar regreso"}</p>
              <p className="conf-nom">{sel.nombre}</p>
              <p className="conf-ced mono">C.C. {sel.documento}</p>

              <div className="dato"><span>Área</span><span className="v">{sel.area}</span></div>
              <div className="dato">
                <span>{accion === "salida" ? "Permiso autorizado" : "Salió a las"}</span>
                <span className="v mono">{accion === "salida" ? `${sel.salida} a ${sel.regreso}` : sel.salioA ?? "—"}</span>
              </div>

              <p className="label" style={{ margin: "20px 0 0" }}>
                {accion === "salida" ? "Hora de salida" : "Hora de regreso"}
              </p>
              <SelectorHora valor={horaMin} min={0} max={1439} conAmPm
                etiqueta={accion === "salida" ? "Hora de salida" : "Hora de regreso"} onChange={setHoraMin} />

              <p className={`err ${errDec ? "on" : ""}`}>{errDec}</p>
              <button className={`btn btn-xl ${accion === "salida" ? "btn-ok" : ""}`}
                disabled={pending} onClick={confirmar} style={{ marginTop: 16 }}>
                {pending ? "Guardando…" : accion === "salida" ? "Confirmar salida" : "Confirmar regreso"}
              </button>
              <button className="btn btn-out btn-xl" style={{ marginTop: 10 }}
                onClick={() => setPaso("tablero")}>Cancelar</button>
            </div>
          </section>
        </div>
      </>
    );
  }

  // ── TABLERO ──
  // Búsqueda solo por cédula.
  const filtrar = (arr: PortVista[]) => {
    const t = soloDigitos(q);
    if (!t) return arr;
    return arr.filter((p) => p.documento.includes(t));
  };
  const porSalir = filtrar(lista.filter((p) => p.estado === "aprobado"));
  const fuera = filtrar(lista.filter((p) => p.estado === "en_curso"));
  const hayQ = !!soloDigitos(q);

  function Ficha({ p }: { p: PortVista }) {
    const esFuera = p.estado === "en_curso";
    return (
      <div className={`card ficha ${p.tarde ? "tarde" : esFuera ? "fuera" : ""}`}>
        <div className="per">
          <span className="ini mono">{iniciales(p.nombre)}</span>
          <div>
            <p className="per-nom">{p.nombre}</p>
            <p className="per-ced mono">C.C. {p.documento}</p>
            <p className="per-area">{p.area}</p>
          </div>
          {!p.esHoy && (
            <span className="badge b-info mono" style={{ marginLeft: "auto" }}><i />{p.fechaCorta}</span>
          )}
        </div>
        <div className="horas">
          {esFuera ? (
            <>
              <div><span className="label">Salió</span><span className="v mono">{p.salioA ?? "—"}</span></div>
              <div><span className="label">Debe regresar</span><span className="v mono">{p.regreso}</span></div>
            </>
          ) : (
            <>
              <div><span className="label">Salida</span><span className="v mono">{p.salida}</span></div>
              <div><span className="label">Regreso</span><span className="v mono">{p.regreso}</span></div>
            </>
          )}
        </div>
        {p.tarde && <span className="badge b-pen" style={{ marginTop: 12 }}><i />Pasado de la hora</span>}
        <button className={`btn btn-xl ${esFuera ? "" : "btn-ok"}`} style={{ marginTop: 14 }}
          disabled={pending} onClick={() => abrir(p)}>
          {esFuera ? "Registrar regreso" : "Registrar salida"}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="header">
        <div className="header-l">{ham}<span className="titulo">Portería</span></div>
        <span className="der">Turno actual</span>
      </div>
      {drawer}
      <div className="marco">
        <div className="buscador">
          <input type="search" inputMode="numeric" placeholder="Buscar por cédula"
            autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {ultimo && (
          <div className="hecho">
            <span>{ultimo.accion === "salida" ? "Salida" : "Regreso"} de {ultimo.nombre.split(/\s+/)[0]} ·{" "}
              <b className="mono">{ultimo.hora}</b></span>
            <button onClick={onDeshacer} disabled={pending}>Deshacer</button>
          </div>
        )}

        <div className="secc"><span className="label">Autorizados para salir</span><span className="n">{porSalir.length}</span></div>
        <div>
          {porSalir.length ? porSalir.map((p) => <Ficha key={p.id} p={p} />)
            : <p className="vacio">{hayQ ? "Nadie con esa cédula tiene permiso para salir." : "Nadie pendiente de salir."}</p>}
        </div>

        <div className="secc"><span className="label">Fuera de la empresa</span><span className="n">{fuera.length}</span></div>
        <div>
          {fuera.length ? fuera.map((p) => <Ficha key={p.id} p={p} />)
            : <p className="vacio">{hayQ ? "Sin coincidencias." : "Todos han regresado."}</p>}
        </div>
      </div>
    </>
  );
}

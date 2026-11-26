"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ingresar } from "@/app/actions/auth";

// Landing unificado: un solo enlace principal. El staff ingresa con correo/contraseña
// y se enruta a su bandeja; el colaborador pasa a solicitar su permiso con la cédula.
export default function Ingreso() {
  const router = useRouter();
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [errLogin, setErrLogin] = useState("");
  const [pending, start] = useTransition();

  function entrar() {
    if (!correo.trim() || !clave) return setErrLogin("Escribe tu correo y contraseña.");
    setErrLogin("");
    const fd = new FormData();
    fd.set("correo", correo);
    fd.set("clave", clave);
    start(async () => {
      const r = await ingresar(fd);
      if (!r.ok) return setErrLogin(r.error);
      setClave("");
      router.push(r.destino);
    });
  }

  return (
    <>
      <div className="header"><span className="titulo">Permisos · REYMON</span></div>
      <div className="marco">
        <section className="paso on">
          <div className="card">
            <div className="card-h">
              <span className="ico">🔒</span>
              <div><h3>Ingreso</h3><p>Coordinador, portería o RRHH. Usa el correo del cargo.</p></div>
            </div>
            <div className="campo">
              <label className="label" htmlFor="correo">Correo corporativo</label>
              <input id="correo" type="email" autoComplete="username" placeholder="cargo@empresa.com"
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

          <div className="card">
            <div className="card-h">
              <span className="ico">📝</span>
              <div><h3>¿Eres colaborador?</h3><p>Solicita tu permiso con tu cédula, sin cuenta.</p></div>
            </div>
            <Link className="btn btn-out btn-xl" href="/solicitar" style={{ textDecoration: "none" }}>
              Solicitar permiso
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

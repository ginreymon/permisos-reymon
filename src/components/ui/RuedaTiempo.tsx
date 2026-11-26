"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

// Rueda de selección con scroll-snap (portada del prototipo permisos-porteria.html).
// Reutilizable: duración y hora de salida del colaborador, y hora en portería.

const ALTO = 46; // px por ítem

export interface ColumnaRueda {
  id: string;
  valores: string[];
  ancho?: number; // px
  clase?: string; // e.g. "ap" para fuente más chica
  ariaLabel: string;
}

export default function RuedaTiempo({
  columnas,
  valor,
  onChange,
  altura = 184, // 4 ítems visibles
}: {
  columnas: ColumnaRueda[];
  valor: string[]; // valor seleccionado por columna
  onChange: (valores: string[]) => void;
  altura?: number;
}) {
  const pad = (altura - ALTO) / 2;
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const timers = useRef<(ReturnType<typeof setTimeout> | null)[]>([]);
  const [indices, setIndices] = useState<number[]>(() =>
    columnas.map((c, i) => Math.max(0, c.valores.indexOf(valor[i]))),
  );

  // La posición solo se puede fijar con el nodo ya visible (igual que en portería).
  useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => {
      columnas.forEach((c, i) => {
        const el = refs.current[i];
        if (el) el.scrollTop = Math.max(0, c.valores.indexOf(valor[i])) * ALTO;
      });
    });
    return () => cancelAnimationFrame(raf);
    // solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emitir = useCallback(
    (idxs: number[]) => onChange(columnas.map((c, i) => c.valores[idxs[i]] ?? c.valores[0])),
    [columnas, onChange],
  );

  const asentar = useCallback(
    (col: number) => {
      const el = refs.current[col];
      if (!el) return;
      const max = columnas[col].valores.length - 1;
      const i = Math.min(max, Math.max(0, Math.round(el.scrollTop / ALTO)));
      setIndices((prev) => {
        if (prev[col] === i) return prev;
        const next = [...prev];
        next[col] = i;
        emitir(next);
        return next;
      });
    },
    [columnas, emitir],
  );

  function onScroll(col: number) {
    const t = timers.current[col];
    if (t) clearTimeout(t);
    timers.current[col] = setTimeout(() => asentar(col), 60);
  }

  function onKey(col: number, e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const el = refs.current[col];
    if (!el) return;
    const max = columnas[col].valores.length - 1;
    const i = Math.min(max, Math.max(0, indices[col] + (e.key === "ArrowDown" ? 1 : -1)));
    el.scrollTo({ top: i * ALTO, behavior: "smooth" });
    setIndices((prev) => {
      const n = [...prev];
      n[col] = i;
      emitir(n);
      return n;
    });
  }

  return (
    <div className="rueda" style={{ height: altura }}>
      <div className="banda" style={{ top: pad }} />
      {columnas.map((c, col) => (
        <div
          key={c.id}
          className={`col${c.clase ? " " + c.clase : ""}`}
          role="listbox"
          aria-label={c.ariaLabel}
          tabIndex={0}
          ref={(el) => {
            refs.current[col] = el;
          }}
          style={{ width: c.ancho, padding: `${pad}px 0` }}
          onScroll={() => onScroll(col)}
          onKeyDown={(e) => onKey(col, e)}
        >
          {c.valores.map((v, j) => (
            <div key={v} className={`it mono${j === indices[col] ? " sel" : ""}`} role="option" aria-selected={j === indices[col]}>
              {v}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

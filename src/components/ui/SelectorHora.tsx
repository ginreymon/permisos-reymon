"use client";

import { useState } from "react";
import { minutosAHHMM, desde24 } from "@/lib/colaborador/hora";

// Selector de tiempo estilo "ENTER TIME": cajas digitables de Hora y Minuto.
// conAmPm=true  -> hora de reloj 1..12 + toggle AM/PM (el valor es minutos desde medianoche).
// conAmPm=false -> duración: Horas 0..N + Minutos, sin AM/PM (el valor es la duración en minutos).
// El valor se maneja siempre en minutos; sin efectos ni setState en effect (patrón draft).

export default function SelectorHora({
  valor, min, max, conAmPm, etiqueta, onChange,
}: {
  valor: number;
  min: number;
  max: number;
  conAmPm: boolean;
  etiqueta: string;
  onChange: (v: number) => void;
}) {
  // Partes derivadas del valor actual.
  const partes = conAmPm
    ? desde24(minutosAHHMM(valor)) // { h12, mm, ap }
    : { h12: Math.floor(valor / 60), mm: valor % 60, ap: "AM" as const };
  const hMin = conAmPm ? 1 : 0;
  const hMax = conAmPm ? 12 : Math.floor(max / 60);

  const [draftH, setDraftH] = useState<string | null>(null);
  const [draftM, setDraftM] = useState<string | null>(null);

  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  function minutosDe(h: number, mm: number, ap: "AM" | "PM"): number {
    if (!conAmPm) return h * 60 + mm;
    let hh = h % 12;
    if (ap === "PM") hh += 12;
    return hh * 60 + mm;
  }
  function emit(h: number, mm: number, ap: "AM" | "PM") {
    onChange(clamp(minutosDe(h, mm, ap)));
  }
  function commitHora(raw: string) {
    const n = parseInt(raw.replace(/\D/g, ""), 10);
    if (Number.isNaN(n)) return;
    emit(Math.max(hMin, Math.min(hMax, n)), partes.mm, partes.ap);
  }
  function commitMin(raw: string) {
    const n = parseInt(raw.replace(/\D/g, ""), 10);
    if (Number.isNaN(n)) return;
    emit(partes.h12, Math.max(0, Math.min(59, n)), partes.ap);
  }
  function setAp(ap: "AM" | "PM") {
    if (!conAmPm || ap === partes.ap) return;
    // Incorpora cualquier valor a medio teclear (draft) para no perderlo al cambiar AM/PM.
    const hRaw = draftH != null ? parseInt(draftH.replace(/\D/g, ""), 10) : NaN;
    const mRaw = draftM != null ? parseInt(draftM.replace(/\D/g, ""), 10) : NaN;
    const h = Number.isNaN(hRaw) ? partes.h12 : Math.max(hMin, Math.min(hMax, hRaw));
    const mm = Number.isNaN(mRaw) ? partes.mm : Math.max(0, Math.min(59, mRaw));
    setDraftH(null);
    setDraftM(null);
    emit(h, mm, ap);
  }

  const hDisp = draftH ?? String(partes.h12);
  const mDisp = draftM ?? String(partes.mm).padStart(2, "0");

  return (
    <div className="selhora" role="group" aria-label={etiqueta}>
      <div className="selhora-campo">
        <input className="selhora-box mono" inputMode="numeric" maxLength={2} autoComplete="off"
          aria-label={conAmPm ? "Hora" : "Horas"} value={hDisp}
          onFocus={() => setDraftH(String(partes.h12))}
          onChange={(e) => setDraftH(e.target.value)}
          onBlur={(e) => { commitHora(e.target.value); setDraftH(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        <span className="selhora-lbl">{conAmPm ? "Hora" : "Horas"}</span>
      </div>

      <span className="selhora-sep" aria-hidden>:</span>

      <div className="selhora-campo">
        <input className="selhora-box mono" inputMode="numeric" maxLength={2} autoComplete="off"
          aria-label={conAmPm ? "Minuto" : "Minutos"} value={mDisp}
          onFocus={() => setDraftM(String(partes.mm))}
          onChange={(e) => setDraftM(e.target.value)}
          onBlur={(e) => { commitMin(e.target.value); setDraftM(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        <span className="selhora-lbl">{conAmPm ? "Minuto" : "Minutos"}</span>
      </div>

      {conAmPm && (
        <div className="selhora-ampm" role="group" aria-label="AM o PM">
          <button type="button" className={`selhora-ap ${partes.ap === "AM" ? "on" : ""}`}
            aria-pressed={partes.ap === "AM"}
            onMouseDown={(e) => e.preventDefault()} onClick={() => setAp("AM")}>AM</button>
          <button type="button" className={`selhora-ap ${partes.ap === "PM" ? "on" : ""}`}
            aria-pressed={partes.ap === "PM"}
            onMouseDown={(e) => e.preventDefault()} onClick={() => setAp("PM")}>PM</button>
        </div>
      )}
    </div>
  );
}

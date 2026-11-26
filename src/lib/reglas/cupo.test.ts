import { describe, it, expect } from "vitest";
import { usadoEnMes, cupoDelMes, type SolicitudCupo } from "./cupo";

// Cupo por ciclo de nómina (25 -> 24). El ciclo '2026-09' va del 25-ago al 24-sep.
const previas: SolicitudCupo[] = [
  { id: 1, tipo: "PM", fecha: "2026-08-25", estado: "cerrado", min_cubierto: 60 },   // ciclo 2026-09 (día 25 ago)
  { id: 2, tipo: "PM", fecha: "2026-09-20", estado: "aprobado", min_cubierto: 60 },   // ciclo 2026-09
  { id: 3, tipo: "PM", fecha: "2026-09-24", estado: "pendiente", min_cubierto: 30 },  // ciclo 2026-09 (borde)
  { id: 4, tipo: "PM", fecha: "2026-09-25", estado: "cerrado", min_cubierto: 90 },    // ciclo 2026-10 (otro ciclo)
  { id: 5, tipo: "PM", fecha: "2026-09-10", estado: "rechazado", min_cubierto: 90 },  // no cuenta (rechazado)
  { id: 6, tipo: "PA", fecha: "2026-09-15", estado: "aprobado", min_cubierto: 60 },   // otro tipo
];

describe("usadoEnMes (ciclo de nómina 25->24)", () => {
  it("preview cuenta pendiente+aprobado+cerrado del tipo y ciclo", () => {
    expect(usadoEnMes(previas, "PM", "2026-09", "preview")).toBe(150); // 60+60+30
  });

  it("definitivo ignora los pendientes", () => {
    expect(usadoEnMes(previas, "PM", "2026-09", "definitivo")).toBe(120); // 60+60
  });

  it("el día 25 cae en el ciclo siguiente, no en el actual", () => {
    expect(usadoEnMes(previas, "PM", "2026-09", "preview")).toBe(150);   // id 4 (día 25) fuera
    expect(usadoEnMes(previas, "PM", "2026-10", "preview")).toBe(90);    // id 4 aquí
  });

  it("ignora rechazados y otros tipos", () => {
    expect(usadoEnMes(previas, "PA", "2026-09", "preview")).toBe(60);
  });

  it("excluye una solicitud por id (recálculo al aprobar la propia)", () => {
    expect(usadoEnMes(previas, "PM", "2026-09", "definitivo", 2)).toBe(60);
  });
});

describe("cupoDelMes (ciclo de nómina)", () => {
  it("reparte un pedido nuevo según lo ya usado (médico, tope 240)", () => {
    // preview usado = 150 => restante 90; pide 120 => cubierto 90, personal 30
    const c = cupoDelMes(120, 240, previas, "PM", "2026-09-14", "preview");
    expect(c).toEqual({ tope: 240, usado: 150, restante: 90, cubierto: 90, personal: 30 });
  });

  it("personal (sin tope): todo personal, sin importar previas", () => {
    const c = cupoDelMes(120, null, previas, "PP", "2026-09-14", "preview");
    expect(c).toEqual({ tope: null, usado: 0, restante: null, cubierto: 0, personal: 120 });
  });
});

import { describe, it, expect } from "vitest";
import { clasificar, type EntradaClasificacion } from "./clasificacion";

const base: EntradaClasificacion = {
  estado: "aprobado",
  tipoEsPersonal: false,
  exigeSoporte: true,
  tieneSoporte: true,
  plazoVencido: false,
  minutos: 120,
  minCubierto: 120,
  minPersonal: 0,
};

describe("clasificar (RRHH)", () => {
  it("estados que no son aprobado/cerrado => No aplica", () => {
    for (const estado of ["pendiente", "rechazado", "en_curso"] as const) {
      expect(clasificar({ ...base, estado }).codigo).toBe("no_aplica");
    }
  });

  it("Personal => Descontable por el total", () => {
    const c = clasificar({ ...base, tipoEsPersonal: true, exigeSoporte: false });
    expect(c).toMatchObject({ codigo: "descontable", minDescontables: 120 });
  });

  it("exige soporte, no lo tiene, plazo abierto => Soporte pendiente (indeterminado)", () => {
    const c = clasificar({ ...base, tieneSoporte: false, plazoVencido: false });
    expect(c).toMatchObject({ codigo: "soporte_pendiente", minDescontables: null });
  });

  it("exige soporte, no lo tiene, plazo vencido => descontable total", () => {
    const c = clasificar({ ...base, tieneSoporte: false, plazoVencido: true });
    expect(c).toMatchObject({ codigo: "sin_soporte", minDescontables: 120 });
  });

  it("todo cubierto por cupo => No descontable", () => {
    const c = clasificar({ ...base, minCubierto: 120, minPersonal: 0 });
    expect(c).toMatchObject({ codigo: "no_descontable", minDescontables: 0 });
  });

  it("nada cubierto => Descontable · cupo agotado (total)", () => {
    const c = clasificar({ ...base, minCubierto: 0, minPersonal: 120 });
    expect(c).toMatchObject({ codigo: "cupo_agotado", minDescontables: 120 });
  });

  it("parte y parte => repartido, descuenta solo el excedente", () => {
    const c = clasificar({ ...base, minCubierto: 90, minPersonal: 30 });
    expect(c).toMatchObject({ codigo: "repartido", minDescontables: 30 });
    expect(c.etiqueta).toBe("Descontable 30 (repartido)");
  });

  it("cerrado también clasifica", () => {
    expect(clasificar({ ...base, estado: "cerrado" }).codigo).toBe("no_descontable");
  });
});

import { describe, it, expect } from "vitest";
import { mesDe, cicloNomina, instanteBogota, regresoAutorizado, sumarMinutos } from "./tiempo";

describe("tiempo (America/Bogota, UTC-5)", () => {
  it("mesDe extrae 'YYYY-MM'", () => {
    expect(mesDe("2026-09-14")).toBe("2026-09");
  });

  it("cicloNomina: día 24 cierra este mes, día 25 cierra el siguiente", () => {
    expect(cicloNomina("2026-09-24")).toBe("2026-09"); // dentro del ciclo que cierra en sep
    expect(cicloNomina("2026-09-25")).toBe("2026-10"); // arranca el ciclo que cierra en oct
    expect(cicloNomina("2026-08-28")).toBe("2026-09"); // 25-ago..24-sep -> ciclo sep
    expect(cicloNomina("2026-09-01")).toBe("2026-09");
  });

  it("cicloNomina: fin de año cruza a enero", () => {
    expect(cicloNomina("2026-12-25")).toBe("2027-01");
    expect(cicloNomina("2026-12-24")).toBe("2026-12");
  });

  it("instanteBogota interpreta la hora local como UTC-5", () => {
    // 08:00 Bogotá = 13:00 UTC
    expect(instanteBogota("2026-09-14", "08:00").toISOString()).toBe("2026-09-14T13:00:00.000Z");
  });

  it("acepta hora con segundos ('HH:MM:SS')", () => {
    expect(instanteBogota("2026-09-14", "08:00:00").toISOString()).toBe("2026-09-14T13:00:00.000Z");
  });

  it("regresoAutorizado = salida + duración", () => {
    // 08:00 Bogotá + 90 min = 09:30 Bogotá = 14:30 UTC
    expect(regresoAutorizado("2026-09-14", "08:00", 90).toISOString()).toBe("2026-09-14T14:30:00.000Z");
  });

  it("sumarMinutos cruza medianoche correctamente", () => {
    const d = sumarMinutos(instanteBogota("2026-09-14", "23:30"), 60);
    expect(d.toISOString()).toBe("2026-09-15T05:30:00.000Z"); // 00:30 Bogotá del día 15
  });
});

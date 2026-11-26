import { describe, it, expect } from "vitest";
import { vencimientoSoporte, soporteVencido } from "./soporte";
import { instanteBogota } from "./tiempo";

describe("soporte (plazo 24 h)", () => {
  it("vence 24 h después del regreso autorizado cuando no hubo regreso real", () => {
    // salida 08:00 + 60 min => regreso autorizado 09:00 Bogotá (14:00 UTC); +24h
    const v = vencimientoSoporte(null, "2026-09-14", "08:00", 60);
    expect(v.toISOString()).toBe("2026-09-15T14:00:00.000Z");
  });

  it("usa el regreso real cuando existe, no el autorizado", () => {
    const real = instanteBogota("2026-09-14", "10:30"); // regresó tarde
    const v = vencimientoSoporte(real, "2026-09-14", "08:00", 60);
    expect(v.toISOString()).toBe("2026-09-15T15:30:00.000Z"); // 10:30 Bogotá +24h
  });

  it("no está vencido antes del plazo", () => {
    const ahora = instanteBogota("2026-09-15", "08:00");
    expect(soporteVencido(ahora, null, "2026-09-14", "08:00", 60)).toBe(false);
  });

  it("está vencido después del plazo", () => {
    const ahora = instanteBogota("2026-09-15", "10:00"); // pasadas las 09:00 del día 15
    expect(soporteVencido(ahora, null, "2026-09-14", "08:00", 60)).toBe(true);
  });
});

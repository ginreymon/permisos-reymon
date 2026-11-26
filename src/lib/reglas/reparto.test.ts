import { describe, it, expect } from "vitest";
import { calcularReparto } from "./reparto";

describe("calcularReparto", () => {
  it("todo cubierto cuando el cupo alcanza", () => {
    expect(calcularReparto(120, 240, 0)).toEqual({ cubierto: 120, personal: 0, restante: 240 });
  });

  it("nada cubierto cuando el cupo está agotado", () => {
    expect(calcularReparto(60, 240, 240)).toEqual({ cubierto: 0, personal: 60, restante: 0 });
  });

  it("parte y parte (ejemplo del prototipo: quedan 2 h, pide 3 h)", () => {
    // tope 240, usado 120 => restante 120 (2 h); pide 180 (3 h)
    expect(calcularReparto(180, 240, 120)).toEqual({ cubierto: 120, personal: 60, restante: 120 });
  });

  it("tipo sin tope (Personal): todo es personal", () => {
    expect(calcularReparto(90, null, 0)).toEqual({ cubierto: 0, personal: 90, restante: null });
  });

  it("restante nunca es negativo aunque el usado supere el tope", () => {
    expect(calcularReparto(30, 240, 300)).toEqual({ cubierto: 0, personal: 30, restante: 0 });
  });

  it("cubierto + personal siempre es igual al pedido", () => {
    for (const [pedido, tope, usado] of [[45, 240, 200], [240, 360, 0], [15, 240, 235]] as const) {
      const r = calcularReparto(pedido, tope, usado);
      expect(r.cubierto + r.personal).toBe(pedido);
    }
  });

  it("rechaza pedido inválido", () => {
    expect(() => calcularReparto(-1, 240, 0)).toThrow(RangeError);
    expect(() => calcularReparto(10.5, 240, 0)).toThrow(RangeError);
  });
});

// Reparto de un permiso entre la parte cubierta por el cupo del mes y el excedente,
// que se registra como permiso personal (§4).
//   restante = max(0, tope − usado)
//   cubierto = min(pedido, restante)
//   personal = pedido − cubierto
// tope === null  => tipo sin tope (Personal): todo es personal, nada consume cupo.

export interface Reparto {
  cubierto: number;
  personal: number;
  restante: number | null; // null = sin tope
}

export function calcularReparto(pedido: number, tope: number | null, usado: number): Reparto {
  if (!Number.isInteger(pedido) || pedido < 0) {
    throw new RangeError("pedido debe ser un entero >= 0");
  }
  if (tope === null) {
    return { cubierto: 0, personal: pedido, restante: null };
  }
  if (usado < 0) throw new RangeError("usado debe ser >= 0");
  const restante = Math.max(0, tope - usado);
  const cubierto = Math.min(pedido, restante);
  return { cubierto, personal: pedido - cubierto, restante };
}

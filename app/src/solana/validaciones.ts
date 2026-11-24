import { LIMITES } from "./config";

const bytes = (s: string) => new TextEncoder().encode(s).length;

export function texto(valor: string, etiqueta: string, maxBytes: number): string {
  const limpio = valor.trim();
  if (!limpio) throw new Error(`${etiqueta} es obligatorio.`);
  if (bytes(limpio) > maxBytes) throw new Error(`${etiqueta} admite hasta ${maxBytes} bytes UTF-8.`);
  return limpio;
}

export const negocioValido = (v: string) => texto(v, "El nombre del negocio", LIMITES.negocio);
export const nombreValido = (v: string) => texto(v, "El nombre del cliente", LIMITES.nombre);
export const skuValido = (v: string) => texto(v, "El SKU", LIMITES.sku);
export const descripcionValida = (v: string) => texto(v, "La descripción", LIMITES.descripcion);

export function cantidadValida(v: number): number {
  if (!Number.isInteger(v) || v < 1 || v > 65535) throw new Error("La cantidad debe ser un entero entre 1 y 65535.");
  return v;
}

/** Convierte un monto en moneda (ej. "12.50") a centavos enteros (1250). */
export function aCentavos(entrada: string): bigint {
  const limpio = entrada.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) throw new Error("El monto debe ser un número positivo con hasta 2 decimales.");
  const [ent, dec = ""] = limpio.split(".");
  const centavos = BigInt(ent) * 100n + BigInt(dec.padEnd(2, "0"));
  if (centavos <= 0n) throw new Error("El monto debe ser mayor a cero.");
  if (centavos > 0xffffffffffffffffn) throw new Error("El monto es demasiado grande.");
  return centavos;
}

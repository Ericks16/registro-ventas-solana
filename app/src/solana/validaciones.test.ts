import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import { aCentavos, cantidadValida, skuValido, nombreValido } from "./validaciones";
import { formatoMonto } from "./formato";
import { pdaCliente, pdaRegistro, pdaVenta, u16ABytes } from "./pdas";

describe("validaciones", () => {
  it("convierte montos a centavos", () => {
    expect(aCentavos("12.5")).toBe(1250n);
    expect(aCentavos("12,50")).toBe(1250n);
    expect(aCentavos("7")).toBe(700n);
    expect(() => aCentavos("0")).toThrow();
    expect(() => aCentavos("-3")).toThrow();
    expect(() => aCentavos("1.234")).toThrow();
    expect(() => aCentavos("abc")).toThrow();
  });
  it("valida textos por bytes UTF-8", () => {
    expect(nombreValido("  Ana ")).toBe("Ana");
    expect(() => nombreValido("   ")).toThrow();
    expect(() => skuValido("x".repeat(17))).toThrow();
    expect(() => nombreValido("ñ".repeat(16))).toThrow(); // 32 bytes > 30
  });
  it("valida cantidades", () => {
    expect(cantidadValida(3)).toBe(3);
    expect(() => cantidadValida(0)).toThrow();
    expect(() => cantidadValida(1.5)).toThrow();
  });
  it("formatea montos", () => {
    expect(formatoMonto(123456n)).toBe("$1,234.56");
    expect(formatoMonto(5n)).toBe("$0.05");
  });
});

describe("pdas", () => {
  const programa = Keypair.generate().publicKey;
  const owner = Keypair.generate().publicKey;
  it("u16 es little endian", () => {
    expect([...u16ABytes(1)]).toEqual([1, 0]);
    expect([...u16ABytes(258)]).toEqual([2, 1]);
  });
  it("deriva la jerarquía de forma determinista y distinta", () => {
    const r = pdaRegistro(programa, "Tienda", owner);
    expect(r.equals(pdaRegistro(programa, "Tienda", owner))).toBe(true);
    expect(r.equals(pdaRegistro(programa, "Otra", owner))).toBe(false);
    const c1 = pdaCliente(programa, r, 1);
    const c2 = pdaCliente(programa, r, 2);
    expect(c1.equals(c2)).toBe(false);
    expect(pdaVenta(programa, c1, "A").equals(pdaVenta(programa, c2, "A"))).toBe(false);
  });
});

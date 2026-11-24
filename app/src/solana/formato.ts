/** Centavos (u64) -> "$12.50" */
export function formatoMonto(centavos: bigint | number | { toString(): string }): string {
  const c = BigInt(centavos.toString());
  const ent = c / 100n;
  const dec = (c % 100n).toString().padStart(2, "0");
  return `$${ent.toLocaleString("en-US")}.${dec}`;
}

export const corto = (s: string, n = 4) => (s.length <= n * 2 + 1 ? s : `${s.slice(0, n)}…${s.slice(-n)}`);

export const formatoFecha = (unix: number | { toNumber(): number }) =>
  new Date((typeof unix === "number" ? unix : unix.toNumber()) * 1000).toLocaleString("es");

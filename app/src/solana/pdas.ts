import { PublicKey } from "@solana/web3.js";

const enc = new TextEncoder();

/** u16 little endian: igual que `id.to_le_bytes()` en Rust. */
export function u16ABytes(valor: number): Uint8Array {
  if (!Number.isInteger(valor) || valor < 0 || valor > 0xffff) throw new Error("u16 fuera de rango");
  return new Uint8Array([valor & 0xff, valor >> 8]);
}

/** registro <- ["registro", nombre_negocio, owner] */
export function pdaRegistro(programId: PublicKey, nombreNegocio: string, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [enc.encode("registro"), enc.encode(nombreNegocio), owner.toBytes()],
    programId
  )[0];
}

/** cliente <- ["cliente", registro, id_cliente] */
export function pdaCliente(programId: PublicKey, registro: PublicKey, idCliente: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [enc.encode("cliente"), registro.toBytes(), u16ABytes(idCliente)],
    programId
  )[0];
}

/** venta <- ["venta", cliente, sku] */
export function pdaVenta(programId: PublicKey, cliente: PublicKey, sku: string): PublicKey {
  return PublicKey.findProgramAddressSync([enc.encode("venta"), cliente.toBytes(), enc.encode(sku)], programId)[0];
}

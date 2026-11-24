import { AnchorProvider, BN, Program, type Idl, type Wallet } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "../idl/registro_ventas.json";
import { PROGRAM_ID } from "./config";
import { pdaCliente, pdaRegistro, pdaVenta } from "./pdas";

export const programId = new PublicKey(PROGRAM_ID);

export function crearPrograma(connection: Connection, wallet: Pick<Wallet, "publicKey" | "signTransaction" | "signAllTransactions">): Program<Idl> {
  const provider = new AnchorProvider(connection, wallet as Wallet, { commitment: "confirmed" });
  return new Program({ ...(idl as Idl), address: PROGRAM_ID }, provider);
}

// ----------------------------- Modelos de lectura -----------------------------
export interface RegistroData {
  address: PublicKey;
  owner: PublicKey;
  nombreNegocio: string;
  clientes: PublicKey[];
  idCounter: number;
  totalVentas: bigint;
  montoTotal: bigint;
  creadoEn: number;
}
export interface ClienteData {
  address: PublicKey;
  idCliente: number;
  nombre: string;
  compras: number;
  totalGastado: bigint;
  historial: PublicKey[];
}
export interface VentaData {
  address: PublicKey;
  sku: string;
  descripcion: string;
  cantidad: number;
  monto: bigint;
  fecha: number;
}

export interface Snapshot {
  registro: RegistroData;
  clientes: ClienteData[];
  ventas: Map<string, VentaData[]>; // clave: address del cliente
}

const big = (n: BN) => BigInt(n.toString());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cuentas = (p: Program<Idl>) => p.account as any;

/** Lee el registro y toda su jerarquia (clientes y ventas). Devuelve null si no existe. */
export async function cargarSnapshot(programa: Program<Idl>, nombre: string, owner: PublicKey): Promise<Snapshot | null> {
  const dir = pdaRegistro(programId, nombre, owner);
  const r = await cuentas(programa).registro.fetchNullable(dir);
  if (!r) return null;

  const registro: RegistroData = {
    address: dir,
    owner: r.owner,
    nombreNegocio: r.nombreNegocio,
    clientes: r.clientes,
    idCounter: r.idCounter,
    totalVentas: big(r.totalVentas),
    montoTotal: big(r.montoTotal),
    creadoEn: r.creadoEn.toNumber(),
  };

  const rawClientes: (any | null)[] = registro.clientes.length
    ? await cuentas(programa).cliente.fetchMultiple(registro.clientes)
    : [];
  const clientes: ClienteData[] = [];
  rawClientes.forEach((c, i) => {
    if (!c) return;
    clientes.push({
      address: registro.clientes[i],
      idCliente: c.idCliente,
      nombre: c.nombre,
      compras: c.compras,
      totalGastado: big(c.totalGastado),
      historial: c.historial,
    });
  });
  clientes.sort((a, b) => a.idCliente - b.idCliente);

  const ventas = new Map<string, VentaData[]>();
  const todas = clientes.flatMap((c) => c.historial.map((v) => ({ cliente: c.address.toBase58(), dir: v })));
  const rawVentas: (any | null)[] = todas.length ? await cuentas(programa).venta.fetchMultiple(todas.map((t) => t.dir)) : [];
  rawVentas.forEach((v, i) => {
    if (!v) return;
    const lista = ventas.get(todas[i].cliente) ?? [];
    lista.push({
      address: todas[i].dir,
      sku: v.sku,
      descripcion: v.descripcion,
      cantidad: v.cantidad,
      monto: big(v.monto),
      fecha: v.fecha.toNumber(),
    });
    ventas.set(todas[i].cliente, lista);
  });
  return { registro, clientes, ventas };
}

// -------------------------------- Acciones --------------------------------
// Cada accion devuelve la firma de la transaccion confirmada.
export const acciones = {
  crearRegistro: (p: Program<Idl>, owner: PublicKey, nombre: string) =>
    p.methods
      .crearRegistro(nombre)
      .accountsStrict({ owner, registro: pdaRegistro(programId, nombre, owner), systemProgram: SystemProgram.programId })
      .rpc(),

  cerrarRegistro: (p: Program<Idl>, owner: PublicKey, registro: PublicKey) =>
    p.methods.cerrarRegistro().accountsStrict({ owner, registro }).rpc(),

  crearCliente: (p: Program<Idl>, owner: PublicKey, registro: PublicKey, siguienteId: number, nombre: string) =>
    p.methods
      .crearCliente(nombre)
      .accountsStrict({
        owner,
        registro,
        cliente: pdaCliente(programId, registro, siguienteId),
        systemProgram: SystemProgram.programId,
      })
      .rpc(),

  actualizarCliente: (p: Program<Idl>, owner: PublicKey, registro: PublicKey, id: number, nombre: string) =>
    p.methods
      .actualizarCliente(id, nombre)
      .accountsStrict({ owner, registro, cliente: pdaCliente(programId, registro, id) })
      .rpc(),

  eliminarCliente: (p: Program<Idl>, owner: PublicKey, registro: PublicKey, id: number) =>
    p.methods
      .eliminarCliente(id)
      .accountsStrict({ owner, registro, cliente: pdaCliente(programId, registro, id) })
      .rpc(),

  registrarVenta: (
    p: Program<Idl>,
    owner: PublicKey,
    registro: PublicKey,
    id: number,
    sku: string,
    descripcion: string,
    cantidad: number,
    monto: bigint
  ) => {
    const cliente = pdaCliente(programId, registro, id);
    return p.methods
      .registrarVenta(id, sku, descripcion, cantidad, new BN(monto.toString()))
      .accountsStrict({ owner, registro, cliente, venta: pdaVenta(programId, cliente, sku), systemProgram: SystemProgram.programId })
      .rpc();
  },

  cambiarMonto: (p: Program<Idl>, owner: PublicKey, registro: PublicKey, id: number, sku: string, nuevo: bigint) => {
    const cliente = pdaCliente(programId, registro, id);
    return p.methods
      .cambiarMonto(id, sku, new BN(nuevo.toString()))
      .accountsStrict({ owner, registro, cliente, venta: pdaVenta(programId, cliente, sku) })
      .rpc();
  },

  hacerDevolucion: (p: Program<Idl>, owner: PublicKey, registro: PublicKey, id: number, sku: string) => {
    const cliente = pdaCliente(programId, registro, id);
    return p.methods
      .hacerDevolucion(id, sku)
      .accountsStrict({ owner, registro, cliente, venta: pdaVenta(programId, cliente, sku) })
      .rpc();
  },
};

/** Traduce errores de Anchor/RPC a un mensaje legible. */
export function mensajeError(e: unknown): string {
  const err = e as { error?: { errorMessage?: string }; message?: string; logs?: string[] };
  if (err?.error?.errorMessage) return err.error.errorMessage;
  const m = err?.message ?? String(e);
  if (/User rejected/i.test(m)) return "Operación cancelada en la wallet.";
  if (/already in use/i.test(m)) return "Esa cuenta ya existe (nombre o SKU repetido).";
  if (/insufficient (funds|lamports)|0x1\b/i.test(m)) return "Saldo insuficiente para pagar el rent y las comisiones.";
  return m;
}

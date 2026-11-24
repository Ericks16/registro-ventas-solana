import idl from "../idl/registro_ventas.json";

export type Red = "localnet" | "devnet";

export const REDES: Record<Red, { nombre: string; rpc: string }> = {
  localnet: { nombre: "Localnet", rpc: "http://127.0.0.1:8899" },
  devnet: { nombre: "Devnet", rpc: "https://api.devnet.solana.com" },
};

/** Program ID: variable de entorno VITE_PROGRAM_ID o la direccion del IDL. */
export const PROGRAM_ID: string = import.meta.env.VITE_PROGRAM_ID || (idl as { address: string }).address;

export const LIMITES = {
  negocio: 30,
  nombre: 30,
  sku: 16,
  descripcion: 60,
  clientes: 50,
  historial: 50,
} as const;

export const urlExplorador = (tipo: "tx" | "address", valor: string, red: Red) =>
  `https://explorer.solana.com/${tipo}/${valor}` +
  (red === "devnet" ? "?cluster=devnet" : `?cluster=custom&customUrl=${encodeURIComponent(REDES.localnet.rpc)}`);

// Genera un IDL de referencia (formato Anchor 0.30+) a partir de una descripcion compacta
// del programa. Sirve para que la app funcione ANTES de compilar. Despues de `anchor build`
// usa `npm run sync:idl` para reemplazarlo por el IDL real (target/idl/registro_ventas.json).
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const PROGRAM_ID = process.argv[2] ?? "Gm2e8xz2xqS8XkFKXPpaWnohXHufuJ4oTgohtt8tqQGb";
const disc = (ns, name) => [...createHash("sha256").update(`${ns}:${name}`).digest().subarray(0, 8)];
const acc = (name, o = {}) => ({ name, ...(o.w ? { writable: true } : {}), ...(o.s ? { signer: true } : {}),
  ...(o.addr ? { address: o.addr } : {}) });
const SYS = acc("system_program", { addr: "11111111111111111111111111111111" });
const arg = (name, type) => ({ name, type });

const ixs = [
  ["crear_registro", [acc("owner", { w: 1, s: 1 }), acc("registro", { w: 1 }), SYS], [arg("nombre_negocio", "string")]],
  ["cerrar_registro", [acc("owner", { w: 1, s: 1 }), acc("registro", { w: 1 })], []],
  ["crear_cliente", [acc("owner", { w: 1, s: 1 }), acc("registro", { w: 1 }), acc("cliente", { w: 1 }), SYS], [arg("nombre", "string")]],
  ["actualizar_cliente", [acc("owner", { s: 1 }), acc("registro"), acc("cliente", { w: 1 })], [arg("id_cliente", "u16"), arg("nuevo_nombre", "string")]],
  ["eliminar_cliente", [acc("owner", { w: 1, s: 1 }), acc("registro", { w: 1 }), acc("cliente", { w: 1 })], [arg("id_cliente", "u16")]],
  ["registrar_venta", [acc("owner", { w: 1, s: 1 }), acc("registro", { w: 1 }), acc("cliente", { w: 1 }), acc("venta", { w: 1 }), SYS],
    [arg("id_cliente", "u16"), arg("sku", "string"), arg("descripcion", "string"), arg("cantidad", "u16"), arg("monto", "u64")]],
  ["cambiar_monto", [acc("owner", { s: 1 }), acc("registro", { w: 1 }), acc("cliente", { w: 1 }), acc("venta", { w: 1 })],
    [arg("id_cliente", "u16"), arg("sku", "string"), arg("nuevo_monto", "u64")]],
  ["hacer_devolucion", [acc("owner", { w: 1, s: 1 }), acc("registro", { w: 1 }), acc("cliente", { w: 1 }), acc("venta", { w: 1 })],
    [arg("id_cliente", "u16"), arg("sku", "string")]],
];

const fields = (...f) => ({ kind: "struct", fields: f.map(([name, type]) => ({ name, type })) });
const vecPk = { vec: "pubkey" };
const types = [
  ["Registro", fields(["owner", "pubkey"], ["nombre_negocio", "string"], ["clientes", vecPk], ["id_counter", "u16"],
    ["total_ventas", "u64"], ["monto_total", "u64"], ["creado_en", "i64"], ["bump", "u8"])],
  ["Cliente", fields(["registro", "pubkey"], ["id_cliente", "u16"], ["nombre", "string"], ["compras", "u16"],
    ["total_gastado", "u64"], ["historial", vecPk], ["bump", "u8"])],
  ["Venta", fields(["cliente", "pubkey"], ["sku", "string"], ["descripcion", "string"], ["cantidad", "u16"],
    ["monto", "u64"], ["fecha", "i64"], ["bump", "u8"])],
  ["RegistroCreado", fields(["registro", "pubkey"], ["owner", "pubkey"])],
  ["VentaRegistrada", fields(["registro", "pubkey"], ["cliente", "pubkey"], ["sku", "string"], ["monto", "u64"])],
  ["VentaDevuelta", fields(["registro", "pubkey"], ["cliente", "pubkey"], ["sku", "string"], ["monto", "u64"])],
];
const errores = [
  ["NoOwner", "No eres el owner del registro"],
  ["VentaNoEnHistorial", "La venta no está en el historial del cliente"],
  ["TextoVacio", "El texto no puede estar vacío"],
  ["TextoLargo", "El texto excede la longitud máxima permitida"],
  ["MontoInvalido", "El monto debe ser mayor a cero"],
  ["CantidadInvalida", "La cantidad debe ser mayor a cero"],
  ["LimiteClientes", "El registro alcanzó el máximo de clientes"],
  ["LimiteHistorial", "El cliente alcanzó el máximo de ventas activas"],
  ["ClienteConVentas", "El cliente aún tiene ventas activas"],
  ["RegistroConClientes", "El registro aún tiene clientes"],
  ["Desbordamiento", "Desbordamiento aritmético"],
];

const idl = {
  address: PROGRAM_ID,
  metadata: { name: "registro_ventas", version: "0.1.0", spec: "0.1.0", description: "Registro de ventas con PDAs" },
  instructions: ixs.map(([name, accounts, args]) => ({ name, discriminator: disc("global", name), accounts, args })),
  accounts: ["Registro", "Cliente", "Venta"].map((name) => ({ name, discriminator: disc("account", name) })),
  events: ["RegistroCreado", "VentaRegistrada", "VentaDevuelta"].map((name) => ({ name, discriminator: disc("event", name) })),
  errors: errores.map(([name, msg], i) => ({ code: 6000 + i, name, msg })),
  types: types.map(([name, type]) => ({ name, type })),
};
const out = process.argv[3] ?? "app/src/idl/registro_ventas.json";
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(idl, null, 2) + "\n");
console.log("IDL de referencia escrito en", out);

// Copia el IDL real generado por `anchor build` a la app y actualiza el program ID.
import { copyFileSync, existsSync } from "node:fs";
const src = "target/idl/registro_ventas.json";
if (!existsSync(src)) { console.error("No existe " + src + ". Ejecuta `anchor build` primero."); process.exit(1); }
copyFileSync(src, "app/src/idl/registro_ventas.json");
console.log("IDL sincronizado -> app/src/idl/registro_ventas.json");

# Registro de Ventas en Solana

CRUD completo de un punto de venta **on-chain**: un programa de Solana escrito en Rust con **Anchor** que modela
negocio → clientes → ventas con **PDAs jerárquicas**, más una **app web (React + Vite)** para operarlo desde tu wallet.

Está basado en los proyectos de referencia de WayLearnLatam
([App](https://github.com/WayLearnLatam/Registro-Ventas-Solana-App) y
[PDA / programa](https://github.com/WayLearnLatam/Registro-Ventas-Solana-PDA)), integrando programa, cliente y
frontend en un solo repositorio y ampliándolos (ver [Qué se agregó](#qué-se-agregó-respecto-a-la-referencia)).

> **Estado de verificación.** Compilado con Anchor 0.32.1 (Solana 2.3 / Rust 1.90) y probado: **13/13 tests de Anchor** y **6/6 tests de la app** pasan, y la app compila (typecheck + build).

---

## Datos de la entrega

| Campo | Detalle |
|---|---|
| **Ruta elegida** | Proyecto guiado con una mejora funcional |
| **Versión de partida** | [Registro-Ventas-Solana-PDA](https://github.com/WayLearnLatam/Registro-Ventas-Solana-PDA) (programa) y [Registro-Ventas-Solana-App](https://github.com/WayLearnLatam/Registro-Ventas-Solana-App) (app) |
| **Propósito** | Registrar clientes y ventas de un negocio on-chain, con cuentas relacionadas por PDAs y operaciones protegidas por el owner |
| **Red / Program ID (Devnet)** | `Gm2e8xz2xqS8XkFKXPpaWnohXHufuJ4oTgohtt8tqQGb` ([ver en el explorador](https://explorer.solana.com/address/Gm2e8xz2xqS8XkFKXPpaWnohXHufuJ4oTgohtt8tqQGb?cluster=devnet)) |
| **Transacción de despliegue** | [`3yQHexxy…LFELgN`](https://explorer.solana.com/tx/3yQHexxywzYp1hEaFuQnKFbn5ozRcXNRrPGvk8hLVQBh4BpD9mPTULmRFi7whP5ESKgNwrbJitjzQATHpLFgELgN?cluster=devnet) |

### Aporte propio (qué se añadió o corrigió y cómo se comprueba)

La base es el registro de ventas guiado (registro → cliente → venta, con la baja de cliente). La mejora es una
**contabilidad consistente en la cadena, con validaciones de negocio en Rust**:

1. **Acumulados que se mantienen consistentes.** `Cliente.total_gastado`, `Registro.total_ventas` y
   `Registro.monto_total` se actualizan con aritmética `checked_*` en `registrar_venta`, `cambiar_monto` y
   `hacer_devolucion`. La versión de partida no llevaba totales.
   → Test: *«registra ventas y mantiene los acumulados»*, *«cambia el monto y ajusta los acumulados»*,
   *«hace una devolución y revierte acumulados»*.
2. **Validaciones de negocio en el programa, con su caso de rechazo.** Monto y cantidad deben ser > 0, texto
   no vacío y con longitud máxima, límites de clientes e historial.
   → Tests: *«rechaza monto o cantidad en cero»* (`MontoInvalido`, `CantidadInvalida`) y *«rechaza un nombre de
   negocio vacío»* (`TextoVacio`).
3. **Cierres condicionados por una regla.** `eliminar_cliente` solo si no tiene ventas (`ClienteConVentas`) y
   `cerrar_registro` solo si no quedan clientes (`RegistroConClientes`); ambos devuelven el rent al owner.
   → Tests: *«no elimina un cliente con ventas activas»* y *«cierra el registro solo cuando no hay clientes»*.
4. **Modelo ampliado:** `monto` pasa de `u32` a `u64` en centavos, el SKU admite hasta 16 caracteres, la venta
   guarda `cantidad` y `fecha`, y se guarda el `bump`. Se añadió `actualizar_cliente` y eventos de Anchor.

### Cómo se corresponden con los casos de prueba

| Competencia | Dónde se demuestra |
|---|---|
| Creación de cuentas | `crear_registro`, `crear_cliente`, `registrar_venta` |
| Lectura | La app lee registro, clientes y ventas con `fetch` / `fetchMultiple`; los tests usan `program.account.*.fetch` |
| Modificación | `actualizar_cliente`, `cambiar_monto` |
| Permisos (autoridad) | `has_one = owner`; test *«otro wallet no puede operar sobre el registro»* |
| Pertenencia | Seeds jerárquicas y `bump` en cada contexto; el SKU repetido falla en `init` (*«no permite repetir el mismo SKU»*) |
| Baja / cierre condicionado | `eliminar_cliente`, `hacer_devolucion`, `cerrar_registro` |

### Cómo probarlo (resumen)

```bash
bash scripts/docker-anchor.sh test   # 13 tests del programa (requiere Docker)
cd app && npm install && npm test    # 6 tests de la app
cd app && npm run dev                # app en http://localhost:5173
```

En la app: red **Devnet** → conecta Phantom o Solflare en modo devnet (con SOL de https://faucet.solana.com) →
nombre de negocio → **Crear registro** → añade un cliente → registra una venta → cambia el monto → haz la devolución.

### Evidencias en Devnet

| Operación | Transacción |
|---|---|
| Despliegue del programa | [ver](https://explorer.solana.com/tx/3yQHexxywzYp1hEaFuQnKFbn5ozRcXNRrPGvk8hLVQBh4BpD9mPTULmRFi7whP5ESKgNwrbJitjzQATHpLFgELgN?cluster=devnet) |
| `crear_registro` | _pendiente: pegar enlace_ |
| `crear_cliente` | _pendiente: pegar enlace_ |
| `registrar_venta` | _pendiente: pegar enlace_ |
| `cambiar_monto` | _pendiente: pegar enlace_ |
| `hacer_devolucion` | _pendiente: pegar enlace_ |

Capturas de la app en `docs/evidencias/`.

---

## Contenido

1. [Arquitectura](#arquitectura)
2. [Modelo de datos y PDAs](#modelo-de-datos-y-pdas)
3. [Instrucciones del programa](#instrucciones-del-programa)
4. [Errores y eventos](#errores-y-eventos)
5. [Qué se agregó respecto a la referencia](#qué-se-agregó-respecto-a-la-referencia)
6. [Requisitos](#requisitos)
7. [Compilar, probar y desplegar el programa](#compilar-probar-y-desplegar-el-programa)
8. [Ejecutar la app web](#ejecutar-la-app-web)
9. [Opción rápida: Solana Playground](#opción-rápida-solana-playground)
10. [Estructura del repositorio](#estructura-del-repositorio)
11. [Seguridad](#seguridad)
12. [Solución de problemas](#solución-de-problemas)

---

## Arquitectura

```
┌────────────────────┐   firma / envía tx    ┌──────────────────────────┐
│  App web (React)   │ ───────────────────▶  │ Programa Anchor          │
│  wallet-adapter    │                       │ registro_ventas (Rust)   │
│  @coral-xyz/anchor │ ◀───────────────────  │  · valida seeds y owner  │
└────────────────────┘   lee cuentas (RPC)   │  · mantiene acumulados   │
        ▲                                    └────────────┬─────────────┘
        │ IDL (app/src/idl/registro_ventas.json)          │ PDAs
        └─────────────────────────────────────────────────▼
                                 Registro ─▶ Cliente ─▶ Venta
```

- **Sin backend propio:** la "base de datos" son cuentas de Solana; el frontend lee directamente del RPC.
- **Sin claves de cuentas:** las cuentas de datos son PDAs (no tienen clave privada); solo el programa las modifica.

## Modelo de datos y PDAs

Cada cuenta se deriva de su padre, por lo que la pertenencia queda garantizada **por construcción**: si la dirección
coincide con las seeds, el cliente *es* de ese registro y la venta *es* de ese cliente.

```
registro <- ["registro", nombre_negocio, owner]
cliente  <- ["cliente",  registro,       id_cliente (u16, little endian)]
venta    <- ["venta",    cliente,        sku]
```

| Cuenta     | Campos                                                                                                  |
|------------|----------------------------------------------------------------------------------------------------------|
| `Registro` | `owner`, `nombre_negocio` (≤30), `clientes: Vec<Pubkey>` (≤50), `id_counter`, `total_ventas`, `monto_total`, `creado_en`, `bump` |
| `Cliente`  | `registro`, `id_cliente`, `nombre` (≤30), `compras`, `total_gastado`, `historial: Vec<Pubkey>` (≤50), `bump` |
| `Venta`    | `cliente`, `sku` (≤16), `descripcion` (≤60), `cantidad` (u16), `monto` (u64, **centavos**), `fecha`, `bump` |

Decisiones de diseño:

- **El id del cliente lo asigna el programa** (`id_counter + 1`); el cliente nunca lo envía, así no se puede falsear.
- **El SKU va en las seeds** de la venta: un mismo cliente no puede repetir el mismo producto (el `init` falla).
- **Los montos son `u64` en centavos**, sin decimales flotantes. La app convierte `12.50` ↔ `1250`.
- **Los vectores (`clientes`, `historial`) son un índice de lectura** para el frontend; la validación real la hacen las seeds.
- **Los acumulados** (`total_gastado`, `total_ventas`, `monto_total`) se actualizan con aritmética verificada en cada
  instrucción, así la app muestra métricas sin recorrer todas las ventas.

## Instrucciones del programa

| Instrucción          | Argumentos                                    | Efecto                                                                    |
|----------------------|-----------------------------------------------|---------------------------------------------------------------------------|
| `crear_registro`     | `nombre_negocio`                              | Crea el registro del negocio (owner = firmante).                          |
| `cerrar_registro`    | —                                             | Cierra el registro y devuelve el rent. Solo si no quedan clientes.        |
| `crear_cliente`      | `nombre`                                      | Alta de cliente con id autoincremental.                                   |
| `actualizar_cliente` | `id_cliente`, `nuevo_nombre`                  | Renombra al cliente.                                                      |
| `eliminar_cliente`   | `id_cliente`                                  | Cierra la cuenta del cliente. Solo si no tiene ventas activas.            |
| `registrar_venta`    | `id_cliente`, `sku`, `descripcion`, `cantidad`, `monto` | Crea la venta, la indexa en el historial y suma acumulados.     |
| `cambiar_monto`      | `id_cliente`, `sku`, `nuevo_monto`            | Modifica el monto y reajusta los acumulados.                              |
| `hacer_devolucion`   | `id_cliente`, `sku`                           | Cierra la cuenta de la venta, devuelve el rent y revierte acumulados.     |

Todas exigen que el firmante sea el `owner` del registro (`has_one = owner`).

## Errores y eventos

Errores (`Errores`): `NoOwner`, `VentaNoEnHistorial`, `TextoVacio`, `TextoLargo`, `MontoInvalido`,
`CantidadInvalida`, `LimiteClientes`, `LimiteHistorial`, `ClienteConVentas`, `RegistroConClientes`, `Desbordamiento`.

Eventos emitidos: `RegistroCreado`, `VentaRegistrada`, `VentaDevuelta` (útiles para indexadores).

## Qué se agregó respecto a la referencia

| Referencia                                   | Esta versión                                                                         |
|----------------------------------------------|---------------------------------------------------------------------------------------|
| Solo programa **o** solo app, en repos aparte | Monorepo: programa + tests + app + IDL + scripts                                      |
| `monto: u32`, `sku` de 5 caracteres           | `monto: u64` en centavos, `sku` hasta 16, `cantidad` por venta                        |
| Sin acumulados                                | Totales por cliente y por negocio, siempre consistentes                               |
| Sin borrar clientes ni el registro            | `eliminar_cliente`, `actualizar_cliente`, `cerrar_registro` (recupera el rent)        |
| Sin fecha en la venta                         | `fecha` (Clock on-chain), `bump` guardado, `creado_en`                                |
| Sin validaciones de entrada                   | Texto no vacío/longitud, monto y cantidad > 0, límites de vectores, aritmética `checked` |
| Sin eventos                                   | Eventos Anchor                                                                        |
| `registro` sin validar seeds en cada ix       | Seeds + `bump` validados en todos los contextos                                       |
| Cliente sin tests                             | Suite de Anchor (`tests/`) y tests unitarios de la app (Vitest)                       |
| App de aula con IDL de clase                  | App con selector de red, airdrop, saldo, enlaces al explorador, métricas y errores legibles |

## Requisitos

- **Rust** estable y **Solana CLI** (Agave) — <https://solana.com/docs/intro/installation>
- **Anchor 0.32.1** (`avm install 0.32.1 && avm use 0.32.1`)
- **Node.js ≥ 20** y npm
- Una wallet del navegador (Phantom, Solflare o Backpack) para la app

> En Windows lo más sencillo es **Docker Desktop** (sin instalar Rust ni Solana): `bash scripts/docker-anchor.sh test` compila y corre los tests dentro de la imagen `solanafoundation/anchor:v0.32.1`, y deja IDL, tipos y el `.so` en `target/`. También sirve WSL2. La app web corre nativa.

## Compilar, probar y desplegar el programa

```bash
npm install                  # dependencias de los tests (Node 20+)
anchor keys sync             # genera/actualiza el Program ID en lib.rs y Anchor.toml
anchor build                 # compila y genera target/idl y target/types
anchor test                  # levanta un validador local y corre tests/registro-ventas.ts
```

Desplegar en **devnet**:

```bash
solana config set --url devnet
solana airdrop 2             # (o https://faucet.solana.com)
anchor deploy --provider.cluster devnet
npm run sync:idl             # copia target/idl/registro_ventas.json a la app
```

> El repositorio incluye un `declare_id!` y un IDL de referencia (generado con
> `scripts/generar-idl-referencia.mjs`) para que la app funcione antes de compilar. El keypair del programa
> (`target/deploy/registro_ventas-keypair.json`) **se creó localmente y no se versiona**: si lo pierdes o cambias de
> máquina, ejecuta `anchor keys sync` para generar uno nuevo y vuelve a copiar el IDL.

## Ejecutar la app web

```bash
cd app
npm install
npm run dev                  # http://localhost:5173
```

Scripts: `npm run typecheck`, `npm test` (Vitest), `npm run build`.

Configuración opcional en `app/.env.local`:

```
VITE_PROGRAM_ID=<tu program id>   # por defecto usa la dirección del IDL
```

Uso:

1. Elige la red (**Localnet** o **Devnet**) y conecta tu wallet. Con **Airdrop 1 SOL** fondeas tu cuenta de prueba.
2. Escribe el nombre del negocio → **Abrir**. Si no existe, aparece **Crear registro**.
3. Añade clientes, selecciónalos y registra ventas (SKU, descripción, cantidad, monto).
4. Edita el monto, haz devoluciones, elimina clientes o cierra el registro (recuperas el rent).

Para **localnet**: `solana-test-validator` en otra terminal y `anchor deploy --provider.cluster localnet`.

## Opción rápida: Solana Playground

También puedes probar el programa sin instalar nada en <https://beta.solpg.io/>: crea un proyecto Anchor, pega
[`programs/registro-ventas/src/lib.rs`](programs/registro-ventas/src/lib.rs), conecta a devnet, **Build** y **Deploy**.
Luego copia el IDL generado a `app/src/idl/registro_ventas.json`.

## Estructura del repositorio

```
.
├── Anchor.toml / Cargo.toml        # workspace de Anchor
├── programs/registro-ventas/       # programa Rust (lib.rs)
├── tests/registro-ventas.ts        # tests de integración (Anchor + mocha/chai)
├── scripts/
│   ├── docker-anchor.sh            # build/test del programa en Docker
│   ├── generar-idl-referencia.mjs  # IDL de referencia previo a compilar
│   └── sync-idl.mjs                # copia el IDL real a la app
└── app/                            # frontend Vite + React + TypeScript
    └── src/
        ├── idl/registro_ventas.json
        ├── solana/                 # config, pdas, programa (lecturas/acciones), validaciones, formato (+tests)
        ├── components/             # Clientes, Ventas
        ├── App.tsx / Raiz.tsx      # estado, wallet y conexión
        └── index.css
```

## Seguridad

- Los PDAs se validan con `seeds` + `bump` almacenado en **cada** instrucción; el owner con `has_one`.
- Aritmética con `checked_*`; los cierres (`close = owner`) devuelven el rent al dueño.
- Nunca pongas claves privadas o seed phrases en la app ni en el repositorio; la app solo usa la wallet del navegador.
- Es un proyecto educativo: antes de usarlo con valor real, haz una auditoría y añade tests adicionales.

## Solución de problemas

| Síntoma                                         | Causa / solución                                                                                 |
|-------------------------------------------------|--------------------------------------------------------------------------------------------------|
| `ConstraintSeeds` al llamar una instrucción     | Las seeds del cliente no coinciden. `id_cliente` es **u16 little endian**, no texto ni 1 byte.   |
| `AccountNotInitialized` / registro no aparece   | El nombre del negocio distingue mayúsculas y es por wallet; revisa la red (devnet vs localnet).  |
| «Esa cuenta ya existe»                          | SKU repetido para ese cliente (o negocio ya creado con ese nombre).                              |
| `ClienteConVentas` / `RegistroConClientes`      | Haz primero las devoluciones / elimina los clientes.                                             |
| Airdrop falla en devnet                         | Límite de rate; usa <https://faucet.solana.com>.                                                 |
| La app no encuentra el programa                 | El IDL/Program ID no corresponde al desplegado: `anchor keys sync`, `anchor build`, `npm run sync:idl`. |
| `cargo` dice que una dependencia requiere `edition2024` | La toolchain SBF trae un Cargo antiguo. El repo ya incluye `Cargo.lock` con versiones compatibles y `rust-version` en el crate; no lo borres. |
| `ERR_REQUIRE_ESM` en los tests (uuid) | Ya resuelto con `overrides.uuid` en `package.json` (Node 20). |
| `Test validator does not look started` | Aumenta `[test] startup_wait` en `Anchor.toml` (ya en 60000). |
| `npm install` falla en OneDrive (EPERM)         | Clona el proyecto fuera de una carpeta sincronizada por OneDrive.                                |

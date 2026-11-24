import { useCallback, useEffect, useMemo, useState } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { REDES, PROGRAM_ID, urlExplorador, type Red } from "./solana/config";
import { acciones, cargarSnapshot, crearPrograma, mensajeError, type Snapshot } from "./solana/programa";
import { negocioValido } from "./solana/validaciones";
import { corto, formatoMonto } from "./solana/formato";
import { Clientes } from "./components/Clientes";
import { Ventas } from "./components/Ventas";

interface Aviso {
  tipo: "ok" | "error";
  texto: string;
  firma?: string;
}

export default function App({ red, cambiarRed }: { red: Red; cambiarRed: (r: Red) => void }) {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const programa = useMemo(() => (wallet ? crearPrograma(connection, wallet) : null), [connection, wallet]);

  const [negocio, setNegocio] = useState(() => localStorage.getItem("negocio") ?? "");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [cargado, setCargado] = useState(false); // ya se consulto la cadena para este negocio
  const [saldo, setSaldo] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [seleccion, setSeleccion] = useState<number | null>(null);

  const refrescarSaldo = useCallback(async () => {
    if (!wallet) return setSaldo(null);
    try {
      setSaldo((await connection.getBalance(wallet.publicKey)) / LAMPORTS_PER_SOL);
    } catch {
      setSaldo(null);
    }
  }, [connection, wallet]);

  const cargar = useCallback(
    async (nombre = negocio) => {
      if (!programa || !wallet || !nombre) return;
      try {
        setSnap(await cargarSnapshot(programa, nombre, wallet.publicKey));
        setCargado(true);
      } catch (e) {
        setAviso({ tipo: "error", texto: mensajeError(e) });
      }
    },
    [programa, wallet, negocio]
  );

  // Al cambiar wallet/red: limpiar y recargar.
  useEffect(() => {
    setSnap(null);
    setCargado(false);
    setSeleccion(null);
    refrescarSaldo();
    if (negocio) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programa, red]);

  /** Ejecuta una transaccion, muestra el resultado y refresca datos. */
  async function ejecutar(descripcion: string, fn: () => Promise<string>, tras?: () => void) {
    if (ocupado) return;
    setOcupado(true);
    setAviso(null);
    try {
      const firma = await fn();
      setAviso({ tipo: "ok", texto: descripcion, firma });
      tras?.();
      await Promise.all([cargar(), refrescarSaldo()]);
    } catch (e) {
      setAviso({ tipo: "error", texto: mensajeError(e) });
    } finally {
      setOcupado(false);
    }
  }

  async function abrirONuevo(crear: boolean) {
    try {
      const nombre = negocioValido(negocio);
      setNegocio(nombre);
      localStorage.setItem("negocio", nombre);
      if (crear && programa && wallet) {
        await ejecutar(`Registro «${nombre}» creado`, () => acciones.crearRegistro(programa, wallet.publicKey, nombre));
      } else {
        await cargar(nombre);
      }
    } catch (e) {
      setAviso({ tipo: "error", texto: mensajeError(e) });
    }
  }

  async function airdrop() {
    if (!wallet) return;
    await ejecutar("Airdrop de 1 SOL recibido", async () => {
      const firma = await connection.requestAirdrop(wallet.publicKey, LAMPORTS_PER_SOL);
      const bh = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: firma, ...bh }, "confirmed");
      return firma;
    });
  }

  const cliente = snap?.clientes.find((c) => c.idCliente === seleccion) ?? null;

  return (
    <div className="app">
      <header className="cabecera">
        <div>
          <h1>Registro de Ventas</h1>
          <p className="sub">
            Programa on-chain con PDAs jerárquicas · <code title={PROGRAM_ID}>{corto(PROGRAM_ID, 5)}</code>
          </p>
        </div>
        <div className="acciones-cabecera">
          <select value={red} onChange={(e) => cambiarRed(e.target.value as Red)} aria-label="Red">
            {Object.entries(REDES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.nombre}
              </option>
            ))}
          </select>
          {wallet && (
            <span className="saldo" title="Saldo de la wallet">
              {saldo === null ? "—" : `${saldo.toFixed(3)} SOL`}
            </span>
          )}
          {wallet && (
            <button className="sec" onClick={airdrop} disabled={ocupado} title="Solo devnet/localnet">
              Airdrop 1 SOL
            </button>
          )}
          <WalletMultiButton />
        </div>
      </header>

      {aviso && (
        <div className={`aviso ${aviso.tipo}`} role="status">
          <span>{aviso.texto}</span>
          {aviso.firma && (
            <a href={urlExplorador("tx", aviso.firma, red)} target="_blank" rel="noreferrer">
              Ver transacción ↗
            </a>
          )}
          <button className="x" onClick={() => setAviso(null)} aria-label="Cerrar">
            ×
          </button>
        </div>
      )}

      {!wallet ? (
        <section className="tarjeta vacio">
          <h2>Conecta tu wallet</h2>
          <p>Usa Phantom, Solflare o Backpack en {REDES[red].nombre} para crear y administrar tu registro de ventas.</p>
        </section>
      ) : (
        <>
          <section className="tarjeta">
            <h2>Negocio</h2>
            <form
              className="fila"
              onSubmit={(e) => {
                e.preventDefault();
                abrirONuevo(false);
              }}
            >
              <input
                value={negocio}
                onChange={(e) => {
                  setNegocio(e.target.value);
                  setCargado(false);
                  setSnap(null);
                }}
                placeholder="Nombre del negocio (máx. 30)"
                maxLength={30}
              />
              <button type="submit" disabled={ocupado || !negocio.trim()}>
                Abrir
              </button>
              {cargado && !snap && (
                <button type="button" className="prim" disabled={ocupado} onClick={() => abrirONuevo(true)}>
                  Crear registro
                </button>
              )}
            </form>
            {cargado && !snap && <p className="nota">No existe un registro con ese nombre para esta wallet. Puedes crearlo.</p>}

            {snap && (
              <>
                <div className="metricas">
                  <Metrica etiqueta="Clientes" valor={String(snap.clientes.length)} />
                  <Metrica etiqueta="Ventas activas" valor={snap.registro.totalVentas.toString()} />
                  <Metrica etiqueta="Monto total" valor={formatoMonto(snap.registro.montoTotal)} />
                  <Metrica
                    etiqueta="Registro (PDA)"
                    valor={
                      <a href={urlExplorador("address", snap.registro.address.toBase58(), red)} target="_blank" rel="noreferrer">
                        {corto(snap.registro.address.toBase58())}
                      </a>
                    }
                  />
                </div>
                <div className="fila fin">
                  <button className="sec" onClick={() => cargar()} disabled={ocupado}>
                    Refrescar
                  </button>
                  <button
                    className="peligro"
                    disabled={ocupado || snap.clientes.length > 0}
                    title={snap.clientes.length ? "Elimina primero a todos los clientes" : "Cierra el registro y recupera el rent"}
                    onClick={() => {
                      if (programa && wallet && confirm("¿Cerrar el registro? Se devolverá el rent a tu wallet."))
                        ejecutar("Registro cerrado", () => acciones.cerrarRegistro(programa, wallet.publicKey, snap.registro.address), () => setSnap(null));
                    }}
                  >
                    Cerrar registro
                  </button>
                </div>
              </>
            )}
          </section>

          {snap && programa && wallet && (
            <div className="columnas">
              <Clientes
                snap={snap}
                seleccion={seleccion}
                onSeleccion={setSeleccion}
                ocupado={ocupado}
                crear={(nombre) =>
                  ejecutar(`Cliente «${nombre}» creado`, () =>
                    acciones.crearCliente(programa, wallet.publicKey, snap.registro.address, snap.registro.idCounter + 1, nombre)
                  )
                }
                renombrar={(id, nombre) =>
                  ejecutar("Cliente actualizado", () => acciones.actualizarCliente(programa, wallet.publicKey, snap.registro.address, id, nombre))
                }
                eliminar={(id) =>
                  ejecutar(
                    "Cliente eliminado",
                    () => acciones.eliminarCliente(programa, wallet.publicKey, snap.registro.address, id),
                    () => setSeleccion(null)
                  )
                }
              />
              <Ventas
                cliente={cliente}
                ventas={cliente ? snap.ventas.get(cliente.address.toBase58()) ?? [] : []}
                ocupado={ocupado}
                registrar={(sku, desc, cant, monto) =>
                  ejecutar(`Venta «${sku}» registrada`, () =>
                    acciones.registrarVenta(programa, wallet.publicKey, snap.registro.address, cliente!.idCliente, sku, desc, cant, monto)
                  )
                }
                cambiarMonto={(sku, nuevo) =>
                  ejecutar(`Monto de «${sku}» actualizado`, () =>
                    acciones.cambiarMonto(programa, wallet.publicKey, snap.registro.address, cliente!.idCliente, sku, nuevo)
                  )
                }
                devolver={(sku) =>
                  ejecutar(`Devolución de «${sku}» realizada`, () =>
                    acciones.hacerDevolucion(programa, wallet.publicKey, snap.registro.address, cliente!.idCliente, sku)
                  )
                }
              />
            </div>
          )}
        </>
      )}
      <footer>
        Hecho con Anchor + React · cada acción es una transacción firmada por tu wallet en {REDES[red].nombre}.
      </footer>
    </div>
  );
}

function Metrica({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="metrica">
      <span>{etiqueta}</span>
      <strong>{valor}</strong>
    </div>
  );
}

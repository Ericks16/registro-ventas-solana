import { useState } from "react";
import type { Snapshot } from "../solana/programa";
import { LIMITES } from "../solana/config";
import { formatoMonto } from "../solana/formato";
import { nombreValido } from "../solana/validaciones";

interface Props {
  snap: Snapshot;
  seleccion: number | null;
  onSeleccion: (id: number | null) => void;
  ocupado: boolean;
  crear: (nombre: string) => void;
  renombrar: (id: number, nombre: string) => void;
  eliminar: (id: number) => void;
}

export function Clientes({ snap, seleccion, onSeleccion, ocupado, crear, renombrar, eliminar }: Props) {
  const [nuevo, setNuevo] = useState("");
  const [editando, setEditando] = useState<number | null>(null);
  const [edicion, setEdicion] = useState("");
  const [error, setError] = useState("");

  const intentar = (fn: () => void) => {
    try {
      setError("");
      fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const lleno = snap.clientes.length >= LIMITES.clientes;

  return (
    <section className="tarjeta">
      <h2>
        Clientes <small>{snap.clientes.length}/{LIMITES.clientes}</small>
      </h2>
      <form
        className="fila"
        onSubmit={(e) => {
          e.preventDefault();
          intentar(() => {
            crear(nombreValido(nuevo));
            setNuevo("");
          });
        }}
      >
        <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nombre del cliente" maxLength={LIMITES.nombre} />
        <button className="prim" disabled={ocupado || lleno || !nuevo.trim()}>
          Añadir
        </button>
      </form>
      {error && <p className="error">{error}</p>}

      {snap.clientes.length === 0 ? (
        <p className="nota">Aún no hay clientes.</p>
      ) : (
        <ul className="lista">
          {snap.clientes.map((c) => (
            <li key={c.idCliente} className={seleccion === c.idCliente ? "activo" : ""}>
              {editando === c.idCliente ? (
                <form
                  className="fila"
                  onSubmit={(e) => {
                    e.preventDefault();
                    intentar(() => {
                      renombrar(c.idCliente, nombreValido(edicion));
                      setEditando(null);
                    });
                  }}
                >
                  <input autoFocus value={edicion} onChange={(e) => setEdicion(e.target.value)} maxLength={LIMITES.nombre} />
                  <button disabled={ocupado}>Guardar</button>
                  <button type="button" className="sec" onClick={() => setEditando(null)}>
                    Cancelar
                  </button>
                </form>
              ) : (
                <>
                  <button className="item" onClick={() => onSeleccion(c.idCliente)}>
                    <span>
                      <b>#{c.idCliente}</b> {c.nombre}
                    </span>
                    <span className="meta">
                      {c.compras} compras · {formatoMonto(c.totalGastado)}
                    </span>
                  </button>
                  <div className="mini">
                    <button
                      className="sec"
                      disabled={ocupado}
                      onClick={() => {
                        setEditando(c.idCliente);
                        setEdicion(c.nombre);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      className="peligro"
                      disabled={ocupado || c.compras > 0}
                      title={c.compras > 0 ? "Haz las devoluciones primero" : "Eliminar cliente"}
                      onClick={() => confirm(`¿Eliminar a ${c.nombre}?`) && eliminar(c.idCliente)}
                    >
                      Eliminar
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

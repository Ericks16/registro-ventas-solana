import { useState } from "react";
import type { ClienteData, VentaData } from "../solana/programa";
import { LIMITES } from "../solana/config";
import { formatoFecha, formatoMonto } from "../solana/formato";
import { aCentavos, cantidadValida, descripcionValida, skuValido } from "../solana/validaciones";

interface Props {
  cliente: ClienteData | null;
  ventas: VentaData[];
  ocupado: boolean;
  registrar: (sku: string, descripcion: string, cantidad: number, monto: bigint) => void;
  cambiarMonto: (sku: string, nuevo: bigint) => void;
  devolver: (sku: string) => void;
}

export function Ventas({ cliente, ventas, ocupado, registrar, cambiarMonto, devolver }: Props) {
  const [sku, setSku] = useState("");
  const [desc, setDesc] = useState("");
  const [cant, setCant] = useState("1");
  const [monto, setMonto] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [nuevoMonto, setNuevoMonto] = useState("");
  const [error, setError] = useState("");

  if (!cliente)
    return (
      <section className="tarjeta vacio">
        <h2>Ventas</h2>
        <p className="nota">Selecciona un cliente para ver y registrar sus ventas.</p>
      </section>
    );

  const intentar = (fn: () => void) => {
    try {
      setError("");
      fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const lleno = ventas.length >= LIMITES.historial;
  const ordenadas = [...ventas].sort((a, b) => b.fecha - a.fecha);

  return (
    <section className="tarjeta">
      <h2>
        Ventas de {cliente.nombre} <small>{formatoMonto(cliente.totalGastado)}</small>
      </h2>
      <form
        className="grilla"
        onSubmit={(e) => {
          e.preventDefault();
          intentar(() => {
            registrar(skuValido(sku), descripcionValida(desc), cantidadValida(Number(cant)), aCentavos(monto));
            setSku("");
            setDesc("");
            setCant("1");
            setMonto("");
          });
        }}
      >
        <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" maxLength={LIMITES.sku} />
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descripción" maxLength={LIMITES.descripcion} className="ancho" />
        <input value={cant} onChange={(e) => setCant(e.target.value)} placeholder="Cant." inputMode="numeric" />
        <input value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Monto (ej. 12.50)" inputMode="decimal" />
        <button className="prim" disabled={ocupado || lleno}>
          Registrar venta
        </button>
      </form>
      {error && <p className="error">{error}</p>}

      {ordenadas.length === 0 ? (
        <p className="nota">Este cliente no tiene ventas activas.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Descripción</th>
              <th>Cant.</th>
              <th>Monto</th>
              <th>Fecha</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((v) => (
              <tr key={v.sku}>
                <td>
                  <code>{v.sku}</code>
                </td>
                <td>{v.descripcion}</td>
                <td>{v.cantidad}</td>
                <td>
                  {editando === v.sku ? (
                    <form
                      className="fila"
                      onSubmit={(e) => {
                        e.preventDefault();
                        intentar(() => {
                          cambiarMonto(v.sku, aCentavos(nuevoMonto));
                          setEditando(null);
                        });
                      }}
                    >
                      <input autoFocus value={nuevoMonto} onChange={(e) => setNuevoMonto(e.target.value)} className="corto" />
                      <button disabled={ocupado}>OK</button>
                    </form>
                  ) : (
                    formatoMonto(v.monto)
                  )}
                </td>
                <td className="meta">{formatoFecha(v.fecha)}</td>
                <td className="mini">
                  <button
                    className="sec"
                    disabled={ocupado}
                    onClick={() => {
                      setEditando(v.sku);
                      setNuevoMonto((Number(v.monto) / 100).toFixed(2));
                    }}
                  >
                    Monto
                  </button>
                  <button className="peligro" disabled={ocupado} onClick={() => confirm(`¿Devolver «${v.sku}»?`) && devolver(v.sku)}>
                    Devolver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

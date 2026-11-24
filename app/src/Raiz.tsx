import { useMemo, useState } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { REDES, type Red } from "./solana/config";
import App from "./App";

/** Proveedores de conexion y wallet. Las wallets compatibles con Wallet Standard
 *  (Phantom, Solflare, Backpack...) se detectan solas, sin adaptadores extra. */
export function Raiz() {
  const [red, setRed] = useState<Red>(() => (localStorage.getItem("red") as Red) || "devnet");
  const endpoint = useMemo(() => REDES[red].rpc, [red]);
  const cambiarRed = (r: Red) => {
    localStorage.setItem("red", r);
    setRed(r);
  };
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <App red={red} cambiarRed={cambiarRed} />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

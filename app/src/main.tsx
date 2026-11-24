import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import React from "react";
import ReactDOM from "react-dom/client";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./index.css";
import { Raiz } from "./Raiz";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Raiz />
  </React.StrictMode>
);

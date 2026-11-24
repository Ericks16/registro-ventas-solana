import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import type { RegistroVentas } from "../target/types/registro_ventas";

describe("registro-ventas", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.registroVentas as Program<RegistroVentas>;
  const owner = provider.wallet.publicKey;
  const negocio = "Abarrotes Test";

  const u16 = (n: number) => {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(n);
    return b;
  };
  const [registro] = PublicKey.findProgramAddressSync(
    [Buffer.from("registro"), Buffer.from(negocio), owner.toBuffer()],
    program.programId
  );
  const pdaCliente = (id: number) =>
    PublicKey.findProgramAddressSync([Buffer.from("cliente"), registro.toBuffer(), u16(id)], program.programId)[0];
  const pdaVenta = (cliente: PublicKey, sku: string) =>
    PublicKey.findProgramAddressSync([Buffer.from("venta"), cliente.toBuffer(), Buffer.from(sku)], program.programId)[0];

  const falla = async (p: Promise<unknown>, codigo: string) => {
    try {
      await p;
    } catch (e: any) {
      expect(String(e.error?.errorCode?.code ?? e)).to.include(codigo);
      return;
    }
    expect.fail(`se esperaba el error ${codigo}`);
  };

  it("crea el registro", async () => {
    await program.methods.crearRegistro(negocio).accounts({ owner, registro, systemProgram: SystemProgram.programId } as any).rpc();
    const r = await program.account.registro.fetch(registro);
    expect(r.nombreNegocio).to.equal(negocio);
    expect(r.idCounter).to.equal(0);
    expect(r.owner.toBase58()).to.equal(owner.toBase58());
  });

  it("rechaza un nombre de negocio vacío", async () => {
    const [vacio] = PublicKey.findProgramAddressSync([Buffer.from("registro"), Buffer.from(" "), owner.toBuffer()], program.programId);
    await falla(program.methods.crearRegistro(" ").accounts({ owner, registro: vacio } as any).rpc(), "TextoVacio");
  });

  it("crea clientes con ids autoincrementales", async () => {
    for (const nombre of ["Ana", "Luis"]) {
      const id = (await program.account.registro.fetch(registro)).idCounter + 1;
      await program.methods.crearCliente(nombre).accounts({ owner, registro, cliente: pdaCliente(id) } as any).rpc();
    }
    const r = await program.account.registro.fetch(registro);
    expect(r.idCounter).to.equal(2);
    expect(r.clientes.length).to.equal(2);
    expect((await program.account.cliente.fetch(pdaCliente(2))).nombre).to.equal("Luis");
  });

  it("renombra un cliente", async () => {
    await program.methods.actualizarCliente(1, "Ana María").accounts({ owner, registro, cliente: pdaCliente(1) } as any).rpc();
    expect((await program.account.cliente.fetch(pdaCliente(1))).nombre).to.equal("Ana María");
  });

  it("registra ventas y mantiene los acumulados", async () => {
    const cliente = pdaCliente(1);
    await program.methods.registrarVenta(1, "LECHE", "Leche entera 1L", 2, new BN(5000))
      .accounts({ owner, registro, cliente, venta: pdaVenta(cliente, "LECHE") } as any).rpc();
    await program.methods.registrarVenta(1, "PAN", "Pan de caja", 1, new BN(3500))
      .accounts({ owner, registro, cliente, venta: pdaVenta(cliente, "PAN") } as any).rpc();

    const c = await program.account.cliente.fetch(cliente);
    expect(c.compras).to.equal(2);
    expect(c.totalGastado.toNumber()).to.equal(8500);
    const r = await program.account.registro.fetch(registro);
    expect(r.totalVentas.toNumber()).to.equal(2);
    expect(r.montoTotal.toNumber()).to.equal(8500);
  });

  it("no permite repetir el mismo SKU para un cliente", async () => {
    const cliente = pdaCliente(1);
    let fallo = false;
    try {
      await program.methods.registrarVenta(1, "LECHE", "dup", 1, new BN(1))
        .accounts({ owner, registro, cliente, venta: pdaVenta(cliente, "LECHE") } as any).rpc();
    } catch {
      fallo = true;
    }
    expect(fallo).to.equal(true);
  });

  it("rechaza monto o cantidad en cero", async () => {
    const cliente = pdaCliente(2);
    await falla(
      program.methods.registrarVenta(2, "X1", "cero", 1, new BN(0)).accounts({ owner, registro, cliente, venta: pdaVenta(cliente, "X1") } as any).rpc(),
      "MontoInvalido"
    );
    await falla(
      program.methods.registrarVenta(2, "X2", "cero", 0, new BN(10)).accounts({ owner, registro, cliente, venta: pdaVenta(cliente, "X2") } as any).rpc(),
      "CantidadInvalida"
    );
  });

  it("cambia el monto y ajusta los acumulados", async () => {
    const cliente = pdaCliente(1);
    await program.methods.cambiarMonto(1, "LECHE", new BN(6000))
      .accounts({ owner, registro, cliente, venta: pdaVenta(cliente, "LECHE") } as any).rpc();
    expect((await program.account.venta.fetch(pdaVenta(cliente, "LECHE"))).monto.toNumber()).to.equal(6000);
    expect((await program.account.cliente.fetch(cliente)).totalGastado.toNumber()).to.equal(9500);
    expect((await program.account.registro.fetch(registro)).montoTotal.toNumber()).to.equal(9500);
  });

  it("otro wallet no puede operar sobre el registro", async () => {
    const intruso = anchor.web3.Keypair.generate();
    const sig = await provider.connection.requestAirdrop(intruso.publicKey, 1e9);
    await provider.connection.confirmTransaction(sig);
    const cliente = pdaCliente(2);
    let fallo = false;
    try {
      await program.methods.registrarVenta(2, "HACK", "no", 1, new BN(1))
        .accounts({ owner: intruso.publicKey, registro, cliente, venta: pdaVenta(cliente, "HACK") } as any)
        .signers([intruso]).rpc();
    } catch {
      fallo = true;
    }
    expect(fallo).to.equal(true);
  });

  it("no elimina un cliente con ventas activas", async () => {
    await falla(program.methods.eliminarCliente(1).accounts({ owner, registro, cliente: pdaCliente(1) } as any).rpc(), "ClienteConVentas");
  });

  it("hace una devolución y revierte acumulados", async () => {
    const cliente = pdaCliente(1);
    await program.methods.hacerDevolucion(1, "PAN")
      .accounts({ owner, registro, cliente, venta: pdaVenta(cliente, "PAN") } as any).rpc();
    expect(await provider.connection.getAccountInfo(pdaVenta(cliente, "PAN"))).to.equal(null);
    const c = await program.account.cliente.fetch(cliente);
    expect(c.compras).to.equal(1);
    expect(c.totalGastado.toNumber()).to.equal(6000);
    expect((await program.account.registro.fetch(registro)).totalVentas.toNumber()).to.equal(1);
  });

  it("elimina un cliente sin ventas", async () => {
    await program.methods.eliminarCliente(2).accounts({ owner, registro, cliente: pdaCliente(2) } as any).rpc();
    expect(await provider.connection.getAccountInfo(pdaCliente(2))).to.equal(null);
    expect((await program.account.registro.fetch(registro)).clientes.length).to.equal(1);
  });

  it("cierra el registro solo cuando no hay clientes", async () => {
    await falla(program.methods.cerrarRegistro().accounts({ owner, registro } as any).rpc(), "RegistroConClientes");
    const cliente = pdaCliente(1);
    await program.methods.hacerDevolucion(1, "LECHE").accounts({ owner, registro, cliente, venta: pdaVenta(cliente, "LECHE") } as any).rpc();
    await program.methods.eliminarCliente(1).accounts({ owner, registro, cliente } as any).rpc();
    await program.methods.cerrarRegistro().accounts({ owner, registro } as any).rpc();
    expect(await provider.connection.getAccountInfo(registro)).to.equal(null);
  });
});

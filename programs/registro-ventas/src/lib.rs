//! Registro de Ventas en Solana — programa Anchor con jerarquía de PDAs.
//!
//! Jerarquía (cada cuenta se deriva de su padre):
//!
//! ```text
//! registro <- ["registro", nombre_negocio, owner]
//! cliente  <- ["cliente",  registro,       id_cliente (u16 LE)]
//! venta    <- ["venta",    cliente,        sku]
//! ```
//!
//! Instrucciones: crear/cerrar registro, crear/renombrar/eliminar cliente,
//! registrar venta, cambiar monto y hacer devolución. El registro y el cliente
//! llevan métricas agregadas (totales) que se mantienen consistentes en cada
//! instrucción.

use anchor_lang::prelude::*;

declare_id!("Gm2e8xz2xqS8XkFKXPpaWnohXHufuJ4oTgohtt8tqQGb");

// ------------------------------- Límites -------------------------------
pub const MAX_NEGOCIO: usize = 30;
pub const MAX_NOMBRE: usize = 30;
pub const MAX_SKU: usize = 16;
pub const MAX_DESCRIPCION: usize = 60;
pub const MAX_CLIENTES: usize = 50;
pub const MAX_HISTORIAL: usize = 50;

#[program]
pub mod registro_ventas {
    use super::*;

    // ---------------------------- Registro ----------------------------
    pub fn crear_registro(ctx: Context<NuevoRegistro>, nombre_negocio: String) -> Result<()> {
        validar_texto(&nombre_negocio, MAX_NEGOCIO)?;

        ctx.accounts.registro.set_inner(Registro {
            owner: ctx.accounts.owner.key(),
            nombre_negocio: nombre_negocio.clone(),
            clientes: Vec::new(),
            id_counter: 0,
            total_ventas: 0,
            monto_total: 0,
            creado_en: Clock::get()?.unix_timestamp,
            bump: ctx.bumps.registro,
        });

        msg!("Registro '{}' creado", nombre_negocio);
        emit!(RegistroCreado {
            registro: ctx.accounts.registro.key(),
            owner: ctx.accounts.owner.key(),
        });
        Ok(())
    }

    /// Cierra el registro y devuelve el rent al owner. Solo si no quedan clientes.
    pub fn cerrar_registro(ctx: Context<CerrarRegistro>) -> Result<()> {
        require!(
            ctx.accounts.registro.clientes.is_empty(),
            Errores::RegistroConClientes
        );
        msg!("Registro '{}' cerrado", ctx.accounts.registro.nombre_negocio);
        Ok(())
    }

    // ----------------------------- Cliente -----------------------------
    pub fn crear_cliente(ctx: Context<NuevoCliente>, nombre: String) -> Result<()> {
        validar_texto(&nombre, MAX_NOMBRE)?;

        let cliente_key = ctx.accounts.cliente.key();
        let registro = &mut ctx.accounts.registro;
        require!(
            registro.clientes.len() < MAX_CLIENTES,
            Errores::LimiteClientes
        );

        // El id lo asigna el programa: el contexto ya derivó la PDA con este mismo valor.
        let id_cliente = registro
            .id_counter
            .checked_add(1)
            .ok_or(Errores::Desbordamiento)?;
        registro.id_counter = id_cliente;
        registro.clientes.push(cliente_key);

        ctx.accounts.cliente.set_inner(Cliente {
            registro: registro.key(),
            id_cliente,
            nombre: nombre.clone(),
            compras: 0,
            total_gastado: 0,
            historial: Vec::new(),
            bump: ctx.bumps.cliente,
        });

        msg!("Cliente '{}' creado con id {}", nombre, id_cliente);
        Ok(())
    }

    pub fn actualizar_cliente(
        ctx: Context<ModificarCliente>,
        _id_cliente: u16,
        nuevo_nombre: String,
    ) -> Result<()> {
        validar_texto(&nuevo_nombre, MAX_NOMBRE)?;
        let cliente = &mut ctx.accounts.cliente;
        msg!("Cliente {}: '{}' -> '{}'", cliente.id_cliente, cliente.nombre, nuevo_nombre);
        cliente.nombre = nuevo_nombre;
        Ok(())
    }

    /// Elimina al cliente (cierra su cuenta). Solo si no tiene ventas activas.
    pub fn eliminar_cliente(ctx: Context<EliminarCliente>, _id_cliente: u16) -> Result<()> {
        require!(
            ctx.accounts.cliente.historial.is_empty(),
            Errores::ClienteConVentas
        );
        let key = ctx.accounts.cliente.key();
        ctx.accounts.registro.clientes.retain(|k| *k != key);
        msg!("Cliente {} eliminado", ctx.accounts.cliente.id_cliente);
        Ok(())
    }

    // ------------------------------ Venta ------------------------------
    pub fn registrar_venta(
        ctx: Context<NuevaVenta>,
        _id_cliente: u16,
        sku: String,
        descripcion: String,
        cantidad: u16,
        monto: u64,
    ) -> Result<()> {
        validar_texto(&sku, MAX_SKU)?;
        validar_texto(&descripcion, MAX_DESCRIPCION)?;
        require!(cantidad > 0, Errores::CantidadInvalida);
        require!(monto > 0, Errores::MontoInvalido);

        let venta_key = ctx.accounts.venta.key();
        let cliente = &mut ctx.accounts.cliente;
        require!(
            cliente.historial.len() < MAX_HISTORIAL,
            Errores::LimiteHistorial
        );

        ctx.accounts.venta.set_inner(Venta {
            cliente: cliente.key(),
            sku: sku.clone(),
            descripcion,
            cantidad,
            monto,
            fecha: Clock::get()?.unix_timestamp,
            bump: ctx.bumps.venta,
        });

        cliente.historial.push(venta_key);
        cliente.compras = cliente.compras.checked_add(1).ok_or(Errores::Desbordamiento)?;
        cliente.total_gastado = cliente
            .total_gastado
            .checked_add(monto)
            .ok_or(Errores::Desbordamiento)?;

        let registro = &mut ctx.accounts.registro;
        registro.total_ventas = registro.total_ventas.checked_add(1).ok_or(Errores::Desbordamiento)?;
        registro.monto_total = registro.monto_total.checked_add(monto).ok_or(Errores::Desbordamiento)?;

        msg!("Venta '{}' registrada al cliente {}", sku, cliente.id_cliente);
        emit!(VentaRegistrada {
            registro: registro.key(),
            cliente: cliente.key(),
            sku,
            monto,
        });
        Ok(())
    }

    pub fn cambiar_monto(
        ctx: Context<ModificarVenta>,
        _id_cliente: u16,
        sku: String,
        nuevo_monto: u64,
    ) -> Result<()> {
        require!(nuevo_monto > 0, Errores::MontoInvalido);

        let venta = &mut ctx.accounts.venta;
        let viejo = venta.monto;
        venta.monto = nuevo_monto;

        // Se mantienen los acumulados: resta el viejo, suma el nuevo.
        let cliente = &mut ctx.accounts.cliente;
        cliente.total_gastado = cliente
            .total_gastado
            .checked_sub(viejo)
            .and_then(|v| v.checked_add(nuevo_monto))
            .ok_or(Errores::Desbordamiento)?;
        let registro = &mut ctx.accounts.registro;
        registro.monto_total = registro
            .monto_total
            .checked_sub(viejo)
            .and_then(|v| v.checked_add(nuevo_monto))
            .ok_or(Errores::Desbordamiento)?;

        msg!("Venta '{}': monto {} -> {}", sku, viejo, nuevo_monto);
        Ok(())
    }

    /// Devolución: cierra la cuenta de la venta, devuelve el rent y revierte acumulados.
    pub fn hacer_devolucion(ctx: Context<EliminarVenta>, _id_cliente: u16, sku: String) -> Result<()> {
        let venta_key = ctx.accounts.venta.key();
        let monto = ctx.accounts.venta.monto;

        let cliente = &mut ctx.accounts.cliente;
        require!(cliente.historial.contains(&venta_key), Errores::VentaNoEnHistorial);
        cliente.historial.retain(|k| *k != venta_key);
        cliente.compras = cliente.compras.checked_sub(1).ok_or(Errores::Desbordamiento)?;
        cliente.total_gastado = cliente
            .total_gastado
            .checked_sub(monto)
            .ok_or(Errores::Desbordamiento)?;

        let registro = &mut ctx.accounts.registro;
        registro.total_ventas = registro.total_ventas.checked_sub(1).ok_or(Errores::Desbordamiento)?;
        registro.monto_total = registro.monto_total.checked_sub(monto).ok_or(Errores::Desbordamiento)?;

        msg!("Devolución de '{}' del cliente {}", sku, cliente.id_cliente);
        emit!(VentaDevuelta {
            registro: registro.key(),
            cliente: cliente.key(),
            sku,
            monto,
        });
        Ok(())
    }
}

// ------------------------------ Utilidades ------------------------------
fn validar_texto(texto: &str, max: usize) -> Result<()> {
    require!(!texto.trim().is_empty(), Errores::TextoVacio);
    require!(texto.len() <= max, Errores::TextoLargo);
    Ok(())
}

// -------------------------------- Errores --------------------------------
#[error_code]
pub enum Errores {
    #[msg("No eres el owner del registro")]
    NoOwner,
    #[msg("La venta no está en el historial del cliente")]
    VentaNoEnHistorial,
    #[msg("El texto no puede estar vacío")]
    TextoVacio,
    #[msg("El texto excede la longitud máxima permitida")]
    TextoLargo,
    #[msg("El monto debe ser mayor a cero")]
    MontoInvalido,
    #[msg("La cantidad debe ser mayor a cero")]
    CantidadInvalida,
    #[msg("El registro alcanzó el máximo de clientes")]
    LimiteClientes,
    #[msg("El cliente alcanzó el máximo de ventas activas")]
    LimiteHistorial,
    #[msg("El cliente aún tiene ventas activas")]
    ClienteConVentas,
    #[msg("El registro aún tiene clientes")]
    RegistroConClientes,
    #[msg("Desbordamiento aritmético")]
    Desbordamiento,
}

// -------------------------------- Eventos --------------------------------
#[event]
pub struct RegistroCreado {
    pub registro: Pubkey,
    pub owner: Pubkey,
}

#[event]
pub struct VentaRegistrada {
    pub registro: Pubkey,
    pub cliente: Pubkey,
    pub sku: String,
    pub monto: u64,
}

#[event]
pub struct VentaDevuelta {
    pub registro: Pubkey,
    pub cliente: Pubkey,
    pub sku: String,
    pub monto: u64,
}

// -------------------------------- Cuentas --------------------------------
#[account]
#[derive(InitSpace)]
pub struct Registro {
    pub owner: Pubkey,
    #[max_len(MAX_NEGOCIO)]
    pub nombre_negocio: String,
    #[max_len(MAX_CLIENTES)]
    pub clientes: Vec<Pubkey>, // índice de lectura para el frontend
    pub id_counter: u16,
    pub total_ventas: u64, // ventas activas
    pub monto_total: u64,  // suma de montos de ventas activas
    pub creado_en: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Cliente {
    pub registro: Pubkey,
    pub id_cliente: u16,
    #[max_len(MAX_NOMBRE)]
    pub nombre: String,
    pub compras: u16,
    pub total_gastado: u64,
    #[max_len(MAX_HISTORIAL)]
    pub historial: Vec<Pubkey>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Venta {
    pub cliente: Pubkey,
    #[max_len(MAX_SKU)]
    pub sku: String,
    #[max_len(MAX_DESCRIPCION)]
    pub descripcion: String,
    pub cantidad: u16,
    pub monto: u64,
    pub fecha: i64,
    pub bump: u8,
}

// ------------------------------- Contextos -------------------------------
#[derive(Accounts)]
#[instruction(nombre_negocio: String)]
pub struct NuevoRegistro<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + Registro::INIT_SPACE,
        seeds = [b"registro", nombre_negocio.as_bytes(), owner.key().as_ref()],
        bump
    )]
    pub registro: Account<'info, Registro>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CerrarRegistro<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        close = owner,
        has_one = owner @ Errores::NoOwner,
        seeds = [b"registro", registro.nombre_negocio.as_bytes(), owner.key().as_ref()],
        bump = registro.bump
    )]
    pub registro: Account<'info, Registro>,
}

#[derive(Accounts)]
pub struct NuevoCliente<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner @ Errores::NoOwner,
        seeds = [b"registro", registro.nombre_negocio.as_bytes(), owner.key().as_ref()],
        bump = registro.bump
    )]
    pub registro: Account<'info, Registro>,

    #[account(
        init,
        payer = owner,
        space = 8 + Cliente::INIT_SPACE,
        seeds = [
            b"cliente",
            registro.key().as_ref(),
            (registro.id_counter + 1).to_le_bytes().as_ref()
        ],
        bump
    )]
    pub cliente: Account<'info, Cliente>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(id_cliente: u16)]
pub struct ModificarCliente<'info> {
    pub owner: Signer<'info>,

    #[account(
        has_one = owner @ Errores::NoOwner,
        seeds = [b"registro", registro.nombre_negocio.as_bytes(), owner.key().as_ref()],
        bump = registro.bump
    )]
    pub registro: Account<'info, Registro>,

    #[account(
        mut,
        seeds = [b"cliente", registro.key().as_ref(), id_cliente.to_le_bytes().as_ref()],
        bump = cliente.bump
    )]
    pub cliente: Account<'info, Cliente>,
}

#[derive(Accounts)]
#[instruction(id_cliente: u16)]
pub struct EliminarCliente<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner @ Errores::NoOwner,
        seeds = [b"registro", registro.nombre_negocio.as_bytes(), owner.key().as_ref()],
        bump = registro.bump
    )]
    pub registro: Account<'info, Registro>,

    #[account(
        mut,
        close = owner,
        seeds = [b"cliente", registro.key().as_ref(), id_cliente.to_le_bytes().as_ref()],
        bump = cliente.bump
    )]
    pub cliente: Account<'info, Cliente>,
}

#[derive(Accounts)]
#[instruction(id_cliente: u16, sku: String)]
pub struct NuevaVenta<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner @ Errores::NoOwner,
        seeds = [b"registro", registro.nombre_negocio.as_bytes(), owner.key().as_ref()],
        bump = registro.bump
    )]
    pub registro: Account<'info, Registro>,

    #[account(
        mut,
        seeds = [b"cliente", registro.key().as_ref(), id_cliente.to_le_bytes().as_ref()],
        bump = cliente.bump
    )]
    pub cliente: Account<'info, Cliente>,

    // El SKU en las seeds impide que un cliente repita el mismo producto.
    #[account(
        init,
        payer = owner,
        space = 8 + Venta::INIT_SPACE,
        seeds = [b"venta", cliente.key().as_ref(), sku.as_bytes()],
        bump
    )]
    pub venta: Account<'info, Venta>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(id_cliente: u16, sku: String)]
pub struct ModificarVenta<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner @ Errores::NoOwner,
        seeds = [b"registro", registro.nombre_negocio.as_bytes(), owner.key().as_ref()],
        bump = registro.bump
    )]
    pub registro: Account<'info, Registro>,

    #[account(
        mut,
        seeds = [b"cliente", registro.key().as_ref(), id_cliente.to_le_bytes().as_ref()],
        bump = cliente.bump
    )]
    pub cliente: Account<'info, Cliente>,

    #[account(
        mut,
        seeds = [b"venta", cliente.key().as_ref(), sku.as_bytes()],
        bump = venta.bump
    )]
    pub venta: Account<'info, Venta>,
}

#[derive(Accounts)]
#[instruction(id_cliente: u16, sku: String)]
pub struct EliminarVenta<'info> {
    #[account(mut)]
    pub owner: Signer<'info>, // mut: recibe el rent de la venta cerrada

    #[account(
        mut,
        has_one = owner @ Errores::NoOwner,
        seeds = [b"registro", registro.nombre_negocio.as_bytes(), owner.key().as_ref()],
        bump = registro.bump
    )]
    pub registro: Account<'info, Registro>,

    #[account(
        mut,
        seeds = [b"cliente", registro.key().as_ref(), id_cliente.to_le_bytes().as_ref()],
        bump = cliente.bump
    )]
    pub cliente: Account<'info, Cliente>,

    #[account(
        mut,
        close = owner,
        seeds = [b"venta", cliente.key().as_ref(), sku.as_bytes()],
        bump = venta.bump
    )]
    pub venta: Account<'info, Venta>,
}

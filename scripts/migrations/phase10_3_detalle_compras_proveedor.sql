-- ============================================================================
-- MIGRACIÓN FASE 10.3: DETALLE DE COMPRAS A PROVEEDORES
-- Requisitos: migraciones 01_caja_devoluciones_finanzas.sql,
--             phase10_1_schema.sql y phase10_2_cuentas_pagar.sql aplicadas.
-- ============================================================================

USE [MishutecT2_Aceptacion];
GO

IF OBJECT_ID(N'dbo.Cuenta_Pagar_Proveedor', N'U') IS NULL
   OR OBJECT_ID(N'dbo.Mov_Inventario', N'U') IS NULL
   OR OBJECT_ID(N'dbo.Suministra', N'U') IS NULL
BEGIN
    ;THROW 51003, 'Faltan tablas requeridas. Aplique primero las migraciones de caja y cuentas por pagar.', 1;
END
GO

IF OBJECT_ID(N'dbo.Detalle_Compra_Proveedor', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Detalle_Compra_Proveedor (
        ID_detalle_compra INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ID_cuenta_pagar INT NOT NULL,
        Codbarras_prod VARCHAR(13) NOT NULL,
        ID_movimiento INT NOT NULL,
        Cantidad INT NOT NULL,
        Precio_unitario DECIMAL(10,2) NOT NULL,
        Subtotal DECIMAL(12,2) NOT NULL,
        CONSTRAINT UQ_DetalleCompra_Cuenta_Producto UNIQUE (ID_cuenta_pagar, Codbarras_prod),
        CONSTRAINT UQ_DetalleCompra_Movimiento UNIQUE (ID_movimiento),
        CONSTRAINT CHK_DetalleCompra_Cantidad CHECK (Cantidad > 0),
        CONSTRAINT CHK_DetalleCompra_Precio CHECK (Precio_unitario > 0),
        CONSTRAINT CHK_DetalleCompra_Subtotal CHECK (Subtotal > 0),
        CONSTRAINT FK_DetalleCompra_Cuenta FOREIGN KEY (ID_cuenta_pagar)
            REFERENCES dbo.Cuenta_Pagar_Proveedor(ID_cuenta_pagar),
        CONSTRAINT FK_DetalleCompra_Producto FOREIGN KEY (Codbarras_prod)
            REFERENCES dbo.Producto(Codbarras_prod),
        CONSTRAINT FK_DetalleCompra_MovInventario FOREIGN KEY (ID_movimiento)
            REFERENCES dbo.Mov_Inventario(ID_movimiento)
    );
    PRINT 'Tabla dbo.Detalle_Compra_Proveedor creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Tabla dbo.Detalle_Compra_Proveedor ya existe.';
END
GO

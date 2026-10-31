-- ============================================================================
-- MIGRACIÓN FASE 10.2: CUENTAS POR PAGAR A PROVEEDORES Y OBLIGACIONES DE PERSONAL
-- Entorno: MishutecT2_Aceptacion (SQL Server)
-- ============================================================================

USE [MishutecT2_Aceptacion];
GO

-- 1. TABLA: dbo.Cuenta_Pagar_Proveedor
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Cuenta_Pagar_Proveedor')
BEGIN
    CREATE TABLE dbo.Cuenta_Pagar_Proveedor (
        ID_cuenta_pagar INT IDENTITY(1,1) PRIMARY KEY,
        ID_proveedor INT NOT NULL,
        Numero_documento VARCHAR(40) NOT NULL,
        Fecha_emision DATE NOT NULL,
        Fecha_vencimiento DATE NOT NULL,
        Condicion_pago VARCHAR(20) NOT NULL CONSTRAINT DF_CuentaPagar_Condicion DEFAULT 'CREDITO',
        Total DECIMAL(12, 2) NOT NULL,
        Monto_pagado DECIMAL(12, 2) NOT NULL CONSTRAINT DF_CuentaPagar_Pagado DEFAULT 0,
        Saldo_pendiente DECIMAL(12, 2) NOT NULL,
        Estado VARCHAR(30) NOT NULL CONSTRAINT DF_CuentaPagar_Estado DEFAULT 'PENDIENTE',
        Base_imponible DECIMAL(12, 2) NOT NULL DEFAULT 0,
        Impuesto DECIMAL(12, 2) NOT NULL DEFAULT 0,
        Tiene_credito_fiscal BIT NOT NULL CONSTRAINT DF_CuentaPagar_CreditoFiscal DEFAULT 1,
        Concepto VARCHAR(200) NOT NULL,
        Observaciones VARCHAR(500) NULL,
        Fecha_registro DATETIME NOT NULL CONSTRAINT DF_CuentaPagar_FechaReg DEFAULT GETDATE(),
        CONSTRAINT FK_CuentaPagar_Proveedor FOREIGN KEY (ID_proveedor) REFERENCES dbo.Proveedor(ID_proveedor),
        CONSTRAINT CHK_CuentaPagar_Estado CHECK (Estado IN ('PENDIENTE', 'PARCIALMENTE PAGADA', 'PAGADA', 'VENCIDA', 'ANULADA')),
        CONSTRAINT CHK_CuentaPagar_Condicion CHECK (Condicion_pago IN ('CONTADO', 'CREDITO'))
    );
    PRINT 'Tabla dbo.Cuenta_Pagar_Proveedor creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Tabla dbo.Cuenta_Pagar_Proveedor ya existe.';
END
GO

-- 2. TABLA: dbo.Pago_Proveedor
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Pago_Proveedor')
BEGIN
    CREATE TABLE dbo.Pago_Proveedor (
        ID_pago_proveedor INT IDENTITY(1,1) PRIMARY KEY,
        ID_cuenta_pagar INT NOT NULL,
        Fecha_pago DATETIME NOT NULL CONSTRAINT DF_PagoProv_Fecha DEFAULT GETDATE(),
        Monto DECIMAL(12, 2) NOT NULL,
        ID_metodo INT NOT NULL,
        ID_empleado_responsable INT NOT NULL,
        ID_sesion INT NULL,
        Referencia VARCHAR(100) NULL,
        Observaciones VARCHAR(255) NULL,
        CONSTRAINT FK_PagoProv_CuentaPagar FOREIGN KEY (ID_cuenta_pagar) REFERENCES dbo.Cuenta_Pagar_Proveedor(ID_cuenta_pagar),
        CONSTRAINT FK_PagoProv_Metodo FOREIGN KEY (ID_metodo) REFERENCES dbo.Metodo_Pago(ID_metodo),
        CONSTRAINT FK_PagoProv_Responsable FOREIGN KEY (ID_empleado_responsable) REFERENCES dbo.Empleado(ID_empleado),
        CONSTRAINT FK_PagoProv_Sesion FOREIGN KEY (ID_sesion) REFERENCES dbo.Sesion_Caja(ID_sesion)
    );
    PRINT 'Tabla dbo.Pago_Proveedor creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Tabla dbo.Pago_Proveedor ya existe.';
END
GO

-- 3. Modificar dbo.Movimiento_Caja para vincular ID_pago_proveedor
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Movimiento_Caja' AND COLUMN_NAME = 'ID_pago_proveedor'
)
BEGIN
    ALTER TABLE dbo.Movimiento_Caja
    ADD ID_pago_proveedor INT NULL CONSTRAINT FK_MovCaja_PagoProv REFERENCES dbo.Pago_Proveedor(ID_pago_proveedor);
    
    PRINT 'Columna ID_pago_proveedor agregada a dbo.Movimiento_Caja.';
END
ELSE
BEGIN
    PRINT 'Columna ID_pago_proveedor ya existe en dbo.Movimiento_Caja.';
END
GO

-- Actualizar constraint de Categoria en Movimiento_Caja para permitir PAGO_PROVEEDOR
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_MovCaja_Categoria')
BEGIN
    ALTER TABLE dbo.Movimiento_Caja DROP CONSTRAINT CHK_MovCaja_Categoria;
END
ALTER TABLE dbo.Movimiento_Caja ADD CONSTRAINT CHK_MovCaja_Categoria CHECK (
    Categoria IN ('VENTA', 'INGRESO_MANUAL', 'GASTO_OPERATIVO', 'PAGO_PERSONAL', 'PAGO_PROVEEDOR', 'RETIRO', 'REEMBOLSO_DEVOLUCION', 'AJUSTE')
);
PRINT 'Constraint CHK_MovCaja_Categoria actualizado con PAGO_PROVEEDOR.';
GO

-- 4. TABLA: dbo.Obligacion_Personal
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Obligacion_Personal')
BEGIN
    CREATE TABLE dbo.Obligacion_Personal (
        ID_obligacion INT IDENTITY(1,1) PRIMARY KEY,
        ID_empleado INT NOT NULL,
        Periodo VARCHAR(40) NOT NULL,
        Concepto VARCHAR(100) NOT NULL,
        Monto_pactado DECIMAL(12, 2) NOT NULL,
        Monto_pagado DECIMAL(12, 2) NOT NULL CONSTRAINT DF_Obligacion_Pagado DEFAULT 0,
        Saldo_pendiente DECIMAL(12, 2) NOT NULL,
        Estado VARCHAR(30) NOT NULL CONSTRAINT DF_Obligacion_Estado DEFAULT 'PENDIENTE',
        ID_empleado_responsable INT NOT NULL,
        Fecha_registro DATETIME NOT NULL CONSTRAINT DF_Obligacion_FechaReg DEFAULT GETDATE(),
        CONSTRAINT FK_Obligacion_Empleado FOREIGN KEY (ID_empleado) REFERENCES dbo.Empleado(ID_empleado),
        CONSTRAINT FK_Obligacion_Responsable FOREIGN KEY (ID_empleado_responsable) REFERENCES dbo.Empleado(ID_empleado),
        CONSTRAINT CHK_Obligacion_Estado CHECK (Estado IN ('PENDIENTE', 'PARCIALMENTE PAGADA', 'PAGADA', 'ANULADA'))
    );
    PRINT 'Tabla dbo.Obligacion_Personal creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Tabla dbo.Obligacion_Personal ya existe.';
END
GO

-- 5. Modificar dbo.Pago_Personal para vincular ID_obligacion y Es_adelanto
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Pago_Personal' AND COLUMN_NAME = 'ID_obligacion'
)
BEGIN
    ALTER TABLE dbo.Pago_Personal
    ADD ID_obligacion INT NULL CONSTRAINT FK_PagoPersonal_Obligacion REFERENCES dbo.Obligacion_Personal(ID_obligacion);
    
    PRINT 'Columna ID_obligacion agregada a dbo.Pago_Personal.';
END
GO

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Pago_Personal' AND COLUMN_NAME = 'Es_adelanto'
)
BEGIN
    ALTER TABLE dbo.Pago_Personal
    ADD Es_adelanto BIT NOT NULL CONSTRAINT DF_PagoPersonal_EsAdelanto DEFAULT 0;
    
    PRINT 'Columna Es_adelanto agregada a dbo.Pago_Personal.';
END
GO

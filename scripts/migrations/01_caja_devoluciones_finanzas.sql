-- ============================================================================
-- MISHUTEC - MIGRACIÓN ESTRUCTURAL: CAJA, CIERRE DIARIO, DEVOLUCIONES Y FINANZAS
-- Entorno: SQL Server 2022 Express / MishutecT2_Aceptacion
-- ============================================================================

-- 1. Tabla: dbo.Sesion_Caja (Turnos de Caja, Aperturas y Cierres Diarios)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Sesion_Caja' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.Sesion_Caja (
        ID_sesion INT IDENTITY(1,1) PRIMARY KEY,
        ID_empleado_apertura INT NOT NULL,
        Fecha_apertura DATETIME NOT NULL DEFAULT GETDATE(),
        Monto_inicial DECIMAL(12,2) NOT NULL CONSTRAINT CHK_SesionCaja_MontoInicial CHECK (Monto_inicial >= 0),
        Fecha_cierre DATETIME NULL,
        ID_empleado_cierre INT NULL,
        Efectivo_esperado DECIMAL(12,2) NULL,
        Efectivo_contado DECIMAL(12,2) NULL,
        Diferencia DECIMAL(12,2) NULL,
        Estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTA' CONSTRAINT CHK_SesionCaja_Estado CHECK (Estado IN ('ABIERTA', 'CERRADA', 'REABIERTA')),
        Observaciones_apertura VARCHAR(255) NULL,
        Observaciones_cierre VARCHAR(255) NULL,
        Motivo_reapertura VARCHAR(255) NULL,
        Fecha_reapertura DATETIME NULL,
        ID_empleado_reapertura INT NULL,
        CONSTRAINT FK_SesionCaja_EmpleadoApertura FOREIGN KEY (ID_empleado_apertura) REFERENCES dbo.Empleado(ID_empleado),
        CONSTRAINT FK_SesionCaja_EmpleadoCierre FOREIGN KEY (ID_empleado_cierre) REFERENCES dbo.Empleado(ID_empleado),
        CONSTRAINT FK_SesionCaja_EmpleadoReapertura FOREIGN KEY (ID_empleado_reapertura) REFERENCES dbo.Empleado(ID_empleado)
    );
    PRINT 'Tabla dbo.Sesion_Caja creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Tabla dbo.Sesion_Caja ya existe.';
END;

-- 2. Tabla: dbo.Movimiento_Caja (Registro de Ingresos, Egresos, Gastos y Retiros)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Movimiento_Caja' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.Movimiento_Caja (
        ID_mov_caja INT IDENTITY(1,1) PRIMARY KEY,
        ID_sesion INT NOT NULL,
        Fecha_hora DATETIME NOT NULL DEFAULT GETDATE(),
        Tipo VARCHAR(20) NOT NULL CONSTRAINT CHK_MovCaja_Tipo CHECK (Tipo IN ('INGRESO', 'EGRESO')),
        Categoria VARCHAR(50) NOT NULL CONSTRAINT CHK_MovCaja_Categoria CHECK (Categoria IN ('VENTA', 'INGRESO_MANUAL', 'GASTO_OPERATIVO', 'RETIRO', 'REEMBOLSO_DEVOLUCION', 'AJUSTE')),
        Monto DECIMAL(12,2) NOT NULL CONSTRAINT CHK_MovCaja_Monto CHECK (Monto > 0),
        ID_metodo INT NOT NULL,
        Concepto VARCHAR(255) NOT NULL,
        ID_empleado INT NOT NULL,
        ID_venta INT NULL,
        ID_devolucion INT NULL,
        Afecta_efectivo BIT NOT NULL DEFAULT 1,
        CONSTRAINT FK_MovCaja_Sesion FOREIGN KEY (ID_sesion) REFERENCES dbo.Sesion_Caja(ID_sesion),
        CONSTRAINT FK_MovCaja_Metodo FOREIGN KEY (ID_metodo) REFERENCES dbo.Metodo_Pago(ID_metodo),
        CONSTRAINT FK_MovCaja_Empleado FOREIGN KEY (ID_empleado) REFERENCES dbo.Empleado(ID_empleado),
        CONSTRAINT FK_MovCaja_Venta FOREIGN KEY (ID_venta) REFERENCES dbo.Venta(ID_venta),
        CONSTRAINT FK_MovCaja_Devolucion FOREIGN KEY (ID_devolucion) REFERENCES dbo.Devolucion(ID_devolucion)
    );
    PRINT 'Tabla dbo.Movimiento_Caja creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Tabla dbo.Movimiento_Caja ya existe.';
END;

-- 3. Tabla: dbo.Nota_Credito (Comprobantes Tributarios y Académicos de Ajuste)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Nota_Credito' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.Nota_Credito (
        ID_nota_credito INT IDENTITY(1,1) PRIMARY KEY,
        Numero_nota VARCHAR(20) NOT NULL UNIQUE,
        ID_venta INT NOT NULL,
        ID_devolucion INT NULL,
        Fecha_emision DATETIME NOT NULL DEFAULT GETDATE(),
        Tipo_ajuste VARCHAR(20) NOT NULL DEFAULT 'PARCIAL' CONSTRAINT CHK_NotaCredito_Tipo CHECK (Tipo_ajuste IN ('PARCIAL', 'TOTAL')),
        Motivo VARCHAR(255) NOT NULL,
        Monto_subtotal DECIMAL(12,2) NOT NULL CONSTRAINT CHK_NotaCredito_Subtotal CHECK (Monto_subtotal >= 0),
        Monto_igv DECIMAL(12,2) NOT NULL CONSTRAINT CHK_NotaCredito_IGV CHECK (Monto_igv >= 0),
        Monto_total DECIMAL(12,2) NOT NULL CONSTRAINT CHK_NotaCredito_Total CHECK (Monto_total > 0),
        ID_empleado INT NOT NULL,
        Estado VARCHAR(20) NOT NULL DEFAULT 'EMITIDA' CONSTRAINT CHK_NotaCredito_Estado CHECK (Estado IN ('EMITIDA', 'ANULADA')),
        Es_simulacion_academica BIT NOT NULL DEFAULT 1,
        CONSTRAINT FK_NotaCredito_Venta FOREIGN KEY (ID_venta) REFERENCES dbo.Venta(ID_venta),
        CONSTRAINT FK_NotaCredito_Devolucion FOREIGN KEY (ID_devolucion) REFERENCES dbo.Devolucion(ID_devolucion),
        CONSTRAINT FK_NotaCredito_Empleado FOREIGN KEY (ID_empleado) REFERENCES dbo.Empleado(ID_empleado)
    );
    PRINT 'Tabla dbo.Nota_Credito creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Tabla dbo.Nota_Credito ya existe.';
END;

-- 4. Tabla: dbo.Reembolso_Devolucion (Control de Reembolsos por Método de Pago)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Reembolso_Devolucion' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.Reembolso_Devolucion (
        ID_reembolso INT IDENTITY(1,1) PRIMARY KEY,
        ID_devolucion INT NOT NULL,
        ID_venta INT NOT NULL,
        ID_metodo INT NOT NULL,
        Monto DECIMAL(12,2) NOT NULL CONSTRAINT CHK_Reembolso_Monto CHECK (Monto > 0),
        Fecha_hora DATETIME NOT NULL DEFAULT GETDATE(),
        ID_empleado INT NOT NULL,
        ID_sesion INT NULL,
        Referencia VARCHAR(150) NULL,
        CONSTRAINT FK_Reembolso_Devolucion FOREIGN KEY (ID_devolucion) REFERENCES dbo.Devolucion(ID_devolucion),
        CONSTRAINT FK_Reembolso_Venta FOREIGN KEY (ID_venta) REFERENCES dbo.Venta(ID_venta),
        CONSTRAINT FK_Reembolso_Metodo FOREIGN KEY (ID_metodo) REFERENCES dbo.Metodo_Pago(ID_metodo),
        CONSTRAINT FK_Reembolso_Empleado FOREIGN KEY (ID_empleado) REFERENCES dbo.Empleado(ID_empleado),
        CONSTRAINT FK_Reembolso_Sesion FOREIGN KEY (ID_sesion) REFERENCES dbo.Sesion_Caja(ID_sesion)
    );
    PRINT 'Tabla dbo.Reembolso_Devolucion creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Tabla dbo.Reembolso_Devolucion ya existe.';
END;

-- 5. Tabla: dbo.Configuracion_Tributaria (Parámetros SUNAT, IGV 18% = 15.5% + 2.5%)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Configuracion_Tributaria' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.Configuracion_Tributaria (
        ID_config INT IDENTITY(1,1) PRIMARY KEY,
        RUC VARCHAR(11) NOT NULL DEFAULT '20608945123',
        Razon_social VARCHAR(150) NOT NULL DEFAULT 'MISHUTEC HARDWARE S.A.C.',
        Nombre_comercial VARCHAR(100) NOT NULL DEFAULT 'Mishutec Commercial POS',
        Regimen_tributario VARCHAR(50) NOT NULL DEFAULT 'MYPE Tributario',
        Tasa_igv DECIMAL(5,2) NOT NULL DEFAULT 15.50,
        Tasa_ipm DECIMAL(5,2) NOT NULL DEFAULT 2.50,
        Tasa_total_igv DECIMAL(5,2) NOT NULL DEFAULT 18.00,
        Direccion_fiscal VARCHAR(200) NOT NULL DEFAULT 'Av. Garcilaso de la Vega 1348, Int. 204, Lima',
        Estado_sunat VARCHAR(50) NOT NULL DEFAULT 'HABIDO / ACTIVO',
        Es_academico BIT NOT NULL DEFAULT 1
    );

    INSERT INTO dbo.Configuracion_Tributaria (
        RUC, Razon_social, Nombre_comercial, Regimen_tributario,
        Tasa_igv, Tasa_ipm, Tasa_total_igv, Direccion_fiscal, Estado_sunat, Es_academico
    )
    VALUES (
        '20608945123', 'MISHUTEC HARDWARE S.A.C.', 'Mishutec Commercial POS', 'MYPE Tributario',
        15.50, 2.50, 18.00, 'Av. Garcilaso de la Vega 1348, Int. 204, Lima', 'HABIDO / ACTIVO', 1
    );

    PRINT 'Tabla dbo.Configuracion_Tributaria creada con parámetros oficiales iniciales.';
END
ELSE
BEGIN
    PRINT 'Tabla dbo.Configuracion_Tributaria ya existe.';
END;

-- 6. Integración en Tipo_Comprobante si falta Nota de Crédito
IF NOT EXISTS (SELECT 1 FROM dbo.Tipo_Comprobante WHERE ID_tipo_comp = 3 OR Nombre_tipo = 'Nota de Crédito')
BEGIN
    -- Comprobar si ID_tipo_comp tiene IDENTITY
    IF COLUMNPROPERTY(OBJECT_ID('dbo.Tipo_Comprobante'), 'ID_tipo_comp', 'IsIdentity') = 1
    BEGIN
        SET IDENTITY_INSERT dbo.Tipo_Comprobante ON;
        INSERT INTO dbo.Tipo_Comprobante (ID_tipo_comp, Nombre_tipo) VALUES (3, 'Nota de Crédito');
        SET IDENTITY_INSERT dbo.Tipo_Comprobante OFF;
    END
    ELSE
    BEGIN
        INSERT INTO dbo.Tipo_Comprobante (ID_tipo_comp, Nombre_tipo) VALUES (3, 'Nota de Crédito');
    END
    PRINT 'Tipo de Comprobante Nota de Crédito (ID 3) registrado.';
END;

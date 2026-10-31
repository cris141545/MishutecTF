-- ============================================================================
-- MIGRACIÓN FASE 10.1: ESTADOS DE VENTA Y PAGOS AL PERSONAL
-- Entorno: MishutecT2_Aceptacion (SQL Server)
-- ============================================================================

USE [MishutecT2_Aceptacion];
GO

-- 1. Agregar columna Estado a dbo.Venta si no existe
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Venta' AND COLUMN_NAME = 'Estado'
)
BEGIN
    ALTER TABLE dbo.Venta
    ADD Estado VARCHAR(30) NOT NULL CONSTRAINT DF_Venta_Estado DEFAULT 'COMPLETADA';
    
    PRINT 'Columna Estado agregada a dbo.Venta con default COMPLETADA.';
END
ELSE
BEGIN
    PRINT 'Columna Estado ya existe en dbo.Venta.';
END
GO

-- Actualizar estados históricos según devoluciones existentes
UPDATE v
SET v.Estado = CASE 
    -- Si la suma de devoluciones aprobadas cubre el total de la venta -> TOTALMENTE DEVUELTA
    WHEN devTot.TotalDevuelto >= v.Total_venta THEN 'TOTALMENTE DEVUELTA'
    -- Si hay devoluciones aprobadas pero no cubren el total -> PARCIALMENTE DEVUELTA
    WHEN devTot.TotalDevuelto > 0 THEN 'PARCIALMENTE DEVUELTA'
    ELSE 'COMPLETADA'
END
FROM dbo.Venta v
LEFT JOIN (
    SELECT d.ID_venta, SUM(dd.Cantidad_dev * dv.Precio_unitario) AS TotalDevuelto
    FROM dbo.Devolucion d
    JOIN dbo.Detalle_Dev dd ON d.ID_devolucion = dd.ID_devolucion
    JOIN dbo.Detalle_Venta dv ON dd.ID_detalle = dv.ID_detalle
    WHERE d.ID_estado_dev = 2 -- Aprobada
    GROUP BY d.ID_venta
) devTot ON v.ID_venta = devTot.ID_venta;
GO

-- 2. Crear tabla dbo.Pago_Personal
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Pago_Personal')
BEGIN
    CREATE TABLE dbo.Pago_Personal (
        ID_pago_personal INT IDENTITY(1,1) PRIMARY KEY,
        ID_empleado INT NOT NULL,
        Fecha_pago DATETIME NOT NULL CONSTRAINT DF_PagoPersonal_Fecha DEFAULT GETDATE(),
        Periodo VARCHAR(40) NOT NULL,
        Concepto VARCHAR(100) NOT NULL,
        Monto DECIMAL(12, 2) NOT NULL,
        ID_metodo INT NOT NULL,
        ID_empleado_responsable INT NOT NULL,
        ID_sesion INT NULL,
        Observaciones VARCHAR(255) NULL,
        CONSTRAINT FK_PagoPersonal_Empleado FOREIGN KEY (ID_empleado) REFERENCES dbo.Empleado(ID_empleado),
        CONSTRAINT FK_PagoPersonal_Metodo FOREIGN KEY (ID_metodo) REFERENCES dbo.Metodo_Pago(ID_metodo),
        CONSTRAINT FK_PagoPersonal_Responsable FOREIGN KEY (ID_empleado_responsable) REFERENCES dbo.Empleado(ID_empleado),
        CONSTRAINT FK_PagoPersonal_Sesion FOREIGN KEY (ID_sesion) REFERENCES dbo.Sesion_Caja(ID_sesion)
    );
    PRINT 'Tabla dbo.Pago_Personal creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Tabla dbo.Pago_Personal ya existe.';
END
GO

-- 3. Agregar columna ID_pago_personal a dbo.Movimiento_Caja si no existe
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Movimiento_Caja' AND COLUMN_NAME = 'ID_pago_personal'
)
BEGIN
    ALTER TABLE dbo.Movimiento_Caja
    ADD ID_pago_personal INT NULL CONSTRAINT FK_MovCaja_PagoPersonal REFERENCES dbo.Pago_Personal(ID_pago_personal);
    
    PRINT 'Columna ID_pago_personal agregada a dbo.Movimiento_Caja.';
END
ELSE
BEGIN
    PRINT 'Columna ID_pago_personal ya existe en dbo.Movimiento_Caja.';
END
GO

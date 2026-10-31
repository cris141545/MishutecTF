-- ================================================================================
-- MISHUTEC - MIGRACIÓN FASE 10.2: PERSISTENCIA DE EFECTIVO RECIBIDO Y VUELTO EN VENTA
-- Base de datos: MishutecT2_Aceptacion
-- ================================================================================

USE [MishutecT2_Aceptacion];

-- 1. Agregar columnas para auditoría y comprobante de vuelto si no existen
IF NOT EXISTS (
    SELECT 1 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Venta' AND COLUMN_NAME = 'Efectivo_recibido'
)
BEGIN
    ALTER TABLE dbo.Venta ADD Efectivo_recibido DECIMAL(10, 2) NULL;
    PRINT 'Columna dbo.Venta.Efectivo_recibido agregada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Columna dbo.Venta.Efectivo_recibido ya existe.';
END;

IF NOT EXISTS (
    SELECT 1 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Venta' AND COLUMN_NAME = 'Vuelto'
)
BEGIN
    ALTER TABLE dbo.Venta ADD Vuelto DECIMAL(10, 2) NULL;
    PRINT 'Columna dbo.Venta.Vuelto agregada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Columna dbo.Venta.Vuelto ya existe.';
END;

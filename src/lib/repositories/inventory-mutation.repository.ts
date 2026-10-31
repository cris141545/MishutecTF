import sql from "mssql";
import { getPool } from "../db";
import { assertMutationsAllowed } from "../db-guard";
import { InventoryMovementInput } from "../validations/inventory-mutation.schema";

export class InsufficientStockError extends Error {
  constructor(
    public readonly currentStock: number,
    public readonly requestedQty: number,
    public readonly productName: string
  ) {
    super(
      `Stock insuficiente para '${productName}'. Existencia actual: ${currentStock} unid., salida solicitada: ${requestedQty} unid.`
    );
    this.name = "InsufficientStockError";
  }
}

export class DiscontinuedProductOperationError extends Error {
  constructor(public readonly codbarras: string, public readonly productName: string) {
    super(
      `Operación rechazada: El producto '${productName}' (${codbarras}) se encuentra Descontinuado. No se permiten entradas ni salidas ordinarias.`
    );
    this.name = "DiscontinuedProductOperationError";
  }
}

export class ProductNotFoundError extends Error {
  constructor(public readonly codbarras: string) {
    super(`Producto con código de barras '${codbarras}' no encontrado en el sistema.`);
    this.name = "ProductNotFoundError";
  }
}

export class EmployeeNotFoundError extends Error {
  constructor(public readonly idEmpleado: number) {
    super(`Empleado responsable con ID ${idEmpleado} no encontrado.`);
    this.name = "EmployeeNotFoundError";
  }
}

export interface MovementResult {
  idMovimiento: number;
  codbarras: string;
  nombreProducto: string;
  tipoMovimiento: "Entrada" | "Salida";
  cantidad: number;
  stockAnterior: number;
  stockNuevo: number;
  estadoAnterior: string;
  estadoNuevo: string;
  fecha: string;
  empleado: string;
}

/**
 * Registra una entrada física de inventario de forma estrictamente transaccional.
 */
export async function recordInventoryEntryTransactional(
  _input: InventoryMovementInput
): Promise<MovementResult> {
  void _input;
  throw new Error("El inventario solo puede aumentar al registrar una compra a proveedor.");
}

/**
 * Registra una salida física de inventario de forma estrictamente transaccional.
 */
export async function recordInventoryExitTransactional(
  input: InventoryMovementInput
): Promise<MovementResult> {
  // Verificación incondicional de protección académica
  assertMutationsAllowed("Registrar Salida Inventario");

  const pool = await getPool();
  const tx = new sql.Transaction(pool);

  await tx.begin();

  try {
    // 1. Validar existencia del empleado
    const empReq = new sql.Request(tx);
    empReq.input("idEmp", sql.Int, input.idEmpleado);
    const empRes = await empReq.query(`
      SELECT ID_empleado, CONCAT(Nombre_emp, ' ', Apellido_emp) AS EmpleadoNombre
      FROM dbo.Empleado
      WHERE ID_empleado = @idEmp;
    `);

    if (empRes.recordset.length === 0) {
      throw new EmployeeNotFoundError(input.idEmpleado);
    }
    const empleadoNombre = empRes.recordset[0].EmpleadoNombre;

    // 2. Bloquear la fila del producto de forma exclusiva (UPDLOCK, ROWLOCK)
    const prodReq = new sql.Request(tx);
    prodReq.input("codbarras", sql.VarChar(13), input.codbarras);
    const prodRes = await prodReq.query(`
      SELECT 
        p.Codbarras_prod,
        p.Nombre_prod,
        p.Stock,
        p.ID_estado_prod,
        ep.Estado AS EstadoNombre
      FROM dbo.Producto p WITH (UPDLOCK, ROWLOCK)
      JOIN dbo.Estado_Prod ep ON p.ID_estado_prod = ep.ID_estado_prod
      WHERE p.Codbarras_prod = @codbarras;
    `);

    if (prodRes.recordset.length === 0) {
      throw new ProductNotFoundError(input.codbarras);
    }

    const prod = prodRes.recordset[0];
    const stockAnterior = Number(prod.Stock);
    const idEstadoAnterior = Number(prod.ID_estado_prod);
    const estadoAnterior = prod.EstadoNombre;
    const nombreProd = prod.Nombre_prod;

    // Regla de negocio: No se permiten salidas sobre productos descontinuados
    if (idEstadoAnterior === 3 || estadoAnterior.toLowerCase() === "descontinuado") {
      throw new DiscontinuedProductOperationError(input.codbarras, nombreProd);
    }

    // Regla de negocio: Existencia suficiente (evita sobreventa y stock negativo)
    if (stockAnterior < input.cantidad) {
      throw new InsufficientStockError(stockAnterior, input.cantidad, nombreProd);
    }

    const stockNuevo = stockAnterior - input.cantidad;

    // Si el stock llega a 0, actualizar estado a Agotado (ID 2)
    let idEstadoNuevo = idEstadoAnterior;
    let estadoNuevo = estadoAnterior;

    if (stockNuevo === 0) {
      idEstadoNuevo = 2; // Agotado
      estadoNuevo = "Agotado";
    }

    // 3. Actualizar stock y estado en dbo.Producto
    const updReq = new sql.Request(tx);
    updReq.input("codbarras", sql.VarChar(13), input.codbarras);
    updReq.input("newStock", sql.Int, stockNuevo);
    updReq.input("newEstado", sql.Int, idEstadoNuevo);

    await updReq.query(`
      UPDATE dbo.Producto
      SET 
        Stock = @newStock,
        ID_estado_prod = @newEstado
      WHERE Codbarras_prod = @codbarras;
    `);

    // 4. Insertar registro en dbo.Mov_Inventario (ID_tipo_mov = 2: Salida)
    const movReq = new sql.Request(tx);
    const fechaMov = input.fecha || new Date().toISOString().split("T")[0];
    movReq.input("fecha", sql.Date, fechaMov);
    movReq.input("cantidad", sql.Int, input.cantidad);
    movReq.input("idTipoMov", sql.Int, 2); // 2 = Salida
    movReq.input("codbarras", sql.VarChar(13), input.codbarras);
    movReq.input("idEmpleado", sql.Int, input.idEmpleado);

    const movRes = await movReq.query(`
      INSERT INTO dbo.Mov_Inventario (Fecha, Cantidad, ID_tipo_mov, Codbarras_prod, ID_empleado)
      OUTPUT INSERTED.ID_movimiento
      VALUES (@fecha, @cantidad, @idTipoMov, @codbarras, @idEmpleado);
    `);

    const idMovimiento = movRes.recordset[0].ID_movimiento;

    await tx.commit();

    return {
      idMovimiento,
      codbarras: input.codbarras,
      nombreProducto: nombreProd,
      tipoMovimiento: "Salida",
      cantidad: input.cantidad,
      stockAnterior,
      stockNuevo,
      estadoAnterior,
      estadoNuevo,
      fecha: fechaMov,
      empleado: empleadoNombre,
    };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

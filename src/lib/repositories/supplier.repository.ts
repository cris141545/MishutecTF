import sql from "mssql";
import { getPool } from "../db";
import { assertMutationsAllowed } from "../db-guard";
import {
  SupplierListItem,
  SupplierDetail,
  SuppliedProductItem,
} from "@/types/entities";
import {
  SupplierInput,
  SupplierProductAssociationInput,
} from "../validations/entity.schema";

export class SupplierNotFoundError extends Error {
  constructor(public readonly id: number) {
    super(`El proveedor con ID ${id} no existe.`);
    this.name = "SupplierNotFoundError";
  }
}

/**
 * Obtiene el listado de proveedores y el conteo de productos suministrados.
 */
export async function getSuppliersList(query?: string): Promise<SupplierListItem[]> {
  const pool = await getPool();
  const request = pool.request();

  let whereClause = "";
  if (query && query.trim()) {
    const term = `%${query.trim()}%`;
    request.input("queryTerm", sql.VarChar(100), term);
    whereClause = `
      WHERE pr.Nombre_prov LIKE @queryTerm
         OR pr.Correo_prov LIKE @queryTerm
         OR pr.Telefono_prov LIKE @queryTerm
    `;
  }

  const sqlQuery = `
    SELECT 
      pr.ID_proveedor AS idProveedor,
      pr.Nombre_prov AS nombre,
      pr.Correo_prov AS correo,
      pr.Telefono_prov AS telefono,
      COUNT(s.Codbarras_prod) AS totalProductosSuministrados
    FROM dbo.Proveedor pr
    LEFT JOIN dbo.Suministra s ON pr.ID_proveedor = s.ID_proveedor
    ${whereClause}
    GROUP BY pr.ID_proveedor, pr.Nombre_prov, pr.Correo_prov, pr.Telefono_prov
    ORDER BY pr.Nombre_prov ASC;
  `;

  const result = await request.query(sqlQuery);

  return result.recordset.map((r) => ({
    idProveedor: Number(r.idProveedor),
    nombre: r.nombre,
    correo: r.correo,
    telefono: r.telefono,
    totalProductosSuministrados: Number(r.totalProductosSuministrados) || 0,
  }));
}

/**
 * Obtiene la ficha de un proveedor con la lista de productos que suministra.
 */
export async function getSupplierDetail(
  id: number
): Promise<SupplierDetail | null> {
  const pool = await getPool();

  const provReq = pool.request();
  provReq.input("id", sql.Int, id);
  const provRes = await provReq.query(`
    SELECT 
      pr.ID_proveedor AS idProveedor,
      pr.Nombre_prov AS nombre,
      pr.Correo_prov AS correo,
      pr.Telefono_prov AS telefono
    FROM dbo.Proveedor pr
    WHERE pr.ID_proveedor = @id;
  `);

  if (provRes.recordset.length === 0) {
    return null;
  }

  const prov = provRes.recordset[0];

  const prodReq = pool.request();
  prodReq.input("id", sql.Int, id);
  const prodRes = await prodReq.query(`
    SELECT 
      s.Codbarras_prod AS codbarras,
      p.Nombre_prod AS nombreProducto,
      c.Nombre_cat AS categoria,
      m.Nombre_marca AS marca,
      CAST(p.Precio AS FLOAT) AS precioVenta,
      CAST(s.Precio_compra AS FLOAT) AS precioCompra,
      p.Stock AS stock
    FROM dbo.Suministra s
    JOIN dbo.Producto p ON s.Codbarras_prod = p.Codbarras_prod
    JOIN dbo.Categoria c ON p.ID_categoria = c.ID_categoria
    JOIN dbo.Marca m ON p.ID_marca = m.ID_marca
    WHERE s.ID_proveedor = @id
    ORDER BY p.Nombre_prod ASC;
  `);

  const productos: SuppliedProductItem[] = prodRes.recordset.map((p) => ({
    codbarras: p.codbarras,
    nombreProducto: p.nombreProducto,
    categoria: p.categoria,
    marca: p.marca,
    precioVenta: Number(p.precioVenta) || 0,
    precioCompra: Number(p.precioCompra) || 0,
    stock: Number(p.stock) || 0,
  }));

  return {
    idProveedor: Number(prov.idProveedor),
    nombre: prov.nombre,
    correo: prov.correo,
    telefono: prov.telefono,
    totalProductosSuministrados: productos.length,
    productos,
  };
}

/**
 * Registra un nuevo proveedor en SQL Server.
 */
export async function createSupplier(
  input: SupplierInput
): Promise<{ idProveedor: number }> {
  assertMutationsAllowed("Registrar Proveedor");

  const pool = await getPool();
  const request = pool.request();

  request.input("nombre", sql.VarChar(100), input.nombre);
  request.input("correo", sql.VarChar(100), input.correo);
  request.input("telefono", sql.VarChar(15), input.telefono);

  const res = await request.query(`
    INSERT INTO dbo.Proveedor (Nombre_prov, Correo_prov, Telefono_prov)
    OUTPUT INSERTED.ID_proveedor
    VALUES (@nombre, @correo, @telefono);
  `);

  return { idProveedor: Number(res.recordset[0].ID_proveedor) };
}

/**
 * Actualiza los datos de contacto de un proveedor.
 */
export async function updateSupplier(
  id: number,
  input: SupplierInput
): Promise<{ idProveedor: number }> {
  assertMutationsAllowed("Actualizar Proveedor");

  const pool = await getPool();

  const checkReq = pool.request();
  checkReq.input("id", sql.Int, id);
  const existing = await checkReq.query(
    "SELECT ID_proveedor FROM dbo.Proveedor WHERE ID_proveedor = @id"
  );

  if (existing.recordset.length === 0) {
    throw new SupplierNotFoundError(id);
  }

  const updReq = pool.request();
  updReq.input("id", sql.Int, id);
  updReq.input("nombre", sql.VarChar(100), input.nombre);
  updReq.input("correo", sql.VarChar(100), input.correo);
  updReq.input("telefono", sql.VarChar(15), input.telefono);

  await updReq.query(`
    UPDATE dbo.Proveedor
    SET 
      Nombre_prov = @nombre,
      Correo_prov = @correo,
      Telefono_prov = @telefono
    WHERE ID_proveedor = @id;
  `);

  return { idProveedor: id };
}

/**
 * Agrega o actualiza un producto suministrado por el proveedor (dbo.Suministra).
 */
export async function addOrUpdateSuppliedProduct(
  input: SupplierProductAssociationInput
): Promise<{ success: boolean }> {
  assertMutationsAllowed("Vincular Producto con Proveedor");

  const pool = await getPool();

  // Comprobar existencia previa de la relación
  const checkReq = pool.request();
  checkReq.input("idProv", sql.Int, input.idProveedor);
  checkReq.input("cod", sql.VarChar(13), input.codbarras);

  const existing = await checkReq.query(`
    SELECT * FROM dbo.Suministra 
    WHERE ID_proveedor = @idProv AND Codbarras_prod = @cod;
  `);

  const req = pool.request();
  req.input("idProv", sql.Int, input.idProveedor);
  req.input("cod", sql.VarChar(13), input.codbarras);
  req.input("costo", sql.Decimal(9, 2), input.precioCompra);

  if (existing.recordset.length > 0) {
    await req.query(`
      UPDATE dbo.Suministra
      SET Precio_compra = @costo
      WHERE ID_proveedor = @idProv AND Codbarras_prod = @cod;
    `);
  } else {
    await req.query(`
      INSERT INTO dbo.Suministra (Codbarras_prod, ID_proveedor, Precio_compra)
      VALUES (@cod, @idProv, @costo);
    `);
  }

  return { success: true };
}

/**
 * Desvincula un producto de un proveedor en dbo.Suministra.
 */
export async function removeSuppliedProduct(
  idProveedor: number,
  codbarras: string
): Promise<{ success: boolean }> {
  assertMutationsAllowed("Desvincular Producto de Proveedor");

  const pool = await getPool();
  const req = pool.request();
  req.input("idProv", sql.Int, idProveedor);
  req.input("cod", sql.VarChar(13), codbarras);

  await req.query(`
    DELETE FROM dbo.Suministra
    WHERE ID_proveedor = @idProv AND Codbarras_prod = @cod;
  `);

  return { success: true };
}

/**
 * Retorna la lista de productos disponibles en el catálogo para el selector de suministro.
 */
export async function getAvailableProductsForLinking(): Promise<
  { codbarras: string; nombre: string; precio: number }[]
> {
  const pool = await getPool();
  const res = await pool.request().query(`
    SELECT 
      Codbarras_prod AS codbarras, 
      Nombre_prod AS nombre, 
      CAST(Precio AS FLOAT) AS precio
    FROM dbo.Producto
    ORDER BY Nombre_prod ASC;
  `);
  return res.recordset.map((r) => ({
    codbarras: r.codbarras,
    nombre: r.nombre,
    precio: Number(r.precio) || 0,
  }));
}

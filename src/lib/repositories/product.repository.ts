import { getPool } from "@/lib/db";
import sql from "mssql";
import {
  ProductListItem,
  ProductDetail,
  PaginatedProductsResult,
  ProductFilterMetadata,
  ProductSupplier,
  ProductTechnicalSpecs,
} from "@/types/product";
import { ValidatedProductFilters } from "@/lib/validations/product-filter.schema";

const SORT_COLUMN_MAP: Record<string, string> = {
  nombre: "p.Nombre_prod",
  precio: "p.Precio",
  stock: "p.Stock",
};

/**
 * Repositorio de acceso a datos para Productos sobre SQL Server (MishutecT2).
 * Todas las operaciones son estrictamente de solo lectura y parametrizadas.
 */
export async function findProducts(
  filters: ValidatedProductFilters
): Promise<PaginatedProductsResult> {
  const pool = await getPool();
  const request = pool.request();

  const whereConditions: string[] = ["1 = 1"];

  // 1. Filtro de búsqueda por nombre o código de barras
  if (filters.search) {
    whereConditions.push(
      "(p.Nombre_prod LIKE '%' + @search + '%' OR p.Codbarras_prod LIKE '%' + @search + '%')"
    );
    request.input("search", sql.VarChar, filters.search);
  }

  // 2. Filtro por categoría
  if (filters.categoria && filters.categoria !== "todas") {
    whereConditions.push("c.Nombre_cat = @categoria");
    request.input("categoria", sql.VarChar, filters.categoria);
  }

  // 3. Filtro por marca
  if (filters.marca && filters.marca !== "todas") {
    whereConditions.push("m.Nombre_marca = @marca");
    request.input("marca", sql.VarChar, filters.marca);
  }

  // 4. Filtro por estado del producto
  if (filters.estado && filters.estado !== "todos") {
    whereConditions.push("e.Estado = @estado");
    request.input("estado", sql.VarChar, filters.estado);
  }

  // 5. Filtro por disponibilidad de stock
  if (filters.stockStatus === "disponible") {
    whereConditions.push("p.Stock > 0");
  } else if (filters.stockStatus === "agotado") {
    whereConditions.push("p.Stock = 0");
  } else if (filters.stockStatus === "stock_bajo") {
    whereConditions.push("p.Stock > 0 AND p.Stock <= 5");
  }

  // Columna de ordenamiento segura (whitelist estricto para evitar SQL Injection)
  const sortColumn = SORT_COLUMN_MAP[filters.sortBy] || "p.Nombre_prod";
  const sortOrder = filters.sortOrder === "desc" ? "DESC" : "ASC";

  const offset = (filters.page - 1) * filters.pageSize;
  request.input("offset", sql.Int, offset);
  request.input("pageSize", sql.Int, filters.pageSize);

  const query = `
    SELECT 
      p.Codbarras_prod,
      p.Nombre_prod,
      p.Precio,
      p.Garantia_meses,
      p.Stock,
      p.ID_estado_prod,
      e.Estado,
      p.ID_categoria,
      c.Nombre_cat AS Categoria,
      p.ID_marca,
      m.Nombre_marca AS Marca,
      ISNULL(sup.CantidadProveedores, 0) AS CantidadProveedores,
      COUNT(*) OVER() AS TotalFilteredRows
    FROM dbo.Producto p
    JOIN dbo.Estado_Prod e ON p.ID_estado_prod = e.ID_estado_prod
    JOIN dbo.Categoria c ON p.ID_categoria = c.ID_categoria
    JOIN dbo.Marca m ON p.ID_marca = m.ID_marca
    LEFT JOIN (
      SELECT Codbarras_prod, COUNT(*) AS CantidadProveedores 
      FROM dbo.Suministra 
      GROUP BY Codbarras_prod
    ) sup ON p.Codbarras_prod = sup.Codbarras_prod
    WHERE ${whereConditions.join(" AND ")}
    ORDER BY ${sortColumn} ${sortOrder}
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `;

  const result = await request.query(query);
  const rows = result.recordset;

  const totalItems = rows.length > 0 ? Number(rows[0].TotalFilteredRows) : 0;
  const totalPages = Math.ceil(totalItems / filters.pageSize) || 1;

  const items: ProductListItem[] = rows.map((row) => {
    const stock = Number(row.Stock);
    return {
      codbarras: String(row.Codbarras_prod),
      nombre: String(row.Nombre_prod),
      precio: Number(row.Precio),
      garantiaMeses: Number(row.Garantia_meses),
      stock,
      idEstado: Number(row.ID_estado_prod),
      estado: String(row.Estado),
      idCategoria: Number(row.ID_categoria),
      categoria: String(row.Categoria),
      idMarca: Number(row.ID_marca),
      marca: String(row.Marca),
      cantidadProveedores: Number(row.CantidadProveedores),
      esStockBajo: stock > 0 && stock <= 5,
      esAgotado: stock === 0,
    };
  });

  return {
    items,
    totalItems,
    totalPages,
    currentPage: filters.page,
    pageSize: filters.pageSize,
  };
}

/**
 * Obtiene la ficha técnica completa de un producto por su código de barras.
 * No duplica registros y extrae únicamente las características técnicas
 * correspondientes a la categoría real del producto.
 */
export async function findProductByBarcode(
  codbarras: string
): Promise<ProductDetail | null> {
  const pool = await getPool();

  // 1. Datos básicos del producto
  const prodReq = pool.request();
  prodReq.input("codbarras", sql.VarChar, codbarras);
  const prodRes = await prodReq.query(`
    SELECT 
      p.Codbarras_prod,
      p.Nombre_prod,
      p.Precio,
      p.Garantia_meses,
      p.Stock,
      p.ID_estado_prod,
      e.Estado,
      p.ID_categoria,
      c.Nombre_cat AS Categoria,
      p.ID_marca,
      m.Nombre_marca AS Marca
    FROM dbo.Producto p
    JOIN dbo.Estado_Prod e ON p.ID_estado_prod = e.ID_estado_prod
    JOIN dbo.Categoria c ON p.ID_categoria = c.ID_categoria
    JOIN dbo.Marca m ON p.ID_marca = m.ID_marca
    WHERE p.Codbarras_prod = @codbarras;
  `);

  if (prodRes.recordset.length === 0) {
    return null;
  }

  const p = prodRes.recordset[0];
  const stock = Number(p.Stock);
  const categoria = String(p.Categoria);

  // 2. Proveedores asociados en dbo.Suministra + dbo.Proveedor
  const provReq = pool.request();
  provReq.input("codbarras", sql.VarChar, codbarras);
  const provRes = await provReq.query(`
    SELECT 
      pr.ID_proveedor AS idProveedor,
      pr.Nombre_prov AS nombre,
      pr.Correo_prov AS correo,
      pr.Telefono_prov AS telefono,
      s.Precio_compra AS precioCompra
    FROM dbo.Suministra s
    JOIN dbo.Proveedor pr ON s.ID_proveedor = pr.ID_proveedor
    WHERE s.Codbarras_prod = @codbarras
    ORDER BY pr.Nombre_prov ASC;
  `);

  const proveedores: ProductSupplier[] = provRes.recordset.map((row) => ({
    idProveedor: Number(row.idProveedor),
    nombre: String(row.nombre),
    correo: row.correo ? String(row.correo) : null,
    telefono: row.telefono ? String(row.telefono) : null,
    precioCompra: row.precioCompra !== null ? Number(row.precioCompra) : null,
  }));

  // 3. Características técnicas según especialización
  const specs: ProductTechnicalSpecs = {};
  const specReq = pool.request();
  specReq.input("codbarras", sql.VarChar, codbarras);

  if (categoria === "CPU") {
    const cpuRes = await specReq.query(`
      SELECT Frecuencia_ghz, Nucleos 
      FROM dbo.CPU 
      WHERE Codbarras_prod = @codbarras;
    `);
    if (cpuRes.recordset.length > 0) {
      specs.cpu = {
        frecuenciaGhz: Number(cpuRes.recordset[0].Frecuencia_ghz),
        nucleos: Number(cpuRes.recordset[0].Nucleos),
      };
    }
  } else if (categoria === "RAM") {
    const ramRes = await specReq.query(`
      SELECT Capacidad_gb, Velocidad_mhz 
      FROM dbo.RAM 
      WHERE Codbarras_prod = @codbarras;
    `);
    if (ramRes.recordset.length > 0) {
      specs.ram = {
        capacidadGb: Number(ramRes.recordset[0].Capacidad_gb),
        velocidadMhz: Number(ramRes.recordset[0].Velocidad_mhz),
      };
    }
  } else if (categoria === "SSD") {
    const ssdRes = await specReq.query(`
      SELECT Capacidad_gb, Interfaz 
      FROM dbo.SSD 
      WHERE Codbarras_prod = @codbarras;
    `);
    if (ssdRes.recordset.length > 0) {
      specs.ssd = {
        capacidadGb: Number(ssdRes.recordset[0].Capacidad_gb),
        interfaz: String(ssdRes.recordset[0].Interfaz),
      };
    }
  } else if (categoria === "Grafica") {
    const gpuRes = await specReq.query(`
      SELECT Vram_gb, Chipset 
      FROM dbo.Grafica 
      WHERE Codbarras_prod = @codbarras;
    `);
    if (gpuRes.recordset.length > 0) {
      specs.grafica = {
        vramGb: Number(gpuRes.recordset[0].Vram_gb),
        chipset: String(gpuRes.recordset[0].Chipset),
      };
    }
  } else if (categoria === "Fuente de poder") {
    const psuRes = await specReq.query(`
      SELECT Potencia_w, Certificacion 
      FROM dbo.Fuente_Poder 
      WHERE Codbarras_prod = @codbarras;
    `);
    if (psuRes.recordset.length > 0) {
      specs.fuentePoder = {
        potenciaW: Number(psuRes.recordset[0].Potencia_w),
        certificacion: String(psuRes.recordset[0].Certificacion),
      };
    }
  } else if (categoria === "Gabinete") {
    const caseRes = await specReq.query(`
      SELECT Formato, Material 
      FROM dbo.Gabinete 
      WHERE Codbarras_prod = @codbarras;
    `);
    if (caseRes.recordset.length > 0) {
      specs.gabinete = {
        formato: String(caseRes.recordset[0].Formato),
        material: String(caseRes.recordset[0].Material),
      };
    }
  }

  return {
    codbarras: String(p.Codbarras_prod),
    nombre: String(p.Nombre_prod),
    precio: Number(p.Precio),
    garantiaMeses: Number(p.Garantia_meses),
    stock,
    idEstado: Number(p.ID_estado_prod),
    estado: String(p.Estado),
    idCategoria: Number(p.ID_categoria),
    categoria,
    idMarca: Number(p.ID_marca),
    marca: String(p.Marca),
    cantidadProveedores: proveedores.length,
    esStockBajo: stock > 0 && stock <= 5,
    esAgotado: stock === 0,
    proveedores,
    specs,
  };
}

/**
 * Obtiene las opciones de filtro (categorías, marcas, estados) con sus respectivos conteos.
 */
export async function getFilterMetadata(): Promise<ProductFilterMetadata> {
  const pool = await getPool();

  const [catRes, marcaRes, estadoRes, provRes, totalRes] = await Promise.all([
    pool.request().query(`
      SELECT 
        c.ID_categoria AS id,
        c.Nombre_cat AS nombre,
        COUNT(p.Codbarras_prod) AS count
      FROM dbo.Categoria c
      LEFT JOIN dbo.Producto p ON c.ID_categoria = p.ID_categoria
      GROUP BY c.ID_categoria, c.Nombre_cat
      ORDER BY c.Nombre_cat ASC;
    `),
    pool.request().query(`
      SELECT 
        m.ID_marca AS id,
        m.Nombre_marca AS nombre,
        COUNT(p.Codbarras_prod) AS count
      FROM dbo.Marca m
      LEFT JOIN dbo.Producto p ON m.ID_marca = p.ID_marca
      GROUP BY m.ID_marca, m.Nombre_marca
      ORDER BY m.Nombre_marca ASC;
    `),
    pool.request().query(`
      SELECT 
        e.ID_estado_prod AS id,
        e.Estado AS nombre,
        COUNT(p.Codbarras_prod) AS count
      FROM dbo.Estado_Prod e
      LEFT JOIN dbo.Producto p ON e.ID_estado_prod = p.ID_estado_prod
      GROUP BY e.ID_estado_prod, e.Estado
      ORDER BY e.Estado ASC;
    `),
    pool.request().query(`
      SELECT 
        ID_proveedor AS id,
        Nombre_prov AS nombre
      FROM dbo.Proveedor
      ORDER BY Nombre_prov ASC;
    `),
    pool.request().query("SELECT COUNT(*) AS total FROM dbo.Producto;"),
  ]);

  return {
    categorias: catRes.recordset.map((r) => ({
      id: Number(r.id),
      nombre: String(r.nombre),
      count: Number(r.count),
    })),
    marcas: marcaRes.recordset.map((r) => ({
      id: Number(r.id),
      nombre: String(r.nombre),
      count: Number(r.count),
    })),
    estados: estadoRes.recordset.map((r) => ({
      id: Number(r.id),
      nombre: String(r.nombre),
      count: Number(r.count),
    })),
    proveedoresDisponibles: provRes.recordset.map((r) => ({
      id: Number(r.id),
      nombre: String(r.nombre),
    })),
    totalCatalog: Number(totalRes.recordset[0]?.total || 0),
  };
}

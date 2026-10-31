import sql from "mssql";
import { getPool } from "@/lib/db";
import { assertMutationsAllowed } from "@/lib/db-guard";
import {
  CreateProductInput,
  UpdateProductInput,
} from "@/lib/validations/product-mutation.schema";

/**
 * Inserta un producto con su especialización técnica y proveedores en una ÚNICA transacción SQL.
 * Garantiza atomicidad total: si alguna tabla secundaria falla, se ejecuta ROLLBACK completo.
 */
export async function createProductTransactional(
  input: CreateProductInput
): Promise<{ success: boolean; codbarras: string }> {
  // 1. Verificación estricta de protección de base académica
  assertMutationsAllowed("Crear Producto");

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // 2. Verificar si el código de barras ya existe
    const checkReq = new sql.Request(transaction);
    checkReq.input("codbarras", sql.VarChar(13), input.codbarras);
    const existing = await checkReq.query(`
      SELECT Codbarras_prod FROM dbo.Producto WHERE Codbarras_prod = @codbarras
    `);

    if (existing.recordset.length > 0) {
      throw new Error(
        `El código de barras '${input.codbarras}' ya se encuentra registrado en el catálogo.`
      );
    }

    // 3. Obtener el nombre de la categoría para determinar la tabla técnica
    const catReq = new sql.Request(transaction);
    catReq.input("idCategoria", sql.Int, input.idCategoria);
    const catRes = await catReq.query(`
      SELECT Nombre_cat FROM dbo.Categoria WHERE ID_categoria = @idCategoria
    `);

    if (catRes.recordset.length === 0) {
      throw new Error(`La categoría con ID ${input.idCategoria} no existe.`);
    }

    const categoriaNombre = String(catRes.recordset[0].Nombre_cat).trim();

    // 4. Resolver dinámicamente el estado para productos nuevos con Stock = 0 (Coherencia con estado 'Agotado')
    let estadoInicialId = input.idEstado;
    if (!estadoInicialId) {
      const agotadoReq = new sql.Request(transaction);
      const agotadoRes = await agotadoReq.query(`
        SELECT ID_estado_prod FROM dbo.Estado_Prod WHERE LOWER(Estado) LIKE '%agotado%'
      `);
      estadoInicialId = agotadoRes.recordset.length > 0
        ? Number(agotadoRes.recordset[0].ID_estado_prod)
        : 2;
    }

    // 5. Inserción en dbo.Producto (Stock inicial siempre en 0 para Fase 3B)
    const prodReq = new sql.Request(transaction);
    prodReq.input("codbarras", sql.VarChar(13), input.codbarras);
    prodReq.input("nombre", sql.VarChar(120), input.nombre);
    prodReq.input("precio", sql.Decimal(10, 2), input.precio);
    prodReq.input("garantia", sql.Int, input.garantiaMeses);
    prodReq.input("stock", sql.Int, 0);
    prodReq.input("idEstado", sql.Int, estadoInicialId);
    prodReq.input("idCategoria", sql.Int, input.idCategoria);
    prodReq.input("idMarca", sql.Int, input.idMarca);

    await prodReq.query(`
      INSERT INTO dbo.Producto (
        Codbarras_prod, Nombre_prod, Precio, Garantia_meses, Stock,
        ID_estado_prod, ID_categoria, ID_marca
      ) VALUES (
        @codbarras, @nombre, @precio, @garantia, @stock,
        @idEstado, @idCategoria, @idMarca
      );
    `);

    // 6. Inserción obligatoria en la especialización técnica correspondiente
    const specReq = new sql.Request(transaction);
    specReq.input("codbarras", sql.VarChar(13), input.codbarras);

    if (categoriaNombre === "CPU") {
      if (!input.specs.cpu) {
        throw new Error("Debe ingresar las características técnicas requeridas para CPU (Frecuencia y Núcleos).");
      }
      specReq.input("freq", sql.Decimal(4, 2), input.specs.cpu.frecuenciaGhz);
      specReq.input("nucleos", sql.Int, input.specs.cpu.nucleos);
      await specReq.query(`
        INSERT INTO dbo.CPU (Codbarras_prod, Frecuencia_ghz, Nucleos)
        VALUES (@codbarras, @freq, @nucleos);
      `);
    } else if (categoriaNombre === "RAM") {
      if (!input.specs.ram) {
        throw new Error("Debe ingresar las características técnicas requeridas para RAM (Capacidad y Velocidad).");
      }
      specReq.input("cap", sql.Int, input.specs.ram.capacidadGb);
      specReq.input("vel", sql.Int, input.specs.ram.velocidadMhz);
      await specReq.query(`
        INSERT INTO dbo.RAM (Codbarras_prod, Capacidad_gb, Velocidad_mhz)
        VALUES (@codbarras, @cap, @vel);
      `);
    } else if (categoriaNombre === "SSD") {
      if (!input.specs.ssd) {
        throw new Error("Debe ingresar las características técnicas requeridas para SSD (Capacidad e Interfaz).");
      }
      specReq.input("cap", sql.Int, input.specs.ssd.capacidadGb);
      specReq.input("interfaz", sql.VarChar(20), input.specs.ssd.interfaz);
      await specReq.query(`
        INSERT INTO dbo.SSD (Codbarras_prod, Capacidad_gb, Interfaz)
        VALUES (@codbarras, @cap, @interfaz);
      `);
    } else if (categoriaNombre === "Grafica") {
      if (!input.specs.grafica) {
        throw new Error("Debe ingresar las características técnicas requeridas para Tarjeta Gráfica (VRAM y Chipset).");
      }
      specReq.input("vram", sql.Int, input.specs.grafica.vramGb);
      specReq.input("chipset", sql.VarChar(50), input.specs.grafica.chipset);
      await specReq.query(`
        INSERT INTO dbo.Grafica (Codbarras_prod, Vram_gb, Chipset)
        VALUES (@codbarras, @vram, @chipset);
      `);
    } else if (categoriaNombre === "Fuente de poder") {
      if (!input.specs.fuentePoder) {
        throw new Error("Debe ingresar las características técnicas requeridas para Fuente de Poder (Potencia y Certificación).");
      }
      specReq.input("potencia", sql.Int, input.specs.fuentePoder.potenciaW);
      specReq.input("cert", sql.VarChar(30), input.specs.fuentePoder.certificacion);
      await specReq.query(`
        INSERT INTO dbo.Fuente_Poder (Codbarras_prod, Potencia_w, Certificacion)
        VALUES (@codbarras, @potencia, @cert);
      `);
    } else if (categoriaNombre === "Gabinete") {
      if (!input.specs.gabinete) {
        throw new Error("Debe ingresar las características técnicas requeridas para Gabinete (Formato y Material).");
      }
      specReq.input("formato", sql.VarChar(20), input.specs.gabinete.formato);
      specReq.input("material", sql.VarChar(30), input.specs.gabinete.material);
      await specReq.query(`
        INSERT INTO dbo.Gabinete (Codbarras_prod, Formato, Material)
        VALUES (@codbarras, @formato, @material);
      `);
    } else {
      throw new Error(`Categoría '${categoriaNombre}' no tiene tabla de especialización configurada.`);
    }

    // 6. Inserción de asociaciones en dbo.Suministra si se especificaron
    if (input.proveedores && input.proveedores.length > 0) {
      for (const prov of input.proveedores) {
        const supReq = new sql.Request(transaction);
        supReq.input("codbarras", sql.VarChar(13), input.codbarras);
        supReq.input("idProv", sql.Int, prov.idProveedor);
        supReq.input("costo", sql.Decimal(10, 2), prov.precioCompra);
        await supReq.query(`
          INSERT INTO dbo.Suministra (Codbarras_prod, ID_proveedor, Precio_compra)
          VALUES (@codbarras, @idProv, @costo);
        `);
      }
    }

    // Confirmar transacción atómica
    await transaction.commit();
    return { success: true, codbarras: input.codbarras };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rbErr) {
      console.error("Error durante rollback:", rbErr);
    }
    throw error;
  }
}

/**
 * Modifica un producto existente de forma transaccional.
 * No permite modificar código de barras, stock ni categoría.
 */
export async function updateProductTransactional(
  input: UpdateProductInput
): Promise<{ success: boolean; codbarras: string }> {
  assertMutationsAllowed("Editar Producto");

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // 1. Verificar existencia y obtener categoría actual
    const checkReq = new sql.Request(transaction);
    checkReq.input("codbarras", sql.VarChar(13), input.codbarras);
    const prodRes = await checkReq.query(`
      SELECT p.Codbarras_prod, c.Nombre_cat AS Categoria
      FROM dbo.Producto p
      JOIN dbo.Categoria c ON p.ID_categoria = c.ID_categoria
      WHERE p.Codbarras_prod = @codbarras;
    `);

    if (prodRes.recordset.length === 0) {
      throw new Error(`Producto con código '${input.codbarras}' no encontrado.`);
    }

    const categoria = String(prodRes.recordset[0].Categoria).trim();

    // 2. Actualizar datos base en dbo.Producto (sin alterar Stock ni ID_categoria)
    const updateProdReq = new sql.Request(transaction);
    updateProdReq.input("codbarras", sql.VarChar(13), input.codbarras);
    updateProdReq.input("nombre", sql.VarChar(120), input.nombre);
    updateProdReq.input("precio", sql.Decimal(10, 2), input.precio);
    updateProdReq.input("garantia", sql.Int, input.garantiaMeses);
    updateProdReq.input("idMarca", sql.Int, input.idMarca);
    updateProdReq.input("idEstado", sql.Int, input.idEstado);

    await updateProdReq.query(`
      UPDATE dbo.Producto
      SET 
        Nombre_prod = @nombre,
        Precio = @precio,
        Garantia_meses = @garantia,
        ID_marca = @idMarca,
        ID_estado_prod = @idEstado
      WHERE Codbarras_prod = @codbarras;
    `);

    // 3. Actualizar la especialización técnica correspondiente
    const specReq = new sql.Request(transaction);
    specReq.input("codbarras", sql.VarChar(13), input.codbarras);

    if (categoria === "CPU" && input.specs.cpu) {
      specReq.input("freq", sql.Decimal(4, 2), input.specs.cpu.frecuenciaGhz);
      specReq.input("nucleos", sql.Int, input.specs.cpu.nucleos);
      await specReq.query(`
        UPDATE dbo.CPU
        SET Frecuencia_ghz = @freq, Nucleos = @nucleos
        WHERE Codbarras_prod = @codbarras;
      `);
    } else if (categoria === "RAM" && input.specs.ram) {
      specReq.input("cap", sql.Int, input.specs.ram.capacidadGb);
      specReq.input("vel", sql.Int, input.specs.ram.velocidadMhz);
      await specReq.query(`
        UPDATE dbo.RAM
        SET Capacidad_gb = @cap, Velocidad_mhz = @vel
        WHERE Codbarras_prod = @codbarras;
      `);
    } else if (categoria === "SSD" && input.specs.ssd) {
      specReq.input("cap", sql.Int, input.specs.ssd.capacidadGb);
      specReq.input("interfaz", sql.VarChar(20), input.specs.ssd.interfaz);
      await specReq.query(`
        UPDATE dbo.SSD
        SET Capacidad_gb = @cap, Interfaz = @interfaz
        WHERE Codbarras_prod = @codbarras;
      `);
    } else if (categoria === "Grafica" && input.specs.grafica) {
      specReq.input("vram", sql.Int, input.specs.grafica.vramGb);
      specReq.input("chipset", sql.VarChar(50), input.specs.grafica.chipset);
      await specReq.query(`
        UPDATE dbo.Grafica
        SET Vram_gb = @vram, Chipset = @chipset
        WHERE Codbarras_prod = @codbarras;
      `);
    } else if (categoria === "Fuente de poder" && input.specs.fuentePoder) {
      specReq.input("potencia", sql.Int, input.specs.fuentePoder.potenciaW);
      specReq.input("cert", sql.VarChar(30), input.specs.fuentePoder.certificacion);
      await specReq.query(`
        UPDATE dbo.Fuente_Poder
        SET Potencia_w = @potencia, Certificacion = @cert
        WHERE Codbarras_prod = @codbarras;
      `);
    } else if (categoria === "Gabinete" && input.specs.gabinete) {
      specReq.input("formato", sql.VarChar(20), input.specs.gabinete.formato);
      specReq.input("material", sql.VarChar(30), input.specs.gabinete.material);
      await specReq.query(`
        UPDATE dbo.Gabinete
        SET Formato = @formato, Material = @material
        WHERE Codbarras_prod = @codbarras;
      `);
    }

    // 4. Actualizar proveedores: reemplazar asociaciones en dbo.Suministra
    const delSupReq = new sql.Request(transaction);
    delSupReq.input("codbarras", sql.VarChar(13), input.codbarras);
    await delSupReq.query(`DELETE FROM dbo.Suministra WHERE Codbarras_prod = @codbarras`);

    if (input.proveedores && input.proveedores.length > 0) {
      for (const prov of input.proveedores) {
        const insSupReq = new sql.Request(transaction);
        insSupReq.input("codbarras", sql.VarChar(13), input.codbarras);
        insSupReq.input("idProv", sql.Int, prov.idProveedor);
        insSupReq.input("costo", sql.Decimal(10, 2), prov.precioCompra);
        await insSupReq.query(`
          INSERT INTO dbo.Suministra (Codbarras_prod, ID_proveedor, Precio_compra)
          VALUES (@codbarras, @idProv, @costo);
        `);
      }
    }

    await transaction.commit();
    return { success: true, codbarras: input.codbarras };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rbErr) {
      console.error("Error durante rollback en actualización:", rbErr);
    }
    throw error;
  }
}

/**
 * Descontinúa un producto (Baja Lógica).
 * Resuelve dinámicamente el ID del estado "Descontinuado" desde dbo.Estado_Prod.
 * No elimina físicamente el registro para preservar histórico de ventas e inventario.
 */
export async function discontinueProductLogical(
  codbarras: string
): Promise<{ success: boolean; codbarras: string; estadoNombre: string }> {
  assertMutationsAllowed("Descontinuar Producto");

  const pool = await getPool();

  // 1. Resolver dinámicamente el ID para "Descontinuado" sin asumir un ID fijo
  const stateRes = await pool.request().query(`
    SELECT ID_estado_prod, Estado 
    FROM dbo.Estado_Prod 
    WHERE LOWER(Estado) LIKE '%descontinuado%'
  `);

  if (stateRes.recordset.length === 0) {
    throw new Error(
      "No se encontró el estado 'Descontinuado' en la tabla dbo.Estado_Prod de la base de datos."
    );
  }

  const idDescontinuado = Number(stateRes.recordset[0].ID_estado_prod);
  const estadoNombre = String(stateRes.recordset[0].Estado);

  // 2. Ejecutar la actualización del estado
  const updateReq = pool.request();
  updateReq.input("codbarras", sql.VarChar(13), codbarras);
  updateReq.input("idEstado", sql.Int, idDescontinuado);

  const result = await updateReq.query(`
    UPDATE dbo.Producto
    SET ID_estado_prod = @idEstado
    WHERE Codbarras_prod = @codbarras;
  `);

  if (result.rowsAffected[0] === 0) {
    throw new Error(`Producto con código '${codbarras}' no encontrado.`);
  }

  return { success: true, codbarras, estadoNombre };
}

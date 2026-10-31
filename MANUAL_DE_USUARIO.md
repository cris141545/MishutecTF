# MANUAL DE USUARIO — MISHUTEC SISTEMA POS Y GESTIÓN COMERCIAL

**Versión:** 10.2 (Edición Oficial 2026)  
**Entorno de Datos:** SQL Server (`MishutecT2_Aceptacion`)  
**Compatibilidad:** Next.js 16, React, TypeScript, Tailwind CSS  

---

## ÍNDICE GENERAL

1. [Introducción y Acceso al Sistema](#1-introducción-y-acceso-al-sistema)
2. [Conmutador de Tema: Modo Claro y Modo Oscuro (Circular Reveal)](#2-conmutador-de-tema-modo-claro-y-modo-oscuro-circular-reveal)
3. [Módulo de Ventas y Terminal POS con IGV 2026](#3-módulo-de-ventas-y-terminal-pos-con-igv-2026)
4. [Gestión de Caja Chica y Cierre Diario](#4-gestión-de-caja-chica-y-cierre-diario)
5. [Gestión de Egresos: Cuentas por Pagar a Proveedores](#5-gestión-de-egresos-cuentas-por-pagar-a-proveedores)
6. [Gestión de Egresos: Obligaciones y Pagos al Personal](#6-gestión-de-egresos-obligaciones-y-pagos-al-personal)
7. [Módulo de Devoluciones y Notas de Crédito](#7-módulo-de-devoluciones-y-notas-de-crédito)
8. [Reportes Financieros, Rentabilidad y Liquidación Tributaria](#8-reportes-financieros-rentabilidad-y-liquidación-tributaria)
9. [Preguntas Frecuentes y Buenas Prácticas](#9-preguntas-frecuentes-y-buenas-prácticas)

---

## 1. INTRODUCCIÓN Y ACCESO AL SISTEMA

MISHUTEC es una plataforma integral de gestión comercial diseñada para optimizar los flujos de venta, inventario en tiempo real, arqueo de caja física y bancarizada, control de deudas con proveedores, pagos al personal y reportes tributarios referenciales bajo la normativa comercial peruana 2026.

### Acceso a la Plataforma
- **Dirección Local:** `http://localhost:3000`
- **Rutas Principales:**
  - `/ventas`: Terminal Punto de Venta (POS) transaccional.
  - `/caja`: Control de turnos, arqueo, egresos consolidados y cierres.
  - `/proveedores`: Directorio comercial y cuentas por pagar.
  - `/empleados`: Directorio de colaboradores y obligaciones salariales.
  - `/devoluciones`: Circuito de garantías, RMA y notas de crédito.
  - `/reportes`: Panel analítico de rentabilidad, COGS y liquidación SUNAT.

---

## 2. CONMUTADOR DE TEMA: MODO CLARO Y MODO OSCURO (CIRCULAR REVEAL)

El sistema incorpora un diseño visual moderno con soporte integral para modo claro y modo oscuro de alto contraste (WCAG AA).

### ¿Cómo cambiar de tema?
1. Ubica el botón **«Modo Claro / Modo Oscuro»** en la esquina superior derecha del encabezado.
2. Haz clic sobre el botón.
3. Observarás una animación fluida de **Circular Reveal**: una máscara circular se expande radialmente desde el icono del botón cubriendo suavemente toda la pantalla (duración 350-450 ms).
4. El tema elegido queda automáticamente guardado en tu navegador (`localStorage`), de modo que al recargar la página o volver a iniciar sesión, tu preferencia se conservará sin parpadeos blancos molestos (cero FOUC).

> **Accesibilidad:** Si tu sistema operativo tiene activada la opción de "reducir movimiento" (`prefers-reduced-motion`), la animación se adaptará automáticamente a una transición instantánea para tu comodidad.

---

## 3. MÓDULO DE VENTAS Y TERMINAL POS CON IGV 2026

### 3.1 Tratamiento de Precios e Impuestos
En MISHUTEC, los precios de los productos mostrados en el catálogo **ya incluyen el impuesto general a las ventas**.
De acuerdo con la legislación tributaria peruana vigente para 2026 (Régimen General y MYPE Tributario):
- **IGV (Impuesto General a las Ventas):** 15.5%
- **IPM (Impuesto de Promoción Municipal):** 2.5%
- **Tasa Conjunta Aplicable:** 18.0%

$$\text{Base Imponible} = \text{Redondear}\left(\frac{\text{Total}}{1.18}, 2\right)$$
$$\text{IGV (15.5\%)} = \text{Redondear}(\text{Base Imponible} \times 0.155, 2)$$
$$\text{IPM (2.5\%)} = \text{Redondear}(\text{Total} - \text{Base Imponible} - \text{IGV}, 2)$$

> **Regla de Oro:** El sistema **nunca sumará otro 18%** sobre los precios de catálogo. Desglosa con exactitud matemática de céntimos la Base Imponible y los impuestos correspondientes.

### 3.2 Paso a Paso para Emitir una Venta
1. Dirígete a `/ventas`.
2. En la columna izquierda, busca o escanea el producto deseado (ej. *AMD Ryzen 7 5700X*).
3. Haz clic en **«Añadir»**. Ajusta la cantidad deseada con los botones `+` y `-`.
4. En el panel lateral derecho:
   - Selecciona el tipo de comprobante: **Boleta (B001)** o **Factura (F001)**.
   - Selecciona el **Cliente** y el **Empleado** responsable.
   - En **Distribución de Pago**, puedes ingresar:
     - **Efectivo:** Ingresa el monto recibido (ej. si la orden es S/ 2,400 e ingresas S/ 2,500, el sistema calculará un vuelto de S/ 100).
     - **Yape / Tarjetas:** Haz clic en *«+ Añadir método»* para realizar pagos mixtos (ej. S/ 1,000 en Yape y S/ 1,400 en Efectivo).
5. Observa el **Resumen Comercial**:
   - Subtotal
   - Descuentos
   - Base Imponible (Gravada)
   - IGV (15.5%) + IPM (2.5%)
   - Total General a Pagar
6. Haz clic en **«Confirmar Venta y Generar Comprobante»**.
7. En el modal emergente de pre-confirmación, revisa el resumen y haz clic en **«Confirmar Transacción»**.
8. Se emitirá el **Comprobante Comercial** con su correlativo consecutivo auditado, desglose legal y opción de impresión térmica o A4.

---

## 4. GESTIÓN DE CAJA CHICA Y CIERRE DIARIO

### 4.1 Apertura de Turno
1. Ingresa a `/caja`.
2. Si no hay sesión activa, haz clic en **«Aperturar Turno de Caja»**.
3. Selecciona el cajero responsable e indica el **Fondo Fijo Inicial** (ej. S/ 500.00).
4. El sistema inicia la sesión en estado `ABIERTA`.

### 4.2 Canales Físicos vs Digitales
El panel de caja mantiene estricta separación de los fondos:
- **Efectivo en Gaveta:** Suma las ventas en efectivo y resta los gastos operativos, devoluciones en efectivo y pagos a proveedores o personal realizados en efectivo.
- **Canales Digitales (Yape, Tarjetas, Transferencias):** Se auditan de forma independiente en sus tarjetas de canal (`Afecta_efectivo = 0`), sin inflar ni descuadrar la gaveta física.

### 4.3 Arqueo y Cierre Diario
1. Haz clic en **«Arqueo de Caja»** para abrir la calculadora de monedas y billetes peruanos (S/ 200, S/ 100, S/ 50, S/ 20, S/ 10, S/ 5, S/ 2, S/ 1, S/ 0.50, S/ 0.20, S/ 0.10).
2. El sistema comparará el **Efectivo Contado** con el **Efectivo Esperado**.
3. Haz clic en **«Cerrar Turno de Caja»** para inmutabilizar la sesión (`Estado = CERRADA`). Se emitirá el **Acta de Cierre Diario** oficial.

---

## 5. GESTIÓN DE EGRESOS: CUENTAS POR PAGAR A PROVEEDORES

El sistema permite gestionar íntegramente las adquisiciones de mercadería y servicios de proveedores, diferenciando compras al contado de compras a crédito.

### 5.1 Registro de Compras a Proveedores
1. Desde `/inventario`, haz clic en **«Registrar Compra»**. También puedes iniciar la compra desde el botón **«Comprar»** del producto correspondiente.
2. Completa el formulario:
   - Proveedor y número de factura/documento.
   - Uno o más productos asociados al catálogo del proveedor, cantidad y costo unitario.
   - Fecha de compra, vencimiento y empleado responsable de recibirla.
   - Condición **Crédito** o **Contado**. Contado exige pagar el total; crédito permite registrar un pago inicial o dejar todo el saldo pendiente.
3. Confirma la compra. En una transacción, el sistema aumenta existencias, genera movimientos de entrada en el Kardex, conserva el detalle asociado a la factura y crea la cuenta por pagar. No se permiten entradas manuales de inventario.
4. Si registras un pago inicial, debe haber una sesión de Caja abierta. El efectivo se descuenta de la gaveta; pagos por medios digitales se registran como egresos del canal, sin afectar el efectivo físico.

> Los productos deben estar previamente asociados al proveedor en su catálogo. En `/caja` se consultan las cuentas por pagar y se registran sus abonos; la compra se inicia siempre desde Inventario.
> Para habilitar el detalle de compras, aplica `scripts/migrations/phase10_3_detalle_compras_proveedor.sql` después de las migraciones de Caja, fase 10.1 y Cuentas por Pagar.

### 5.2 Registro de Abonos y Liquidación
1. En la lista de **Cuentas por Pagar**, identifica la obligación y haz clic en **«Abonar / Pagar»**.
2. Ingresa el monto a pagar (ej. S/ 500.00).
3. Con una sesión de Caja abierta, selecciona el medio de pago:
   - **Efectivo:** Descuenta de la gaveta de caja activa.
   - **Yape / Transferencia:** Registra el egreso bancarizado sin afectar la gaveta física.
4. Ingresa el número de referencia u operación bancaria.
5. Haz clic en **«Confirmar Pago»**.
6. El sistema actualizará el saldo en tiempo real (`Saldo = S/ 1,500.00`) y cambiará el estado a `PARCIALMENTE PAGADA`. Al completar el 100%, pasará automáticamente a `PAGADA`.

> **Control Contable Anti-Doble Gasto:** La adquisición de mercadería alimenta el inventario y se reconoce en el Costo de Ventas (COGS) al venderse. El pago al proveedor únicamente cancela el pasivo financiero en caja/bancos, garantizando que el egreso no se reste dos veces de la utilidad del negocio.

---

## 6. GESTIÓN DE EGRESOS: OBLIGACIONES Y PAGOS AL PERSONAL

### 6.1 Registro de Obligación Laboral Pactada
1. En `/caja` → **«Gestión de Egresos»**, dirígete a la subpestaña **«Trabajadores»**.
2. Haz clic en **«Nueva Obligación Laboral»**.
3. Selecciona el colaborador (ej. *Juan Pérez*), el período (ej. *Octubre 2026*) y la remuneración pactada (ej. S/ 1,500.00).
4. El compromiso queda registrado en estado `PENDIENTE`.

### 6.2 Registro de Adelantos y Liquidación Salarial
1. Para abonar un adelanto:
   - Haz clic en **«Registrar Pago»** sobre la obligación.
   - Marca la casilla **«Es adelanto de haberes»**.
   - Ingresa el importe (ej. S/ 300.00) y el medio de pago.
   - Haz clic en **«Confirmar Pago»**.
2. El saldo pendiente disminuirá a S/ 1,200.00 en estado `PARCIALMENTE PAGADA`.
3. Al finalizar el mes, abona el saldo restante (S/ 1,200.00). La obligación quedará formalmente `PAGADA` con trazabilidad completa de fechas, responsables y medios.

---

## 7. MÓDULO DE DEVOLUCIONES Y NOTAS DE CRÉDITO

1. Accede a `/devoluciones`.
2. Para registrar una devolución, haz clic en **«Nueva Devolución»** e ingresa el correlativo de venta original (ej. `B001-000048`).
3. Selecciona los productos devueltos y su motivo (Falla técnica, Desistimiento, etc.).
4. Al aprobar la devolución:
   - Si el producto está operativo, se reincorpora al inventario físico en Kardex.
   - Se emite una **Nota de Crédito** formal (`NC01-XXXXXX`) con ajuste proporcional del IGV histórico.
   - Se genera la **Constancia de Devolución Comercial** para el cliente.
   - La venta original actualiza su estado a `PARCIALMENTE DEVUELTA` o `TOTALMENTE DEVUELTA`.

---

## 8. REPORTES FINANCIEROS, RENTABILIDAD Y LIQUIDACIÓN TRIBUTARIA

En `/reportes`:
- **Ventas Netas y Ganancia Bruta:** Calcula ingresos netos menos el Costo de Ventas (COGS) real de las unidades vendidas.
- **Utilidad Operativa:** Descuenta gastos operativos y remuneraciones devengadas sin duplicar compras de inventario.
- **Resumen Tributario SUNAT Formulario 621 (Referencial):**
  - Débito Fiscal del 18.0% (15.5% IGV + 2.5% IPM) neto de notas de crédito.
  - Crédito Fiscal de compras sustentadas con factura.
  - Saldo del período a pagar o saldo a favor.
- **Exportación:** Descarga de reportes en formato CSV compatible con Microsoft Excel (UTF-8 BOM).

---

## 9. PREGUNTAS FRECUENTES Y BUENAS PRÁCTICAS

1. **¿Por qué un pago por Yape o Transferencia no disminuye el efectivo en gaveta?**  
   Porque el dinero ingresa o sale de las cuentas bancarias o billeteras de la empresa, no de la caja registradora física. La separación garantiza que al contar los billetes al final del turno, el cuadre sea exacto.

2. **¿Qué ocurre si intento abonar a un proveedor un importe mayor al saldo de su factura?**  
   El sistema bloqueará la operación con una alerta descriptiva, evitando saldos negativos o sobrepagos no autorizados.

3. **¿El sistema declara automáticamente a SUNAT?**  
   No. Todos los reportes y comprobantes generados son para control administrativo y comercial interno. Llevan la leyenda explícita obligatoria: *"No constituye comprobante de pago electrónico SUNAT"*.

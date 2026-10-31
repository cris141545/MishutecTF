# Publicar Mishutec en Azure

Esta guía prepara una instalación compartida por internet con Azure App Service,
Azure SQL y cuentas individuales. La aplicación no debe conectarse al SQL Server
de una computadora personal: la web y la base de datos deben quedar alojadas en
Azure. Los cambios de datos se compartirán entre todas las cuentas.

## Requisitos

- Si no tienes tarjeta, la opción oficial es **Azure for Students**, disponible
  para estudiantes cuya institución pueda verificar su elegibilidad. Ofrece
  crédito por 12 meses sin tarjeta y es para aprendizaje/desarrollo/demostración
  no comercial. Selecciona la suscripción completa **Azure for Students**, no
  **Azure for Students Starter**. Si no calificas, Azure normalmente pide una
  tarjeta para abrir una suscripción estándar.
- La oferta gratuita de Azure SQL puede incluir hasta 100.000 vCore-segundos,
  32 GB de datos y 32 GB de copias de seguridad al mes. Al crear la base,
  selecciona el comportamiento de pausa automática al alcanzar el límite; no
  elijas uso adicional facturable. La disponibilidad depende de la suscripción.
- App Service **F1** no tiene SLA y está destinado a pruebas/aprendizaje, no a
  producción. Comprueba que el plan seleccionado diga **Free/F1** antes de
  crear recursos; no cambies a una oferta de pago si quieres evitar cargos.
- Acceso autorizado a la base de datos que se migrará.
- Node.js 22 LTS para compilar localmente y una cuenta de GitHub para el
  despliegue continuo.

## 1. Preparar Azure SQL

1. Crea un servidor lógico de Azure SQL y una base de datos llamada, por
   ejemplo, `MishutecProduccion`.
2. No migres la base académica `MishutecT2` como base de producción: el proyecto
   bloquea intencionalmente sus mutaciones. Migra únicamente una base autorizada
   para uso operativo y verifica previamente que sus datos puedan publicarse.
3. Migra el esquema y los datos de las tablas que usa Mishutec desde SQL Server
   Express a Azure SQL Database. Haz una copia de respaldo antes, valida que las
   tablas, relaciones y datos se hayan transferido, y prueba las operaciones de
   venta, inventario, caja y devoluciones con datos de prueba. Azure SQL no
   admite todas las características de SQL Server; revisa cualquier error que
   reporte la herramienta de migración.
4. Ejecuta `scripts/migrations/phase11_user_accounts.sql` en la base destino.
   Esta migración crea la tabla de cuentas adicionales.
5. Conéctate a la base destino como administrador y crea un usuario SQL
   dedicado para la aplicación. Sustituye el marcador por una contraseña única
   que guardarás como `DB_PASSWORD` en Azure:

   ```sql
   CREATE USER [mishutec_app] WITH PASSWORD = '<contraseña-generada>';
   ALTER ROLE db_datareader ADD MEMBER [mishutec_app];
   ALTER ROLE db_datawriter ADD MEMBER [mishutec_app];
   ```

   No le asignes `db_owner` ni uses las credenciales del administrador del
   servidor SQL.

No habilites el acceso público irrestricto a SQL Server. En el firewall de
Azure SQL permite solo las direcciones de salida del App Service, o usa una
integración de red privada si tu configuración de Azure lo permite.

## 2. Preparar el primer administrador

El administrador inicial se configura con variables privadas del App Service.
Genera un hash de contraseña localmente:

```powershell
npx tsx scripts/generate-admin-hash.ts 'Una contraseña larga y única'
```

Genera también `AUTH_SESSION_SECRET` localmente, sin compartirlo:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Guarda ambos valores en un gestor de contraseñas y configura sus valores como
variables de entorno del App Service. No guardes contraseñas ni secretos en
GitHub, en `.env.example` ni en el código.

## 3. Publicar la aplicación

1. Sube el código a un repositorio privado de GitHub.
2. Crea un Azure App Service para **Linux** con Node.js 22 LTS y plan
   **Free/F1** si está disponible en tu suscripción. Conéctalo al repositorio.
3. Configura el comando de compilación `npm run build` y el comando de inicio
   `npm start`. La aplicación necesita un servidor Node.js; no la publiques
   como exportación estática.
4. En **Configuration / Environment variables** del App Service configura:

   | Variable | Valor |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `DB_AUTH_MODE` | `sql` |
   | `DB_SERVER` | `<servidor>.database.windows.net` |
   | `DB_NAME` | Nombre de la base migrada, distinto de `MishutecT2` |
   | `DB_USER` | Usuario SQL dedicado a la aplicación |
   | `DB_PASSWORD` | Contraseña de ese usuario SQL |
   | `DB_TRUST_SERVER_CERTIFICATE` | `no` |
   | `ADMIN_USERNAME` | Nombre elegido para el administrador inicial |
   | `ADMIN_PASSWORD_HASH` | Hash generado en el paso anterior |
   | `AUTH_SESSION_SECRET` | Secreto aleatorio de al menos 32 caracteres |

   Configura los secretos como variables privadas en Azure, no como valores
   `NEXT_PUBLIC_*`.
5. Habilita **HTTPS Only** en App Service, revisa los registros de inicio y
   comprueba `/api/db-status`. El endpoint informa el estado de conexión, no
   debe usarse como sustituto de una prueba de escritura/lectura autenticada.
6. Inicia sesión con el administrador inicial, abre `/usuarios` y crea una
   cuenta distinta para cada persona. No hay registro público; las cuentas
   individuales pueden operar los módulos, y solo el administrador inicial
   puede crear, desactivar o reactivar usuarios.

## 4. Antes de compartir el enlace

- Comprueba con dos cuentas que ambas ven los mismos datos y que una cuenta
  desactivada ya no puede seguir operando.
- Haz una prueba de venta/inventario controlada; no uses registros reales para
  probar.
- Revisa los costos y activa los respaldos de Azure SQL.
- Comparte el enlace solo con personas autorizadas. Cualquiera en internet podrá
  abrir la página de inicio de sesión, pero no podrá editar sin una cuenta.

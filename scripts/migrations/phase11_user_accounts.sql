-- Cuentas individuales de Mishutec. Ejecutar una sola vez en la base de datos
-- de la aplicación antes de habilitar cuentas adicionales.
IF OBJECT_ID(N'dbo.AppUser', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AppUser (
        UserId INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_AppUser PRIMARY KEY,
        Username NVARCHAR(50) NOT NULL,
        PasswordHash VARCHAR(200) NOT NULL,
        Role VARCHAR(10) NOT NULL
            CONSTRAINT DF_AppUser_Role DEFAULT 'user',
        IsActive BIT NOT NULL
            CONSTRAINT DF_AppUser_IsActive DEFAULT 1,
        CreatedAt DATETIME2(0) NOT NULL
            CONSTRAINT DF_AppUser_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_AppUser_Username UNIQUE (Username),
        CONSTRAINT CK_AppUser_Role CHECK (Role IN ('admin', 'user'))
    );
END;
GO

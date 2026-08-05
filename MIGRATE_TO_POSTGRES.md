# Migración a PostgreSQL

Cuando el sistema requiera soportar **millones de registros y múltiples usuarios concurrentes**, migra de SQLite a PostgreSQL.

## Pasos

### 1. Instala PostgreSQL
```bash
sudo apt install postgresql postgresql-client
sudo systemctl start postgresql
```

### 2. Crea la base de datos
```bash
sudo -u postgres psql -c "CREATE USER posuser WITH PASSWORD 'tu_password';"
sudo -u postgres psql -c "CREATE DATABASE pos_system OWNER posuser;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE pos_system TO posuser;"
```

### 3. Cambia el provider en Prisma
Edita `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 4. Actualiza .env
```env
DATABASE_URL="postgresql://posuser:tu_password@localhost:5432/pos_system?schema=public"
```

### 5. Migra los datos
```bash
# Opción A: Migración limpia (pierde datos existentes)
npx prisma db push

# Opción B: Migrar datos desde SQLite (usa pgloader)
sudo apt install pgloader
pgloader sqlite://$(pwd)/prisma/dev.db postgresql://posuser:tu_password@localhost/pos_system
```

### 6. Reinicia el servidor
```bash
npm run dev
```

## Notas
- PostgreSQL soporta **conexiones concurrentes ilimitadas**
- Las consultas de búsqueda serán **10-100x más rápidas** con millones de registros
- Prisma maneja la compatibilidad automáticamente (solo cambias el provider)
- Los índices ya están definidos en el schema para ambos motores

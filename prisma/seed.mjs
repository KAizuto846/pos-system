/**
 * Seed script — crea admin y datos por defecto.
 * Usage: node prisma/seed.mjs
 */
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcrypt-ts';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // 1. Admin user
  const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
  if (adminCount === 0) {
    const password = await hash('admin123', 10);
    await prisma.user.create({
      data: { username: 'admin', password, name: 'Administrador', role: 'ADMIN' },
    });
    console.log('  ✅ Admin user created: admin / admin123');
  } else {
    console.log('  ⏭️  Admin user already exists');
  }

  // 2. Default payment methods
  const pmCount = await prisma.paymentMethod.count();
  if (pmCount === 0) {
    await prisma.paymentMethod.createMany({
      data: [
        { name: 'Efectivo', affectsCash: true },
        { name: 'Tarjeta', affectsCash: false },
        { name: 'Transferencia', affectsCash: true },
      ],
    });
    console.log('  ✅ Payment methods created');
  } else {
    console.log('  ⏭️  Payment methods already exist');
  }

  // 3. Set WAL mode for SQLite
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync('prisma/prisma/dev.db');
    db.exec('PRAGMA journal_mode=WAL');
    db.exec('PRAGMA cache_size=-64000');     // 64MB cache
    db.exec('PRAGMA mmap_size=268435456');   // 256MB mmap
    db.close();
    console.log('  ✅ WAL mode enabled');
  } catch (e) {
    console.log('  ⚠️  Could not enable WAL:', e.message);
  }

  console.log('\n🎉 Seed complete!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

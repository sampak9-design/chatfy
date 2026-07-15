// CommonJS seed — runs via `node prisma/seed.js` so we don't need tsx in production.
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@chatfy.local";
  const password = process.env.ADMIN_PASSWORD || "changeme123";

  // Ensure the super-admin (the account that manages all other accounts).
  let admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin) {
    const passwordHash = await bcrypt.hash(password, 10);
    admin = await prisma.adminUser.create({
      data: { email, passwordHash, name: "Admin", isSuperAdmin: true },
    });
    console.log(`[seed] super-admin "${email}" created`);
  } else if (!admin.isSuperAdmin) {
    admin = await prisma.adminUser.update({ where: { id: admin.id }, data: { isSuperAdmin: true } });
    console.log(`[seed] "${email}" promoted to super-admin`);
  } else {
    console.log(`[seed] super-admin "${email}" already exists`);
  }

  // Backfill: any legacy bot without an owner is assigned to the super-admin,
  // so existing data stays visible after account isolation is enabled.
  const orphaned = await prisma.bot.updateMany({
    where: { ownerId: null },
    data: { ownerId: admin.id },
  });
  if (orphaned.count > 0) {
    console.log(`[seed] backfilled ${orphaned.count} bot(s) to super-admin "${email}"`);
  }
}

main()
  .catch((e) => {
    console.error("[seed] error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

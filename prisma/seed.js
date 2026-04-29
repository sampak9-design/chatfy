// CommonJS seed — runs via `node prisma/seed.js` so we don't need tsx in production.
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@chatfy.local";
  const password = process.env.ADMIN_PASSWORD || "changeme123";

  const exists = await prisma.adminUser.findUnique({ where: { email } });
  if (exists) {
    console.log(`[seed] admin "${email}" already exists, skipping`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.adminUser.create({
    data: { email, passwordHash, name: "Admin" },
  });
  console.log(`[seed] admin "${email}" created`);
}

main()
  .catch((e) => {
    console.error("[seed] error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

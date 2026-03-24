import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = process.env.INITIAL_ADMIN_PASSWORD || "admin123";
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@formbuilder.com" },
    update: {},
    create: {
      email: "admin@formbuilder.com",
      passwordHash,
      role: "ADMIN",
      status: "ACTIVATED",
      nickname: "Admin",
    },
  });

  console.log(`Admin user created/found: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

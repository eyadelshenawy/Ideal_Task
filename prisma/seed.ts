import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

// Same reference projects as DEFAULT_CLIENTS in the ideal-tasks.jsx prototype.
const DEFAULT_PROJECTS = [
  "Internal - IDEAL",
  "Johnson Controls International",
  "As-Salam International Hospital",
  "Al-Dawaa Medical Services",
  "Abo Qir Petroleum",
  "Apex Pharmaceutical",
  "Gulf Packaging Company",
  "Wisayah",
  "Fayendra",
];

function generateTempPassword(): string {
  return crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 12);
}

async function main() {
  const bootstrapEmail = "eyadelshenawy@gmail.com";
  const existingAdmin = await prisma.user.findUnique({ where: { email: bootstrapEmail } });

  if (!existingAdmin) {
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await prisma.user.create({
      data: {
        name: "Eyad Badran",
        email: bootstrapEmail,
        passwordHash,
        role: Role.ADMIN,
        active: true,
        mustChangePassword: true,
      },
    });
    console.log("\nCreated bootstrap admin account:");
    console.log(`  email:    ${bootstrapEmail}`);
    console.log(`  password: ${tempPassword}`);
    console.log("  You'll be asked to set a new password on first login.");
    console.log("  Add the rest of the team from the Team screen once logged in.\n");
  } else {
    console.log("Bootstrap admin already exists, skipping.");
  }

  for (const name of DEFAULT_PROJECTS) {
    const existing = await prisma.project.findFirst({ where: { name } });
    if (!existing) {
      await prisma.project.create({ data: { name } });
    }
  }
  console.log(`Seeded ${DEFAULT_PROJECTS.length} default projects (skipping any that already exist).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

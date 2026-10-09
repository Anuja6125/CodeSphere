import { db } from "../src/lib/db";
import { UserRole } from "@prisma/client";

async function bootstrapManager() {
  const args = process.argv.slice(2);
  let email = process.env.BOOTSTRAP_MANAGER_EMAIL?.trim().toLowerCase();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--email" && args[i + 1]) {
      email = args[i + 1].trim().toLowerCase();
      break;
    } else if (args[i].startsWith("--email=")) {
      email = args[i].split("=")[1].trim().toLowerCase();
      break;
    }
  }

  if (!email) {
    console.error("Usage: npm run bootstrap:manager -- --email=<manager-email>");
    console.error("   or: Set BOOTSTRAP_MANAGER_EMAIL in .env");
    process.exit(1);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.error(`Invalid email format: ${email}`);
    process.exit(1);
  }

  try {
    const existing = await db.user.findUnique({
      where: { email },
    });

    if (existing) {
      if (existing.role === UserRole.MANAGER) {
        console.log(`User ${email} is already a MANAGER.`);
      } else {
        await db.user.update({
          where: { id: existing.id },
          data: { role: UserRole.MANAGER },
        });
        console.log(`Successfully promoted existing user ${email} to MANAGER.`);
      }
    } else {
      await db.user.create({
        data: {
          email,
          role: UserRole.MANAGER,
        },
      });
      console.log(`Created new MANAGER account for ${email}.`);
    }
  } catch (error: any) {
    console.error("Failed to bootstrap manager:", error.message);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

bootstrapManager();

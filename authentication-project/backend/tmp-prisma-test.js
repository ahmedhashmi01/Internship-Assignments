import { PrismaClient } from "./src/generated/prisma/index.js";

(async () => {
  try {
    const prisma = new PrismaClient({});
    console.log("constructed", prisma.constructor.name);
    await prisma.$disconnect();
    console.log("disconnect ok");
  } catch (error) {
    console.error(
      "construct error",
      error && error.message ? error.message : error
    );
    process.exit(1);
  }
})();

import { PrismaClient } from "@ayako/database";
import { logger, ScopedLogger } from "@ayako/utility";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

import Manager from "./Manager.js";

config({ path: "../../.env", quiet: true });

const local = process.argv.includes("--local");

logger.log("[Satellites] starting");

const base = process.env.MAIN_DATABASE_URL ?? "";
const connectionString = `${local ? base.replace("postgres:5432", "localhost:5432") : base}/Ayako-v3`;

const prisma = new PrismaClient({
 adapter: new PrismaPg({ connectionString }),
});

const manager = new Manager({ prisma, logger: new ScopedLogger(), local });
await manager.start();

const shutdown = (): void => {
 logger.log("[Satellites] shutting down");
 void manager
  .stop()
  .catch(() => null)
  .finally(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

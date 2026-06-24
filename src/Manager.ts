import type { PrismaClient } from "@ayako/database";
import {
 createRedisWrapper,
 decrypt,
 getBotIdFromToken,
 SatelliteChannel,
 type RedisWrapperInterface,
 type ScopedLogger,
} from "@ayako/utility";
import type { GatewayPresenceUpdateData } from "discord-api-types/v10";

import {
 reconcileDebounceMs,
 reconcileIntervalMs,
 redisDb,
} from "./constants.js";
import { buildPresence } from "./presence.js";
import Satellite from "./Satellite.js";

interface DesiredBot {
 token: string;
 botId: string;
 cipher: string;
 presence: GatewayPresenceUpdateData;
}

interface ManagerOptions {
 prisma: PrismaClient;
 logger: ScopedLogger;
 local: boolean;
}

export default class Manager {
 readonly local: boolean;
 private readonly prisma: PrismaClient;
 private readonly logger: ScopedLogger;
 private readonly pub: RedisWrapperInterface;
 private readonly control: RedisWrapperInterface;
 private readonly live = new Map<string, Satellite>();

 private reconciling = false;
 private pending = false;
 private debounce?: ReturnType<typeof setTimeout>;
 private timer?: ReturnType<typeof setInterval>;

 constructor(options: ManagerOptions) {
  this.prisma = options.prisma;
  this.logger = options.logger;
  this.local = options.local;
  this.pub = createRedisWrapper({ db: redisDb });
  this.control = createRedisWrapper({ db: redisDb });
 }

 start = async (): Promise<void> => {
  await this.control.subscribe(SatelliteChannel.Reconcile);
  this.control.on("message", (...args: unknown[]) => {
   const [channel] = args as [string];
   if (channel === SatelliteChannel.Reconcile) this.queueReconcile();
  });

  await this.reconcile();
  this.timer = setInterval(() => this.queueReconcile(), reconcileIntervalMs);
  this.logger.log("[Manager] started");
 };

 stop = async (): Promise<void> => {
  if (this.timer) clearInterval(this.timer);
  if (this.debounce) clearTimeout(this.debounce);

  await Promise.all(
   [...this.live.values()].map((satellite) => satellite.dispose()),
  );
  this.live.clear();

  await this.control.quit().catch(() => null);
  await this.pub.quit().catch(() => null);
 };

 publish = (channel: string, message: string): void => {
  this.pub.publish(channel, message).catch((error) => {
   this.logger.error("[Manager] publish failed:", error);
  });
 };

 onInvalid = (satellite: Satellite): void => {
  this.live.delete(satellite.botId);
  this.publish(
   SatelliteChannel.Invalid,
   JSON.stringify({ cipher: satellite.cipher }),
  );
 };

 queueReconcile = (): void => {
  if (this.debounce) clearTimeout(this.debounce);
  this.debounce = setTimeout(() => {
   void this.reconcile();
  }, reconcileDebounceMs);
 };

 reconcile = async (): Promise<void> => {
  if (this.reconciling) {
   this.pending = true;
   return;
  }
  this.reconciling = true;

  try {
   const desired = await this.buildDesired();

   await Promise.all(
    [...desired.values()].map((bot) => {
     const existing = this.live.get(bot.botId);
     if (existing) return existing.applyPresence(bot.presence);
     return this.connect(bot);
    }),
   );

   await Promise.all(
    [...this.live.entries()].map(async ([botId, satellite]) => {
     if (desired.has(botId)) return;
     this.live.delete(botId);
     await satellite.dispose();
    }),
   );
  } catch (error) {
   this.logger.error("[Manager] reconcile failed:", error);
  } finally {
   this.reconciling = false;
   if (this.pending) {
    this.pending = false;
    this.queueReconcile();
   }
  }
 };

 private buildDesired = async (): Promise<Map<string, DesiredBot>> => {
  const rows = await this.prisma.ticketSetting.findMany({
   where: { botToken: { not: null } },
  });
  const desired = new Map<string, DesiredBot>();

  for (const row of rows) {
   if (!row.botToken) continue;

   let token: string;
   try {
    token = decrypt(row.botToken);
   } catch {
    this.logger.warn(
     "[Manager] skipping undecryptable token for setting",
     String(row.id),
    );
    continue;
   }

   const botId = getBotIdFromToken(token);
   if (desired.has(botId)) continue;

   desired.set(botId, {
    token,
    botId,
    cipher: row.botToken,
    presence: buildPresence(row),
   });
  }

  return desired;
 };

 private connect = async (bot: DesiredBot): Promise<void> => {
  const satellite = new Satellite(
   this,
   bot.botId,
   bot.cipher,
   bot.token,
   bot.presence,
   this.logger,
  );
  this.live.set(bot.botId, satellite);

  try {
   await satellite.connect();
  } catch (error) {
   this.logger.error(`[Manager] connect failed for ${bot.botId}:`, error);
   this.live.delete(bot.botId);
  }
 };
}

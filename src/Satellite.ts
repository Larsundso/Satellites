import type { ScopedLogger } from "@ayako/utility";
import { REST } from "@discordjs/rest";
import { WebSocketManager, WebSocketShardEvents } from "@discordjs/ws";
import {
 GatewayCloseCodes,
 GatewayOpcodes,
 type GatewayDispatchPayload,
 type GatewayPresenceUpdateData,
} from "discord-api-types/v10";

import { forwardedEvents, satelliteIntents } from "./constants.js";
import type Manager from "./Manager.js";

export default class Satellite {
 private ws?: WebSocketManager;
 private presenceKey: string;
 dead = false;

 constructor(
  private readonly manager: Manager,
  readonly botId: string,
  readonly cipher: string,
  private readonly token: string,
  private presence: GatewayPresenceUpdateData,
  private readonly logger: ScopedLogger,
 ) {
  this.presenceKey = JSON.stringify(presence);
 }

 connect = async (): Promise<void> => {
  const rest = new REST({
   api: `http://${this.manager.local ? "localhost" : "nirn"}:8080/api`,
  }).setToken(this.token);

  this.ws = new WebSocketManager({
   rest,
   intents: satelliteIntents,
   shardCount: 1,
   shardIds: [0],
   initialPresence: this.presence,
  });
  this.ws.setToken(this.token);

  this.ws.on(
   WebSocketShardEvents.Dispatch,
   (payload: GatewayDispatchPayload) => {
    this.onDispatch(payload);
   },
  );
  this.ws.on(WebSocketShardEvents.Closed, (code: number) =>
   this.onClosed(code),
  );
  this.ws.on(WebSocketShardEvents.Error, (error: unknown) => {
   this.logger.error(`[Satellite ${this.botId}] socket error:`, error);
  });

  await this.ws.connect();
  this.logger.debug(`[Satellite ${this.botId}] connected`);
 };

 applyPresence = async (presence: GatewayPresenceUpdateData): Promise<void> => {
  const key = JSON.stringify(presence);
  if (key === this.presenceKey) return;

  this.presence = presence;
  this.presenceKey = key;

  try {
   await this.ws?.send(0, { op: GatewayOpcodes.PresenceUpdate, d: presence });
  } catch (error) {
   this.logger.error(
    `[Satellite ${this.botId}] presence update failed:`,
    error,
   );
  }
 };

 dispose = async (): Promise<void> => {
  try {
   await this.ws?.destroy({ reason: "satellite disposed" });
  } catch (error) {
   this.logger.error(`[Satellite ${this.botId}] dispose failed:`, error);
  }
 };

 private onDispatch = (payload: GatewayDispatchPayload): void => {
  if (!forwardedEvents.has(payload.t)) return;
  this.manager.publish(payload.t, JSON.stringify(payload.d));
 };

 private onClosed = (code: number): void => {
  if (
   code !== GatewayCloseCodes.AuthenticationFailed &&
   code !== GatewayCloseCodes.DisallowedIntents
  ) {
   return;
  }

  this.logger.warn(
   `[Satellite ${this.botId}] auth-class close ${code}; invalidating`,
  );
  this.dead = true;
  void this.dispose();
  this.manager.onInvalid(this);
 };
}

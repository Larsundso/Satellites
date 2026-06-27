import {
 GatewayDispatchEvents,
 GatewayIntentBits,
} from "discord-api-types/v10";

export const satelliteIntents = GatewayIntentBits.DirectMessages;

export const forwardedEvents = new Set<GatewayDispatchEvents>([
 GatewayDispatchEvents.MessageCreate,
 GatewayDispatchEvents.MessageUpdate,
 GatewayDispatchEvents.MessageDelete,
 GatewayDispatchEvents.InteractionCreate,
]);

export const reconcileDebounceMs = 1000;
export const reconcileIntervalMs = 90000;
export const redisDb = 0;

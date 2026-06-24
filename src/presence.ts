import { PresenceActivityType, type TicketSetting } from "@ayako/database";
import {
 ActivityType,
 PresenceUpdateStatus,
 type GatewayActivityUpdateData,
 type GatewayPresenceUpdateData,
} from "discord-api-types/v10";

export type PresenceConfig = Pick<
 TicketSetting,
 "presenceType" | "presenceText" | "presenceEmoji"
>;

const activityTypeMap: Record<PresenceActivityType, ActivityType> = {
 [PresenceActivityType.Playing]: ActivityType.Playing,
 [PresenceActivityType.Listening]: ActivityType.Listening,
 [PresenceActivityType.Watching]: ActivityType.Watching,
 [PresenceActivityType.Competing]: ActivityType.Competing,
 [PresenceActivityType.Custom]: ActivityType.Custom,
};

const parseEmoji = (
 raw: string,
): { name: string; id?: string; animated?: boolean } => {
 const custom = /^<(a?):(\w+):(\d+)>$/.exec(raw);
 if (custom)
  return { name: custom[2], id: custom[3], animated: custom[1] === "a" };
 return { name: raw };
};

const noActivity: GatewayPresenceUpdateData = {
 status: PresenceUpdateStatus.Online,
 afk: false,
 since: null,
 activities: [],
};

export const buildPresence = (
 config: PresenceConfig,
): GatewayPresenceUpdateData => {
 if (!config.presenceType) return noActivity;

 const type = activityTypeMap[config.presenceType];
 const text = config.presenceText ?? "";

 const activity =
  type === ActivityType.Custom
   ? ({
      name: "Custom Status",
      type,
      state: text,
      ...(config.presenceEmoji
       ? { emoji: parseEmoji(config.presenceEmoji) }
       : {}),
     } as unknown as GatewayActivityUpdateData)
   : ({ name: text, type } satisfies GatewayActivityUpdateData);

 return {
  status: PresenceUpdateStatus.Online,
  afk: false,
  since: null,
  activities: [activity],
 };
};

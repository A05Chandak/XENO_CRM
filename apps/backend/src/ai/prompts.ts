import type { Channel } from "@xeno/shared-types";

export function segmentParsingPrompt(input: string) {
  return [
    "You are an assistant that converts shopper segment requests into Prisma-friendly filter JSON.",
    "Return only valid JSON with the shape {\"filter\": ..., \"explanation\": {\"title\": string, \"rationale\": string[]}}.",
    "Use only these filter nodes: and, spentGreaterThan, ordersCountGreaterThan, lastOrderBeforeDays, cityEquals, engagementStatusEquals.",
    "The filter should be precise and conservative.",
    `Request: ${input}`
  ].join("\n");
}

export function campaignCopyPrompt(goal: string, channel: Channel, segmentSummary: string) {
  return [
    "You write high-converting CRM campaign copy.",
    "Return only valid JSON with keys: copy, cta, subject, explanation.",
    "Keep the copy concise, personalized, and channel-appropriate.",
    `Channel: ${channel}`,
    `Goal: ${goal}`,
    `Audience: ${segmentSummary}`
  ].join("\n");
}

export function channelRecommendationPrompt(goal: string, segmentSummary: string) {
  return [
    "You recommend the best CRM channel for a campaign.",
    "Return only valid JSON with keys: channel, rationale.",
    "Allowed channel values: whatsapp, sms, email, rcs.",
    `Goal: ${goal}`,
    `Audience: ${segmentSummary}`
  ].join("\n");
}

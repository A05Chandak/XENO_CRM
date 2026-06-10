import OpenAI from "openai";
import type { AIParsedSegment, Channel, SegmentFilter } from "@xeno/shared-types";
import { campaignCopyPrompt, channelRecommendationPrompt, segmentParsingPrompt } from "./prompts.js";

type AIJson = Record<string, unknown>;

function hasApiKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function getClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normaliseEngagement(value: unknown): "cold" | "warm" | "hot" | "dormant" {
  return value === "warm" || value === "hot" || value === "dormant" ? value : "cold";
}

function heuristicSegment(text: string): AIParsedSegment {
  const lowered = text.toLowerCase();
  const spentMatch = lowered.match(/spent more than[^\d]*(\d+)/);
  const ordersMatch = lowered.match(/orders? (?:count )?(?:more than|over) (\d+)/);
  const daysMatch = lowered.match(/(?:haven't|has not|didn't).*?(\d+)\s*days?/);
  const cityMatch = lowered.match(/city (?:equals|is) ([a-z\s]+)/);
  const engagementMatch = lowered.match(/(cold|warm|hot|dormant)/);

  const clauses: SegmentFilter[] = [];
  if (spentMatch) {
    clauses.push({ type: "spentGreaterThan", value: Number(spentMatch[1] ?? 0) });
  }
  if (ordersMatch) {
    clauses.push({ type: "ordersCountGreaterThan", value: Number(ordersMatch[1] ?? 0) });
  }
  if (daysMatch) {
    clauses.push({ type: "lastOrderBeforeDays", value: Number(daysMatch[1] ?? 0) });
  }
  if (cityMatch) {
    clauses.push({ type: "cityEquals", value: (cityMatch[1] ?? "").trim().replace(/\.$/, "") });
  }
  if (engagementMatch) {
    clauses.push({ type: "engagementStatusEquals", value: normaliseEngagement(engagementMatch[1]) });
  }

  return {
    filter:
      clauses.length > 1
        ? { type: "and", clauses }
        : clauses[0] ?? { type: "spentGreaterThan", value: 0 },
    explanation: {
      title: "Heuristic segment interpretation",
      rationale: [
        "Parsed the request locally because no OpenAI key was configured.",
        `Detected ${clauses.length} filter clause${clauses.length === 1 ? "" : "s"}.`
      ]
    }
  };
}

async function safeJsonCompletion(prompt: string) {
  if (!hasApiKey()) {
    return null;
  }

  try {
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const client = getClient();
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "Return only JSON. Do not wrap in markdown." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return null;
    }

    return JSON.parse(content) as AIJson;
  } catch (_error) {
    return null;
  }
}

export async function parseSegmentText(input: string): Promise<AIParsedSegment> {
  const parsed = await safeJsonCompletion(segmentParsingPrompt(input));
  if (!parsed) {
    return heuristicSegment(input);
  }

  return {
    filter: parsed.filter as AIParsedSegment["filter"],
    explanation: parsed.explanation as AIParsedSegment["explanation"]
  };
}

export async function generateCampaignCopy(goal: string, channel: Channel, segmentSummary: string) {
  const parsed = await safeJsonCompletion(campaignCopyPrompt(goal, channel, segmentSummary));
  if (!parsed) {
    return {
      copy: `Hi {{name}}, we've built something for you. ${goal}`,
      cta: "Shop now",
      subject: "A personal offer for you",
      explanation: "Generated from a deterministic fallback because no OpenAI key was configured."
    };
  }

  return {
    copy: asString(parsed.copy, `Hi {{name}}, we've built something for you.`),
    cta: asString(parsed.cta, "Shop now"),
    subject: asString(parsed.subject, "A message from our team"),
    explanation: asString(parsed.explanation, "AI-generated campaign copy")
  };
}

export async function recommendChannel(goal: string, segmentSummary: string) {
  const parsed = await safeJsonCompletion(channelRecommendationPrompt(goal, segmentSummary));
  if (!parsed) {
    const lowered = `${goal} ${segmentSummary}`.toLowerCase();
    const channel: Channel =
      lowered.includes("urgent") || lowered.includes("discount") ? "whatsapp" : lowered.includes("long") ? "email" : "sms";
    return {
      channel,
      rationale: "Heuristic fallback based on campaign intent and audience language."
    };
  }

  return {
    channel: asString(parsed.channel, "whatsapp") as Channel,
    rationale: asString(parsed.rationale, "AI selected the best channel")
  };
}

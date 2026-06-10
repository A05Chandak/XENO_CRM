import type { Prisma } from "@prisma/client";
import type { Channel, MessageStatus } from "@xeno/shared-types";
import { prisma } from "../lib/prisma.js";
import { filterToWhere, summarizeFilter } from "./filter.js";
import type { SegmentFilter } from "@xeno/shared-types";

const channelServiceUrl = () => process.env.CHANNEL_SERVICE_URL ?? "http://localhost:4100";
const crmWebhookSecret = () => process.env.CRM_WEBHOOK_SECRET ?? "dev-secret";
const apiBaseUrl = () => process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? "4000"}`;

function createStatusEvents(status: MessageStatus, meta?: Record<string, unknown>): Prisma.InputJsonValue {
  return [{ status, at: new Date().toISOString(), ...(meta ? { meta } : {}) }] as unknown as Prisma.InputJsonValue;
}

async function postWithRetry(url: string, body: unknown, retries = 3) {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Failed to post payload");
}

export async function createManualSegment(input: {
  name: string;
  filter: SegmentFilter;
  explanation?: Record<string, unknown>;
}) {
  const where = filterToWhere(input.filter);
  const matchCount = await prisma.customer.count({ where });
  return prisma.segment.create({
    data: {
      name: input.name,
      type: "manual",
      definition: input.filter as Prisma.InputJsonValue,
      explanation: (input.explanation ?? { title: "Manual segment", rationale: [summarizeFilter(input.filter)] }) as Prisma.InputJsonValue,
      matchCount
    }
  });
}

export async function createAISegment(input: {
  name: string;
  sourcePrompt: string;
  filter: SegmentFilter;
  explanation: Record<string, unknown>;
}) {
  const where = filterToWhere(input.filter);
  const matchCount = await prisma.customer.count({ where });
  return prisma.segment.create({
    data: {
      name: input.name,
      type: "ai",
      definition: input.filter as Prisma.InputJsonValue,
      explanation: input.explanation as Prisma.InputJsonValue,
      sourcePrompt: input.sourcePrompt,
      matchCount
    }
  });
}

export async function createCampaign(input: {
  name: string;
  goal: string;
  segmentId: string;
  channel: Channel;
  messageTemplate: string;
  generatedCopy?: string;
  suggestedCta?: string;
}) {
  return prisma.campaign.create({
    data: {
      name: input.name,
      goal: input.goal,
      segmentId: input.segmentId,
      channel: input.channel,
      messageTemplate: input.messageTemplate,
      ...(input.generatedCopy ? { generatedCopy: input.generatedCopy } : {}),
      ...(input.suggestedCta ? { suggestedCta: input.suggestedCta } : {})
    },
    include: { segment: true }
  });
}

export async function launchCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { segment: true }
  });
  if (!campaign) {
    throw new Error("Campaign not found");
  }

  const segmentFilter = campaign.segment.definition as SegmentFilter;
  const customers = await prisma.customer.findMany({
    where: filterToWhere(segmentFilter),
    orderBy: { createdAt: "asc" }
  });

  const messages = await Promise.all(
    customers.map((customer) =>
      prisma.message.create({
        data: {
          campaignId,
          customerId: customer.id,
          channel: campaign.channel,
          recipient: campaign.channel === "email" ? customer.email : customer.phone,
          content: (campaign.generatedCopy ?? campaign.messageTemplate).replace(/\{\{name\}\}/g, customer.name),
          status: "queued",
          statusEvents: createStatusEvents("queued"),
          attempts: 0
        }
      })
    )
  );

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      messageCount: messages.length,
      status: "sending"
    }
  });

  const deliveries = await Promise.allSettled(
    messages.map((message) =>
      postWithRetry(`${channelServiceUrl()}/send`, {
        messageId: message.id,
        channel: message.channel,
        recipient: message.recipient,
        content: message.content,
        receiptUrl: `${apiBaseUrl()}/webhooks/channel-receipt`,
        receiptSecret: crmWebhookSecret()
      })
    )
  );

  return {
    campaignId,
    launched: messages.length,
    audienceSize: customers.length,
    failedDispatches: deliveries.filter((entry) => entry.status === "rejected").length
  };
}

export async function applyReceipt(input: {
  messageId: string;
  status: MessageStatus;
  at: string;
  meta?: Record<string, unknown>;
}) {
  const existing = await prisma.message.findUnique({ where: { id: input.messageId } });
  if (!existing) {
    throw new Error("Message not found");
  }

  const events = Array.isArray(existing.statusEvents) ? (existing.statusEvents as Array<Record<string, unknown>>) : [];
  const alreadyRecorded = events.some((event) => event.status === input.status && event.at === input.at);
  if (!alreadyRecorded) {
    events.push({ status: input.status, at: input.at, meta: input.meta ?? {} });
  }

  const data: Record<string, unknown> = {
    statusEvents: events,
    status: input.status,
    attempts: existing.attempts + 1
  };

  if (input.status === "sent") {
    data.sentAt = new Date(input.at);
  }
  if (input.status === "delivered") {
    data.deliveredAt = new Date(input.at);
  }
  if (input.status === "opened") {
    data.openedAt = new Date(input.at);
  }
  if (input.status === "clicked") {
    data.clickedAt = new Date(input.at);
  }
  if (input.status === "failed") {
    data.failedAt = new Date(input.at);
    data.lastError = typeof input.meta?.reason === "string" ? input.meta.reason : "Delivery failed";
  }

  await prisma.message.update({
    where: { id: input.messageId },
    data
  });

  await recalculateCampaignStats(existing.campaignId);

  return { ok: true };
}

export async function recalculateCampaignStats(campaignId: string) {
  const messages = await prisma.message.findMany({
    where: { campaignId },
    select: { status: true }
  });

  const counts = {
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    failed: 0
  };

  for (const message of messages) {
    if (message.status === "sent" || message.status === "delivered" || message.status === "opened" || message.status === "clicked") {
      counts.sent += 1;
    }
    if (message.status === "delivered" || message.status === "opened" || message.status === "clicked") {
      counts.delivered += 1;
    }
    if (message.status === "opened" || message.status === "clicked") {
      counts.opened += 1;
    }
    if (message.status === "clicked") {
      counts.clicked += 1;
    }
    if (message.status === "failed") {
      counts.failed += 1;
    }
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      sentCount: counts.sent,
      deliveredCount: counts.delivered,
      openedCount: counts.opened,
      clickedCount: counts.clicked,
      failedCount: counts.failed,
      status: counts.sent > 0 ? (counts.failed > 0 && counts.sent === counts.failed ? "failed" : "active") : "draft"
    }
  });
}

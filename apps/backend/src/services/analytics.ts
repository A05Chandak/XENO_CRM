import { prisma } from "../lib/prisma.js";

const statuses = ["queued", "sent", "delivered", "opened", "read", "clicked", "failed"] as const;
const channels = ["whatsapp", "sms", "email", "rcs"] as const;

export async function buildAnalytics() {
  const messages = await prisma.message.findMany({
    select: {
      channel: true,
      status: true,
      createdAt: true,
      statusEvents: true,
      sentAt: true,
      deliveredAt: true,
      openedAt: true,
      readAt: true,
      clickedAt: true,
      failedAt: true
    },
    orderBy: { createdAt: "asc" }
  });

  const byStatus = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<(typeof statuses)[number], number>;
  const byChannel = Object.fromEntries(channels.map((channel) => [channel, 0])) as Record<(typeof channels)[number], number>;

  for (const message of messages) {
    byStatus[message.status as (typeof statuses)[number]] += 1;
    byChannel[message.channel as (typeof channels)[number]] += 1;
  }

  const funnel = [
    { label: "Sent", value: byStatus.sent + byStatus.delivered + byStatus.opened + byStatus.clicked },
    { label: "Delivered", value: byStatus.delivered + byStatus.opened + byStatus.clicked },
    { label: "Read", value: byStatus.opened + byStatus.read + byStatus.clicked },
    { label: "Clicked", value: byStatus.clicked }
  ];

  const days = new Map<string, { date: string; sent: number; delivered: number; opened: number; clicked: number; failed: number }>();
  for (const message of messages) {
    const events = Array.isArray(message.statusEvents) ? (message.statusEvents as Array<{ status?: string; at?: string }>) : [];
    for (const event of events) {
      if (!event.at || !event.status) {
        continue;
      }

      const date = new Date(event.at).toISOString().slice(0, 10);
      const entry =
        days.get(date) ??
        {
          date,
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          failed: 0
        };

      if (event.status === "sent" || event.status === "delivered" || event.status === "opened" || event.status === "read" || event.status === "clicked") {
        entry.sent += 1;
      }
      if (event.status === "delivered" || event.status === "opened" || event.status === "read" || event.status === "clicked") {
        entry.delivered += 1;
      }
      if (event.status === "opened" || event.status === "read" || event.status === "clicked") {
        entry.opened += 1;
      }
      if (event.status === "clicked") {
        entry.clicked += 1;
      }
      if (event.status === "failed") {
        entry.failed += 1;
      }

      days.set(date, entry);
    }
  }

  const revenue = await prisma.campaign.aggregate({
    _sum: {
      attributedRevenue: true
    }
  });

  return {
    total: messages.length,
    byStatus,
    byChannel,
    funnel,
    timeSeries: [...days.values()].sort((left, right) => left.date.localeCompare(right.date)),
    attributedRevenue: revenue._sum.attributedRevenue?.toNumber() ?? 0
  };
}

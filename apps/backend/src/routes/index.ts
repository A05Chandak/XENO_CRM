import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { serialize } from "../lib/serialize.js";
import { createAISegment, createCampaign, createManualSegment, launchCampaign, applyReceipt } from "../services/campaign.js";
import { ingestOrder } from "../services/orders.js";
import { buildAnalytics } from "../services/analytics.js";
import { filterToWhere } from "../services/filter.js";
import { generateCampaignCopy, parseSegmentText, recommendChannel } from "../ai/service.js";
import { verifyWebhookSignature } from "../middleware/webhookSignature.js";
import type { Channel, MessageStatus, OrderIngestionPayload, SegmentFilter } from "@xeno/shared-types";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "backend" });
});

router.get("/customers", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { city: { contains: search, mode: "insensitive" as const } }
        ]
      }
    : undefined;
  const customers = await prisma.customer.findMany({
    ...(where ? { where } : {}),
    orderBy: { totalSpent: "desc" },
    include: { orders: { orderBy: { orderedAt: "desc" }, take: 5 } }
  });
  res.json(serialize(customers));
});

router.get("/customers/:id", async (req, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: { orders: { orderBy: { orderedAt: "desc" } }, messages: { orderBy: { createdAt: "desc" }, include: { campaign: true } } }
  });
  if (!customer) {
    return res.status(404).json({ error: "Customer not found" });
  }
  res.json(serialize(customer));
});

router.get("/orders", async (_req, res) => {
  const orders = await prisma.order.findMany({
    orderBy: { orderedAt: "desc" },
    include: { customer: true, attributedCampaign: true }
  });
  res.json(serialize(orders));
});

router.post("/orders", async (req, res) => {
  const schema = z.object({
    customerId: z.string().min(1),
    orderNumber: z.string().min(1),
    totalAmount: z.number().positive(),
    currency: z.string().min(3).optional(),
    status: z.string().min(1).optional(),
    orderedAt: z.string().datetime().optional()
  });
  const body = schema.parse(req.body);
  const payload: OrderIngestionPayload = {
    customerId: body.customerId,
    orderNumber: body.orderNumber,
    totalAmount: body.totalAmount,
    ...(body.currency ? { currency: body.currency } : {}),
    ...(body.status ? { status: body.status } : {}),
    ...(body.orderedAt ? { orderedAt: body.orderedAt } : {})
  };
  const result = await ingestOrder(payload);
  res.status(201).json(serialize(result));
});

router.get("/segments", async (_req, res) => {
  const segments = await prisma.segment.findMany({
    orderBy: { createdAt: "desc" }
  });
  res.json(serialize(segments));
});

router.post("/segments/manual", async (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    filter: z.any(),
    explanation: z.any().optional()
  });
  const body = schema.parse(req.body) as { name: string; filter: SegmentFilter; explanation?: Record<string, unknown> };
  const segment = await createManualSegment(body);
  res.status(201).json(serialize(segment));
});

router.post("/segments/ai", async (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    prompt: z.string().min(5)
  });
  const body = schema.parse(req.body);
  const parsed = await parseSegmentText(body.prompt);
  const segment = await createAISegment({
    name: body.name,
    sourcePrompt: body.prompt,
    filter: parsed.filter,
    explanation: parsed.explanation
  });
  res.status(201).json(serialize({ segment, parsed }));
});

router.post("/ai/campaign-copy", async (req, res) => {
  const schema = z.object({
    goal: z.string().min(4),
    channel: z.enum(["whatsapp", "sms", "email", "rcs"]),
    segmentSummary: z.string().min(4)
  });
  const body = schema.parse(req.body);
  res.json(await generateCampaignCopy(body.goal, body.channel, body.segmentSummary));
});

router.post("/ai/channel-recommendation", async (req, res) => {
  const schema = z.object({
    goal: z.string().min(4),
    segmentSummary: z.string().min(4)
  });
  const body = schema.parse(req.body);
  res.json(await recommendChannel(body.goal, body.segmentSummary));
});

router.get("/campaigns", async (_req, res) => {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { segment: true, messages: true }
  });
  res.json(serialize(campaigns));
});

router.post("/campaigns", async (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    goal: z.string().min(4),
    segmentId: z.string().min(1),
    channel: z.enum(["whatsapp", "sms", "email", "rcs"]),
    messageTemplate: z.string().min(5),
    generatedCopy: z.string().optional(),
    suggestedCta: z.string().optional()
  });
  const body = schema.parse(req.body);
  const campaign = await createCampaign({
    name: body.name,
    goal: body.goal,
    segmentId: body.segmentId,
    channel: body.channel as Channel,
    messageTemplate: body.messageTemplate,
    ...(body.generatedCopy ? { generatedCopy: body.generatedCopy } : {}),
    ...(body.suggestedCta ? { suggestedCta: body.suggestedCta } : {})
  });
  res.status(201).json(serialize(campaign));
});

router.post("/campaigns/:id/send", async (req, res) => {
  const result = await launchCampaign(req.params.id);
  res.json(result);
});

router.get("/messages", async (_req, res) => {
  const messages = await prisma.message.findMany({
    orderBy: { createdAt: "desc" },
    include: { customer: true, campaign: true }
  });
  res.json(serialize(messages));
});

router.post("/webhooks/channel-receipt", verifyWebhookSignature, async (req, res) => {
  const schema = z.object({
    messageId: z.string(),
    trackingId: z.string().min(1),
    status: z.enum(["DELIVERED", "READ", "FAILED", "sent", "delivered", "opened", "read", "clicked", "failed"]),
    at: z.string(),
    meta: z.record(z.unknown()).optional()
  });
  const body = schema.parse(req.body);

  const normalizedStatus = {
    DELIVERED: "delivered",
    READ: "read",
    FAILED: "failed",
    sent: "sent",
    delivered: "delivered",
    opened: "opened",
    read: "read",
    clicked: "clicked",
    failed: "failed"
  }[body.status] as MessageStatus;

  const result = await applyReceipt({
    messageId: body.messageId,
    status: normalizedStatus,
    at: body.at,
    trackingId: body.trackingId,
    ...(body.meta ? { meta: body.meta } : {})
  });
  res.json(result);
});

router.get("/analytics/dashboard", async (_req, res) => {
  res.json(await buildAnalytics());
});

router.get("/segments/:id/audience", async (req, res) => {
  const segment = await prisma.segment.findUnique({ where: { id: req.params.id } });
  if (!segment) {
    return res.status(404).json({ error: "Segment not found" });
  }
  const customers = await prisma.customer.findMany({
    where: filterToWhere(segment.definition as SegmentFilter),
    include: { orders: { orderBy: { orderedAt: "desc" }, take: 3 } }
  });
  res.json(serialize(customers));
});

router.get("/campaigns/:id/messages", async (req, res) => {
  const messages = await prisma.message.findMany({
    where: { campaignId: req.params.id },
    orderBy: { createdAt: "asc" },
    include: { customer: true }
  });
  res.json(serialize(messages));
});

export default router;

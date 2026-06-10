import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { serialize } from "../lib/serialize.js";
import { createAISegment, createCampaign, createManualSegment, launchCampaign, applyReceipt } from "../services/campaign.js";
import { buildAnalytics } from "../services/analytics.js";
import { filterToWhere } from "../services/filter.js";
import { generateCampaignCopy, parseSegmentText, recommendChannel } from "../ai/service.js";
import type { Channel, SegmentFilter } from "@xeno/shared-types";

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
    include: { customer: true }
  });
  res.json(serialize(orders));
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

router.post("/webhooks/channel-receipt", async (req, res) => {
  const schema = z.object({
    messageId: z.string(),
    status: z.enum(["queued", "sent", "delivered", "opened", "clicked", "failed"]),
    at: z.string(),
    meta: z.record(z.unknown()).optional(),
    receiptSecret: z.string().optional()
  });
  const body = schema.parse(req.body);
  const secret = req.header("x-receipt-secret") ?? body.receiptSecret;
  if (secret !== (process.env.CRM_WEBHOOK_SECRET ?? "dev-secret")) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }
  await applyReceipt({
    messageId: body.messageId,
    status: body.status,
    at: body.at,
    ...(body.meta ? { meta: body.meta } : {})
  });
  res.json({ ok: true });
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

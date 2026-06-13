import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import { z } from "zod";
import type {
  Channel,
  ChannelReceiptPayload,
  ChannelReceiptStatus,
  ChannelSendMessage,
  ChannelSendRequest,
  ChannelSendResponse
} from "@xeno/shared-types";

type QueuedMessage = ChannelSendMessage & {
  trackingId: string;
  receiptUrl: string;
  events: ChannelReceiptPayload[];
  attempts: number;
  createdAt: string;
  processing: boolean;
};

const port = Number(process.env.PORT ?? "4100");
const jobs = new Map<string, QueuedMessage>();
const queue: QueuedMessage[] = [];

function webhookSecret() {
  return process.env.CRM_WEBHOOK_SECRET ?? "dev-secret";
}

function randomId() {
  return `trk_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function randomDelay(min = 5000, max = 20000) {
  return Math.floor(min + Math.random() * (max - min));
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chooseTerminalStatus(): ChannelReceiptStatus {
  const roll = Math.random();
  if (roll < 0.14) return "FAILED";
  if (roll < 0.76) return "DELIVERED";
  return "READ";
}

function signPayload(serializedPayload: string) {
  return crypto.createHmac("sha256", webhookSecret()).update(serializedPayload).digest("hex");
}

async function postReceipt(job: QueuedMessage, payload: ChannelReceiptPayload, retry = 0): Promise<void> {
  const body = JSON.stringify(payload);
  const response = await fetch(job.receiptUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Xeno-Signature": `sha256=${signPayload(body)}`
    },
    body
  });

  if (!response.ok) {
    if (retry < 3) {
      await delay(400 * (retry + 1));
      return postReceipt(job, payload, retry + 1);
    }
    throw new Error(`Receipt rejected with ${response.status}`);
  }
}

async function emitStatus(job: QueuedMessage, status: ChannelReceiptStatus, meta?: Record<string, unknown>) {
  const payload: ChannelReceiptPayload = {
    messageId: job.messageId,
    trackingId: job.trackingId,
    status,
    at: new Date().toISOString(),
    ...(meta ? { meta } : {})
  };

  job.events.push(payload);
  job.attempts += 1;
  await postReceipt(job, payload);
}

async function processJob(job: QueuedMessage) {
  if (job.processing) {
    return;
  }

  job.processing = true;
  const deliveryWindow = randomDelay();
  const terminalStatus = chooseTerminalStatus();

  try {
    if (terminalStatus === "FAILED") {
      await delay(deliveryWindow);
      await emitStatus(job, "FAILED", { reason: "Simulated carrier failure", channel: job.channel });
      return;
    }

    await delay(Math.floor(deliveryWindow * 0.62));
    await emitStatus(job, "DELIVERED", { channel: job.channel });

    if (terminalStatus === "READ") {
      await delay(Math.max(250, Math.floor(deliveryWindow * 0.38)));
      await emitStatus(job, "READ", { channel: job.channel });
    }
  } catch (error) {
    await emitStatus(job, "FAILED", {
      reason: error instanceof Error ? error.message : "Unknown delivery worker error",
      channel: job.channel
    }).catch(() => undefined);
  }
}

function drainQueue() {
  let nextJob = queue.shift();
  while (nextJob) {
    void processJob(nextJob);
    nextJob = queue.shift();
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const messageSchema = z.object({
  messageId: z.string().min(1),
  campaignId: z.string().min(1),
  customerId: z.string().min(1),
  channel: z.enum(["whatsapp", "sms", "email", "rcs"]),
  recipient: z.string().min(1),
  content: z.string().min(1)
});

const sendSchema = z.object({
  receiptUrl: z.string().url(),
  messages: z.array(messageSchema).min(1)
});

function enqueueMessages(body: ChannelSendRequest) {
  const trackingIds = body.messages.map((message) => {
    const trackingId = randomId();
    const job: QueuedMessage = {
      ...message,
      trackingId,
      receiptUrl: body.receiptUrl,
      events: [],
      attempts: 0,
      createdAt: new Date().toISOString(),
      processing: false
    };

    jobs.set(trackingId, job);
    queue.push(job);

    return {
      messageId: message.messageId,
      trackingId
    };
  });

  queueMicrotask(drainQueue);

  return {
    accepted: trackingIds.length,
    trackingIds
  } satisfies ChannelSendResponse;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "channel-service", queued: queue.length, jobs: jobs.size });
});

app.post("/messages/send", (req, res) => {
  const body = sendSchema.parse(req.body) satisfies ChannelSendRequest;
  res.status(202).json(enqueueMessages(body));
});

app.post("/send", (req, res) => {
  const legacySchema = z.object({
    messageId: z.string().min(1),
    campaignId: z.string().optional(),
    customerId: z.string().optional(),
    receiptUrl: z.string().url(),
    channel: z.enum(["whatsapp", "sms", "email", "rcs"]),
    recipient: z.string().min(1),
    content: z.string().min(1)
  });

  const body = legacySchema.parse(req.body);
  const payload: ChannelSendRequest = {
    receiptUrl: body.receiptUrl,
    messages: [
      {
        messageId: body.messageId,
        campaignId: body.campaignId ?? "legacy-campaign",
        customerId: body.customerId ?? "legacy-customer",
        channel: body.channel,
        recipient: body.recipient,
        content: body.content
      }
    ]
  };

  res.status(202).json(enqueueMessages(payload));
});

app.get("/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  res.json(job);
});

app.listen(port, () => {
  console.log(`Channel service listening on http://localhost:${port}`);
});

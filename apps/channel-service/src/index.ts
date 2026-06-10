import cors from "cors";
import express from "express";
import { z } from "zod";
import type { MessageStatus } from "@xeno/shared-types";

type JobEvent = {
  status: MessageStatus;
  at: string;
  meta?: Record<string, unknown>;
};

type Job = {
  id: string;
  messageId: string;
  receiptUrl: string;
  receiptSecret: string;
  channel: string;
  recipient: string;
  content: string;
  events: JobEvent[];
  attempts: number;
  createdAt: string;
};

const port = Number(process.env.PORT ?? "4100");
const jobs = new Map<string, Job>();

function randomId() {
  return `job_${Math.random().toString(36).slice(2, 10)}`;
}

function randomDelay(min = 400, max = 1600) {
  return Math.floor(min + Math.random() * (max - min));
}

function randomStatus(): Exclude<MessageStatus, "queued"> {
  const roll = Math.random();
  if (roll < 0.12) return "failed";
  if (roll < 0.48) return "sent";
  if (roll < 0.72) return "delivered";
  if (roll < 0.9) return "opened";
  return "clicked";
}

async function postReceipt(job: Job, event: JobEvent, retry = 0): Promise<void> {
  const response = await fetch(job.receiptUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-receipt-secret": job.receiptSecret
    },
    body: JSON.stringify({
      messageId: job.messageId,
      status: event.status,
      at: event.at,
      meta: event.meta,
      receiptSecret: job.receiptSecret
    })
  });

  if (!response.ok) {
    if (retry < 3) {
      await new Promise((resolve) => setTimeout(resolve, 300 * (retry + 1)));
      return postReceipt(job, event, retry + 1);
    }
    throw new Error(`Receipt rejected with ${response.status}`);
  }
}

function enqueueProcessing(job: Job) {
  const pushEvent = async (status: MessageStatus, meta?: Record<string, unknown>) => {
    const event: JobEvent = { status, at: new Date().toISOString(), ...(meta ? { meta } : {}) };
    job.events.push(event);
    job.attempts += 1;
    await postReceipt(job, event);
  };

  const run = async () => {
    await new Promise((resolve) => setTimeout(resolve, randomDelay(300, 1000)));
    await pushEvent("sent");

    const terminal = randomStatus();
    await new Promise((resolve) => setTimeout(resolve, randomDelay(500, 2000)));

    if (terminal === "failed") {
      await pushEvent("failed", { reason: "Simulated carrier timeout" });
      return;
    }

    if (terminal === "sent") {
      await pushEvent("delivered");
      return;
    }

    if (terminal === "delivered") {
      await pushEvent("delivered");
      return;
    }

    if (terminal === "opened") {
      await pushEvent("delivered");
      await new Promise((resolve) => setTimeout(resolve, randomDelay(500, 1200)));
      await pushEvent("opened");
      return;
    }

    await pushEvent("delivered");
    await new Promise((resolve) => setTimeout(resolve, randomDelay(300, 900)));
    await pushEvent("opened");
    await new Promise((resolve) => setTimeout(resolve, randomDelay(200, 700)));
    await pushEvent("clicked");
  };

  run().catch((error) => {
    console.error("Channel processing failed", error);
    pushEvent("failed", { reason: error instanceof Error ? error.message : "Unknown channel error" }).catch(() => undefined);
  });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "channel-service" });
});

app.post("/send", async (req, res) => {
  const schema = z.object({
    messageId: z.string(),
    receiptUrl: z.string().url(),
    receiptSecret: z.string().min(1),
    channel: z.string().min(1),
    recipient: z.string().min(1),
    content: z.string().min(1)
  });

  const body = schema.parse(req.body);
  const job: Job = {
    id: randomId(),
    messageId: body.messageId,
    receiptUrl: body.receiptUrl,
    receiptSecret: body.receiptSecret,
    channel: body.channel,
    recipient: body.recipient,
    content: body.content,
    events: [],
    attempts: 0,
    createdAt: new Date().toISOString()
  };

  jobs.set(job.id, job);
  enqueueProcessing(job);

  res.status(202).json({
    ok: true,
    jobId: job.id,
    messageId: job.messageId,
    status: "queued"
  });
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

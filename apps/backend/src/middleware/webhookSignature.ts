import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export type RawBodyRequest = Request & {
  rawBody?: Buffer;
};

function webhookSecret() {
  return process.env.CRM_WEBHOOK_SECRET ?? "dev-secret";
}

function signBody(body: Buffer | string) {
  return crypto.createHmac("sha256", webhookSecret()).update(body).digest("hex");
}

function signaturesMatch(expected: string, received: string) {
  const normalized = received.startsWith("sha256=") ? received.slice("sha256=".length) : received;
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(normalized, "hex");

  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function verifyWebhookSignature(req: RawBodyRequest, res: Response, next: NextFunction) {
  const signature = req.header("x-xeno-signature");
  if (!signature) {
    return res.status(401).json({ error: "Missing webhook signature" });
  }

  const body = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
  const expected = signBody(body);

  try {
    if (!signaturesMatch(expected, signature)) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }
  } catch (_error) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  return next();
}

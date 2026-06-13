import type { Prisma } from "@prisma/client";
import type { OrderIngestionPayload } from "@xeno/shared-types";
import { prisma } from "../lib/prisma.js";

const attributionWindowMs = 24 * 60 * 60 * 1000;

export async function ingestOrder(input: OrderIngestionPayload) {
  const orderedAt = input.orderedAt ? new Date(input.orderedAt) : new Date();
  const windowStart = new Date(orderedAt.getTime() - attributionWindowMs);
  const totalAmount = input.totalAmount;

  return prisma.$transaction(async (tx) => {
    const attributionMessage = await tx.message.findFirst({
      where: {
        customerId: input.customerId,
        OR: [
          {
            readAt: {
              gte: windowStart,
              lte: orderedAt
            }
          },
          {
            openedAt: {
              gte: windowStart,
              lte: orderedAt
            }
          }
        ]
      },
      orderBy: [{ readAt: "desc" }, { openedAt: "desc" }]
    });

    const orderData: Prisma.OrderCreateInput = {
      customer: { connect: { id: input.customerId } },
      orderNumber: input.orderNumber,
      amount: totalAmount,
      totalAmount,
      currency: input.currency ?? "INR",
      status: input.status ?? "paid",
      orderedAt
    };

    if (attributionMessage) {
      orderData.attributedCampaign = { connect: { id: attributionMessage.campaignId } };
      orderData.attributedMessage = { connect: { id: attributionMessage.id } };
      orderData.attributedAt = orderedAt;
    }

    const order = await tx.order.create({ data: orderData });

    await tx.customer.update({
      where: { id: input.customerId },
      data: {
        totalSpent: { increment: totalAmount },
        orderCount: { increment: 1 },
        lastOrderedAt: orderedAt
      }
    });

    if (attributionMessage) {
      await tx.campaign.update({
        where: { id: attributionMessage.campaignId },
        data: {
          attributedRevenue: { increment: totalAmount }
        }
      });
    }

    return {
      order,
      attribution: attributionMessage
        ? {
            campaignId: attributionMessage.campaignId,
            messageId: attributionMessage.id,
            attributedRevenue: totalAmount
          }
        : null
    };
  });
}

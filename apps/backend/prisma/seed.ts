import { PrismaClient, Channel, MessageStatus, SegmentType, EngagementStatus } from "@prisma/client";

const prisma = new PrismaClient();

const names = [
  "Aarav Mehta",
  "Isha Sharma",
  "Rohan Kapoor",
  "Meera Iyer",
  "Kabir Singh",
  "Ananya Rao",
  "Vihaan Patel",
  "Saanvi Gupta",
  "Arjun Nair",
  "Diya Joshi",
  "Nikhil Bansal",
  "Tara Khanna"
];

const cities = ["Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Pune", "Chennai", "Kolkata", "Ahmedabad"];
const states = ["MH", "DL", "KA", "TS", "MH", "TN", "WB", "GJ"];

function pick<T>(items: T[], index: number) {
  return items[index % items.length];
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function addDays(base: Date, days: number) {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  return date;
}

async function main() {
  await prisma.message.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.segment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();

  const customers = [];
  const now = new Date();

  for (let index = 0; index < 36; index += 1) {
    const orderCount = 1 + (index % 6);
    const totalSpent = 1800 + orderCount * 1500 + (index % 4) * 650;
    const customer = await prisma.customer.create({
      data: {
        name: `${pick(names, index)} ${String.fromCharCode(65 + (index % 5))}`,
        email: `customer${index + 1}@xeno-demo.com`,
        phone: `+91-98${String(1000000 + index * 137).slice(-8)}`,
        city: pick(cities, index),
        state: pick(states, index),
        totalSpent: money(totalSpent),
        orderCount,
        lastOrderedAt: addDays(now, -((index * 7) % 120)),
        engagementStatus: pick([EngagementStatus.hot, EngagementStatus.warm, EngagementStatus.cold, EngagementStatus.dormant], index)
      }
    });
    customers.push(customer);

    for (let orderIndex = 0; orderIndex < orderCount; orderIndex += 1) {
      await prisma.order.create({
        data: {
          customerId: customer.id,
          orderNumber: `XENO-${index + 1}-${orderIndex + 1}`,
          amount: money(800 + orderIndex * 420 + (index % 5) * 115),
          totalAmount: money(800 + orderIndex * 420 + (index % 5) * 115),
          status: orderIndex === orderCount - 1 ? "delivered" : "fulfilled",
          orderedAt: addDays(now, -((index * 7) + orderIndex * 11))
        }
      });
    }
  }

  const segment = await prisma.segment.create({
    data: {
      name: "High value dormant shoppers",
      type: SegmentType.ai,
      definition: {
        type: "and",
        clauses: [
          { type: "spentGreaterThan", value: 5000 },
          { type: "lastOrderBeforeDays", value: 60 }
        ]
      },
      explanation: {
        title: "Customers likely to re-engage",
        rationale: ["Spent above the promotion threshold.", "Have not ordered recently."]
      },
      sourcePrompt: "Customers who spent more than INR 5000 and haven't ordered in 60 days",
      matchCount: 0
    }
  });

  const matchedCustomers = customers.filter((customer) => customer.totalSpent.toNumber() > 5000 && customer.lastOrderedAt && (now.getTime() - customer.lastOrderedAt.getTime()) / 86400000 > 60);

  const campaign = await prisma.campaign.create({
    data: {
      name: "Win-back weekend",
      goal: "Reactivate dormant premium customers with a limited-time offer",
      segmentId: segment.id,
      channel: Channel.whatsapp,
      messageTemplate: "Hi {{name}}, we miss you! Enjoy 15% off on your next order.",
      generatedCopy: "Hi {{name}}, we miss you. Come back this week and enjoy 15% off on your next order.",
      suggestedCta: "Redeem offer",
      status: "active",
      messageCount: matchedCustomers.length,
      sentCount: matchedCustomers.length,
      deliveredCount: Math.max(0, matchedCustomers.length - 2),
      openedCount: Math.max(0, matchedCustomers.length - 4),
      clickedCount: Math.max(0, matchedCustomers.length - 7),
      failedCount: 2
    }
  });

  let attributedRevenue = 0;

  for (let index = 0; index < matchedCustomers.length; index += 1) {
    const customer = matchedCustomers[index];
    const status = index % 7 === 0 ? "failed" : index % 5 === 0 ? "clicked" : index % 3 === 0 ? "opened" : "delivered";
    const events = [
      { status: "queued", at: addDays(now, -6 + index).toISOString() },
      { status: "sent", at: addDays(now, -5 + index).toISOString() },
      { status, at: addDays(now, -4 + index).toISOString() }
    ];

    const message = await prisma.message.create({
      data: {
        campaignId: campaign.id,
        customerId: customer.id,
        channel: Channel.whatsapp,
        recipient: customer.phone,
        content: `Hi ${customer.name}, we miss you! Enjoy 15% off on your next order.`,
        status: status as MessageStatus,
        statusEvents: events,
        sentAt: addDays(now, -5 + index),
        deliveredAt: status === "delivered" || status === "opened" || status === "clicked" ? addDays(now, -4 + index) : null,
        openedAt: status === "opened" || status === "clicked" ? addDays(now, -3 + index) : null,
        readAt: status === "opened" || status === "clicked" ? addDays(now, -3 + index) : null,
        clickedAt: status === "clicked" ? addDays(now, -2 + index) : null,
        failedAt: status === "failed" ? addDays(now, -4 + index) : null
      }
    });

    if (status === "opened" || status === "clicked") {
      const totalAmount = money(1200 + index * 135);
      attributedRevenue += totalAmount;
      await prisma.order.create({
        data: {
          customerId: customer.id,
          orderNumber: `ATTR-${index + 1}`,
          amount: totalAmount,
          totalAmount,
          status: "paid",
          orderedAt: addDays(now, -2 + index),
          attributedCampaignId: campaign.id,
          attributedMessageId: message.id,
          attributedAt: addDays(now, -2 + index)
        }
      });
    }
  }

  await prisma.segment.update({
    where: { id: segment.id },
    data: { matchCount: matchedCustomers.length }
  });

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { attributedRevenue }
  });

  console.log(`Seeded ${customers.length} customers and ${matchedCustomers.length} campaign messages.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

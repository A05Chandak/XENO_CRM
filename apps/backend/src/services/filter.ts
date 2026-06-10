import { Prisma } from "@prisma/client";
import type { SegmentFilter } from "@xeno/shared-types";

export function filterToWhere(filter: SegmentFilter): Prisma.CustomerWhereInput {
  if ("type" in filter && filter.type === "and") {
    return { AND: filter.clauses.map(filterToWhere) };
  }

  switch (filter.type) {
    case "spentGreaterThan":
      return { totalSpent: { gt: filter.value } };
    case "ordersCountGreaterThan":
      return { orderCount: { gt: filter.value } };
    case "lastOrderBeforeDays": {
      const date = new Date();
      date.setDate(date.getDate() - filter.value);
      return { lastOrderedAt: { lt: date } };
    }
    case "cityEquals":
      return { city: { equals: filter.value, mode: "insensitive" } };
    case "engagementStatusEquals":
      return { engagementStatus: filter.value };
    default:
      return {};
  }
}

export function summarizeFilter(filter: SegmentFilter): string {
  if ("type" in filter && filter.type === "and") {
    return filter.clauses.map(summarizeFilter).join(" and ");
  }

  switch (filter.type) {
    case "spentGreaterThan":
      return `spent more than INR ${filter.value}`;
    case "ordersCountGreaterThan":
      return `placed more than ${filter.value} orders`;
    case "lastOrderBeforeDays":
      return `last ordered more than ${filter.value} days ago`;
    case "cityEquals":
      return `live in ${filter.value}`;
    case "engagementStatusEquals":
      return `have ${filter.value} engagement`;
    default:
      return "match a CRM rule";
  }
}

import type { AnalyticsSummary, Channel } from "@xeno/shared-types";

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export type CustomerApi = {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  totalSpent: number;
  orderCount: number;
  lastOrderedAt: string | null;
  engagementStatus: string;
  orders: Array<OrderApi>;
};

export type OrderApi = {
  id: string;
  orderNumber: string;
  amount: number;
  status: string;
  orderedAt: string;
  customer?: CustomerApi;
};

export type SegmentApi = {
  id: string;
  name: string;
  type: "manual" | "ai";
  definition: unknown;
  explanation: unknown;
  sourcePrompt?: string | null;
  matchCount: number;
  createdAt: string;
};

export type CampaignApi = {
  id: string;
  name: string;
  goal: string;
  segmentId: string;
  channel: Channel;
  messageTemplate: string;
  generatedCopy?: string | null;
  suggestedCta?: string | null;
  status: string;
  messageCount: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  failedCount: number;
  createdAt: string;
  segment?: SegmentApi;
};

export type MessageApi = {
  id: string;
  campaignId: string;
  customerId: string;
  channel: Channel;
  recipient: string;
  content: string;
  status: string;
  statusEvents: Array<{ status: string; at: string; meta?: Record<string, unknown> }>;
  attempts: number;
  createdAt: string;
  customer: CustomerApi;
  campaign?: CampaignApi;
};

export const api = {
  customers: () => apiFetch<CustomerApi[]>("/customers"),
  customer: (id: string) => apiFetch<CustomerApi & { messages: MessageApi[]; orders: OrderApi[] }>("/customers/" + id),
  orders: () => apiFetch<OrderApi[]>("/orders"),
  segments: () => apiFetch<SegmentApi[]>("/segments"),
  campaigns: () => apiFetch<CampaignApi[]>("/campaigns"),
  campaignMessages: (id: string) => apiFetch<MessageApi[]>(`/campaigns/${id}/messages`),
  analytics: () => apiFetch<AnalyticsSummary>("/analytics/dashboard"),
  createManualSegment: (payload: { name: string; filter: unknown; explanation?: unknown }) =>
    apiFetch<SegmentApi>("/segments/manual", { method: "POST", body: JSON.stringify(payload) }),
  createAiSegment: (payload: { name: string; prompt: string }) =>
    apiFetch<{ segment: SegmentApi; parsed: unknown }>("/segments/ai", { method: "POST", body: JSON.stringify(payload) }),
  createCampaign: (payload: {
    name: string;
    goal: string;
    segmentId: string;
    channel: Channel;
    messageTemplate: string;
    generatedCopy?: string;
    suggestedCta?: string;
  }) => apiFetch<CampaignApi>("/campaigns", { method: "POST", body: JSON.stringify(payload) }),
  launchCampaign: (id: string) => apiFetch<{ campaignId: string; launched: number; audienceSize: number }>(`/campaigns/${id}/send`, { method: "POST" }),
  aiCopy: (payload: { goal: string; channel: Channel; segmentSummary: string }) =>
    apiFetch<{ copy: string; cta: string; subject: string; explanation: string }>("/ai/campaign-copy", { method: "POST", body: JSON.stringify(payload) }),
  aiChannel: (payload: { goal: string; segmentSummary: string }) =>
    apiFetch<{ channel: Channel; rationale: string }>("/ai/channel-recommendation", { method: "POST", body: JSON.stringify(payload) }),
  segmentAudience: (id: string) => apiFetch<CustomerApi[]>(`/segments/${id}/audience`)
};

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

export type Channel = "whatsapp" | "sms" | "email" | "rcs";

export type MessageStatus = "queued" | "sent" | "delivered" | "opened" | "clicked" | "failed";

export type SegmentType = "manual" | "ai";

export type EngagementStatus = "cold" | "warm" | "hot" | "dormant";

export type SegmentFilter =
  | {
      type: "and";
      clauses: SegmentFilter[];
    }
  | {
      type: "spentGreaterThan";
      value: number;
    }
  | {
      type: "ordersCountGreaterThan";
      value: number;
    }
  | {
      type: "lastOrderBeforeDays";
      value: number;
    }
  | {
      type: "cityEquals";
      value: string;
    }
  | {
      type: "engagementStatusEquals";
      value: EngagementStatus;
    };

export type SegmentExplainability = {
  title: string;
  rationale: string[];
};

export type AIParsedSegment = {
  filter: SegmentFilter;
  explanation: SegmentExplainability;
};

export type CampaignMessagePayload = {
  id: string;
  campaignId: string;
  customerId: string;
  channel: Channel;
  recipient: string;
  content: string;
  status: MessageStatus;
  statusEvents: Array<{
    status: MessageStatus;
    at: string;
    meta?: Record<string, unknown>;
  }>;
};

export type AnalyticsSummary = {
  total: number;
  byStatus: Record<MessageStatus, number>;
  byChannel: Record<Channel, number>;
  funnel: Array<{ label: string; value: number }>;
  timeSeries: Array<{ date: string; sent: number; delivered: number; opened: number; clicked: number; failed: number }>;
};

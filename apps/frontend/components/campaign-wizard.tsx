"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { api, type CampaignApi, type SegmentApi } from "../lib/api";
import type { Channel } from "@xeno/shared-types";

const channels: Channel[] = ["whatsapp", "sms", "email", "rcs"];

export function CampaignWizard({ segments, campaigns }: { segments: SegmentApi[]; campaigns: CampaignApi[] }) {
  const [name, setName] = useState("Weekend win-back");
  const [goal, setGoal] = useState("Reactivate dormant high-value shoppers with a limited-time offer");
  const [segmentId, setSegmentId] = useState(segments[0]?.id ?? "");
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [messageTemplate, setMessageTemplate] = useState("Hi {{name}}, we miss you! Enjoy 15% off on your next order.");
  const [generatedCopy, setGeneratedCopy] = useState(messageTemplate);
  const [cta, setCta] = useState("Redeem offer");
  const [assistantNote, setAssistantNote] = useState("Use AI to rewrite this campaign by channel.");
  const [activeCampaigns, setActiveCampaigns] = useState(campaigns);
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns[0]?.id ?? "");
  const [selectedMessages, setSelectedMessages] = useState<Array<{ id: string; recipient: string; status: string; statusEvents: Array<{ status: string; at: string }>; content: string; channel: Channel }>>([]);
  const [pending, startTransition] = useTransition();

  const segmentSummary = useMemo(() => {
    const segment = segments.find((entry) => entry.id === segmentId);
    return segment ? `${segment.name} with ${segment.matchCount} matched customers.` : "No segment selected.";
  }, [segmentId, segments]);

  useEffect(() => {
    if (!segmentId && segments[0]?.id) {
      setSegmentId(segments[0].id);
    }
  }, [segmentId, segments]);

  useEffect(() => {
    if (!selectedCampaignId && activeCampaigns[0]?.id) {
      setSelectedCampaignId(activeCampaigns[0].id);
    }
  }, [activeCampaigns, selectedCampaignId]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedCampaignId) {
      setSelectedMessages([]);
      return;
    }

    void refreshTimeline(selectedCampaignId, cancelled);

    return () => {
      cancelled = true;
    };
  }, [selectedCampaignId]);

  async function refreshTimeline(campaignId: string, cancelled = false) {
    const messages = await api.campaignMessages(campaignId);
    if (!cancelled) {
      setSelectedMessages(messages);
    }
  }

  const generateCopy = () => {
    startTransition(async () => {
      try {
        const ai = await api.aiCopy({ goal, channel, segmentSummary });
        setGeneratedCopy(ai.copy);
        setCta(ai.cta);
        setAssistantNote(`${ai.explanation} Suggested CTA: ${ai.cta}`);
      } catch (error) {
        setAssistantNote(error instanceof Error ? error.message : "Failed to generate copy.");
      }
    });
  };

  const recommendChannel = () => {
    startTransition(async () => {
      try {
        const ai = await api.aiChannel({ goal, segmentSummary });
        setChannel(ai.channel);
        setAssistantNote(`AI recommendation: ${ai.channel}. ${ai.rationale}`);
      } catch (error) {
        setAssistantNote(error instanceof Error ? error.message : "Failed to recommend a channel.");
      }
    });
  };

  const createCampaign = () => {
    startTransition(async () => {
      try {
        const campaign = await api.createCampaign({
          name,
          goal,
          segmentId,
          channel,
          messageTemplate,
          generatedCopy,
          suggestedCta: cta
        });
        setActiveCampaigns((current) => [campaign, ...current]);
        setAssistantNote(`Campaign "${campaign.name}" created. Launch it to start the simulated delivery flow.`);
      } catch (error) {
        setAssistantNote(error instanceof Error ? error.message : "Failed to create campaign.");
      }
    });
  };

  const launchCampaign = (campaignId: string) => {
    startTransition(async () => {
      try {
        setActiveCampaigns((current) =>
          current.map((campaign) => (campaign.id === campaignId ? { ...campaign, status: "sending" } : campaign))
        );
        const result = await api.launchCampaign(campaignId);
        setActiveCampaigns((current) =>
          current.map((campaign) => (campaign.id === campaignId ? { ...campaign, status: "active" } : campaign))
        );
        await refreshTimeline(campaignId);
        setAssistantNote(`Queued ${result.launched} messages for delivery across the selected audience.`);
      } catch (error) {
        setAssistantNote(error instanceof Error ? error.message : "Failed to launch campaign.");
      }
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="panel p-5">
        <div className="panel-title">Campaign builder</div>
        <h2 className="mt-2 text-2xl font-semibold text-white">Create, personalize, and launch a message</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Campaign name" value={name} onChange={setName} />
          <label className="block">
            <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Segment</span>
            <select
              value={segmentId}
              onChange={(event) => setSegmentId(event.target.value)}
              className="mt-2 w-full rounded-3xl border border-white/10 bg-ink-900/70 px-4 py-3 text-sm text-white outline-none"
            >
              {segments.map((segment) => (
                <option key={segment.id} value={segment.id}>
                  {segment.name}
                </option>
              ))}
            </select>
          </label>
          <Field label="Goal" value={goal} onChange={setGoal} />
          <label className="block">
            <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Channel</span>
            <select
              value={channel}
              onChange={(event) => setChannel(event.target.value as Channel)}
              className="mt-2 w-full rounded-3xl border border-white/10 bg-ink-900/70 px-4 py-3 text-sm text-white outline-none"
            >
              {channels.map((option) => (
                <option key={option} value={option}>
                  {option.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-[0.3em] text-slate-500">Message template</label>
            <textarea
              value={messageTemplate}
              onChange={(event) => setMessageTemplate(event.target.value)}
              className="mt-2 h-28 w-full rounded-3xl border border-white/10 bg-ink-900/70 p-4 text-sm text-slate-100 outline-none"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={recommendChannel} disabled={pending} className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-100 transition hover:bg-white/6 disabled:opacity-50">
            Suggest channel
          </button>
          <button onClick={generateCopy} disabled={pending} className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-100 transition hover:bg-white/6 disabled:opacity-50">
            Generate copy
          </button>
          <button onClick={createCampaign} disabled={pending} className="rounded-2xl bg-ember-400 px-4 py-3 text-sm font-medium text-ink-950 transition hover:bg-ember-500 disabled:opacity-50">
            Save campaign
          </button>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-white/8 bg-white/4 p-4">
            <div className="panel-title">Live preview</div>
            <div className="mt-3 rounded-3xl border border-white/8 bg-ink-900/70 p-4 text-sm leading-6 text-slate-100">
              {(generatedCopy || messageTemplate).replace(/\{\{name\}\}/g, "Aarav")}
            </div>
            <div className="mt-3 text-xs uppercase tracking-[0.35em] text-emerald-300">CTA: {cta}</div>
          </div>
          <div className="rounded-3xl border border-white/8 bg-white/4 p-4">
            <div className="panel-title">AI assistant</div>
            <div className="mt-3 text-sm leading-6 text-slate-300">{assistantNote}</div>
            <div className="mt-4 text-xs uppercase tracking-[0.3em] text-slate-500">{segmentSummary}</div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="panel p-5">
          <div className="panel-title">Campaigns</div>
          <div className="mt-4 space-y-3">
            {activeCampaigns.map((campaign) => (
              <div key={campaign.id} className="rounded-3xl border border-white/8 bg-white/4 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-white">{campaign.name}</div>
                    <div className="mt-1 text-sm text-slate-400">{campaign.segment?.name ?? "Segment"} | {campaign.channel}</div>
                  </div>
                  <div className="rounded-full bg-ember-500/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-ember-300">{campaign.status}</div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Stat label="Sent" value={campaign.sentCount} />
                  <Stat label="Opened" value={campaign.openedCount} />
                  <Stat label="Clicked" value={campaign.clickedCount} />
                  <Stat label="Failed" value={campaign.failedCount} />
                </div>
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => setSelectedCampaignId(campaign.id)}
                    className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-100 transition hover:bg-white/6"
                  >
                    Inspect
                  </button>
                  <button
                    onClick={() => launchCampaign(campaign.id)}
                    className="rounded-2xl bg-white px-4 py-3 text-sm font-medium text-ink-950 transition hover:bg-slate-100"
                  >
                    Launch
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel p-5">
          <div className="panel-title">Why this matters</div>
          <div className="mt-3 text-sm leading-6 text-slate-300">
            The campaign record stores the chosen segment, channel, copy, CTA, and message counts so the dashboard can stay fully API-backed.
          </div>
        </div>
        <div className="panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="panel-title">Message timeline</div>
            <button onClick={() => selectedCampaignId && refreshTimeline(selectedCampaignId)} className="rounded-full border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.25em] text-slate-300">
              Refresh
            </button>
          </div>
          <div className="mt-3 space-y-3">
            {selectedMessages.slice(0, 6).map((message) => (
              <div key={message.id} className="rounded-3xl border border-white/8 bg-white/4 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-white">{message.recipient}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.3em] text-slate-500">{message.channel}</div>
                  </div>
                  <div className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-emerald-300">{message.status}</div>
                </div>
                <div className="mt-3 text-sm leading-6 text-slate-300">{message.content}</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {message.statusEvents.map((event) => (
                    <span key={`${message.id}-${event.status}-${event.at}`} className="rounded-full border border-white/8 bg-ink-900/80 px-3 py-1 text-xs text-slate-300">
                      {event.status} @ {new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {!selectedMessages.length ? <div className="text-sm text-slate-400">Launch or inspect a campaign to view its message timeline.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.3em] text-slate-500">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-3xl border border-white/10 bg-ink-900/70 px-4 py-3 text-sm text-white outline-none" />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-ink-900/70 p-3">
      <div className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

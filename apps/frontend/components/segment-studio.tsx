"use client";

import { useMemo, useState, useTransition } from "react";
import { api, type SegmentApi } from "../lib/api";

const blankFilter = `{\n  "type": "and",\n  "clauses": [\n    { "type": "spentGreaterThan", "value": 5000 },\n    { "type": "lastOrderBeforeDays", "value": 60 }\n  ]\n}`;

export function SegmentStudio({ initialSegments }: { initialSegments: SegmentApi[] }) {
  const [segments, setSegments] = useState(initialSegments);
  const [name, setName] = useState("High value dormant shoppers");
  const [manualJson, setManualJson] = useState(blankFilter);
  const [aiPrompt, setAiPrompt] = useState("Customers who spent more than INR 5000 and haven't ordered in 60 days");
  const [output, setOutput] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const sortedSegments = useMemo(() => [...segments].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)), [segments]);

  const createManual = () => {
    startTransition(async () => {
      try {
        const parsed = JSON.parse(manualJson) as unknown;
        const segment = await api.createManualSegment({ name, filter: parsed });
        setSegments((current) => [segment, ...current]);
        setOutput(`Manual segment "${segment.name}" saved with ${segment.matchCount} matching customers.`);
      } catch (error) {
        setOutput(error instanceof Error ? error.message : "Failed to create manual segment.");
      }
    });
  };

  const createAi = () => {
    startTransition(async () => {
      try {
        const result = await api.createAiSegment({ name, prompt: aiPrompt });
        setSegments((current) => [result.segment, ...current]);
        setOutput(`AI parsed your segment and created "${result.segment.name}".`);
      } catch (error) {
        setOutput(error instanceof Error ? error.message : "Failed to create AI segment.");
      }
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="panel p-5">
        <div className="panel-title">Segment builder</div>
        <h2 className="mt-2 text-2xl font-semibold text-white">Manual and AI-assisted segmentation</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Segment name" value={name} onChange={setName} />
          <div />
          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-[0.3em] text-slate-500">Manual filter JSON</label>
            <textarea
              value={manualJson}
              onChange={(event) => setManualJson(event.target.value)}
              className="mt-2 h-48 w-full rounded-3xl border border-white/10 bg-ink-900/70 p-4 font-mono text-sm text-slate-100 outline-none"
            />
          </div>
        </div>
        <button
          onClick={createManual}
          disabled={pending}
          className="mt-4 rounded-2xl bg-white px-5 py-3 text-sm font-medium text-ink-950 transition hover:bg-slate-100 disabled:opacity-50"
        >
          Save manual segment
        </button>

        <div className="mt-10 border-t border-white/8 pt-6">
          <div className="panel-title">AI input</div>
          <textarea
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            className="mt-3 h-32 w-full rounded-3xl border border-white/10 bg-ink-900/70 p-4 text-sm text-slate-100 outline-none"
          />
          <button
            onClick={createAi}
            disabled={pending}
            className="mt-4 rounded-2xl bg-ember-400 px-5 py-3 text-sm font-medium text-ink-950 transition hover:bg-ember-500 disabled:opacity-50"
          >
            Create AI segment
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="panel p-5">
          <div className="panel-title">Explainability</div>
          <div className="mt-3 min-h-28 rounded-3xl border border-dashed border-white/10 bg-white/4 p-4 text-sm leading-6 text-slate-300">
            {output || "AI segment explanations and save results appear here."}
          </div>
        </div>
        <div className="panel p-5">
          <div className="panel-title">Saved segments</div>
          <div className="mt-4 space-y-3">
            {sortedSegments.map((segment) => (
              <div key={segment.id} className="rounded-2xl border border-white/8 bg-white/4 p-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-white">{segment.name}</div>
                  <div className="rounded-full bg-ember-500/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-ember-300">{segment.type}</div>
                </div>
                <div className="mt-2 text-sm text-slate-400">{segment.matchCount} customers match this segment.</div>
              </div>
            ))}
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
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-3xl border border-white/10 bg-ink-900/70 px-4 py-3 text-sm text-white outline-none"
      />
    </label>
  );
}

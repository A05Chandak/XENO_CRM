import { api } from "../../lib/api";
import { MetricCard } from "../../components/metrics";
import { DashboardCharts } from "../../components/dashboard-charts";

export default async function DashboardPage() {
  const [analytics, campaigns] = await Promise.all([api.analytics(), api.campaigns()]);
  const totals = {
    sent: analytics.byStatus.sent + analytics.byStatus.delivered + analytics.byStatus.opened + analytics.byStatus.clicked,
    delivered: analytics.byStatus.delivered + analytics.byStatus.opened + analytics.byStatus.clicked,
    opened: analytics.byStatus.opened + analytics.byStatus.clicked,
    clicked: analytics.byStatus.clicked,
    failed: analytics.byStatus.failed
  };

  return (
    <div className="space-y-8">
      <section className="panel p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="panel-title">Analytics dashboard</div>
            <h2 className="mt-2 text-4xl font-semibold text-white">Campaign performance from real message records</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Every metric comes from persisted messages and receipts, so the funnel reflects the same data the delivery simulation writes.
            </p>
          </div>
          <div className="rounded-3xl border border-white/8 bg-white/4 px-5 py-4 text-sm text-slate-300">
            {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"} tracked
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Sent" value={String(totals.sent)} note="Queued to the channel simulator" />
        <MetricCard label="Delivered" value={String(totals.delivered)} note="Receipts confirmed by webhook" />
        <MetricCard label="Opened" value={String(totals.opened)} note="Seen in the recipient inbox" />
        <MetricCard label="Clicked" value={String(totals.clicked)} note="CTA engagement captured" accent="text-ember-400" />
        <MetricCard label="Failed" value={String(totals.failed)} note="Simulated delivery failures" accent="text-red-300" />
      </section>

      <DashboardCharts analytics={analytics} />

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="panel p-5">
          <div className="panel-title">Channel performance</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {Object.entries(analytics.byChannel).map(([channel, value]) => (
              <div key={channel} className="rounded-3xl border border-white/8 bg-white/4 p-4">
                <div className="text-xs uppercase tracking-[0.3em] text-slate-500">{channel}</div>
                <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel p-5">
        <div className="panel-title">Campaign snapshot</div>
        <div className="mt-4 space-y-3">
          {campaigns.slice(0, 3).map((campaign) => (
            <div key={campaign.id} className="rounded-3xl border border-white/8 bg-white/4 p-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-white">{campaign.name}</div>
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-500">{campaign.channel}</div>
                </div>
                <div className="mt-2 text-sm text-slate-400">{campaign.segment?.name ?? "Segment"} | {campaign.status}</div>
                <div className="mt-3 text-sm text-emerald-300">
                  {campaign.sentCount} sent | {campaign.deliveredCount} delivered | {campaign.clickedCount} clicked
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

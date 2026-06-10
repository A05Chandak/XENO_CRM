import Link from "next/link";
import { ReactNode } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/customers", label: "Customers" },
  { href: "/segments", label: "Segments" },
  { href: "/campaigns", label: "Campaigns" }
];

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen noise">
      <div className="mx-auto grid min-h-screen max-w-[1600px] lg:grid-cols-[270px_1fr]">
        <aside className="border-b border-white/10 bg-ink-950/60 px-6 py-6 lg:border-r lg:border-b-0 lg:px-7">
          <div className="mb-10">
            <div className="text-xs uppercase tracking-[0.55em] text-ember-400">Xeno Mini CRM</div>
            <h1 className="mt-3 text-3xl font-semibold leading-tight text-white">
              AI-native shopper outreach, minus the fake plumbing.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Segments, campaigns, simulated delivery, and analytics from one data model.
            </p>
          </div>
          <nav className="space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-slate-200 transition hover:border-ember-400/30 hover:bg-white/8"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-10 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            OpenAI is used server-side for segment parsing, copy generation, and channel recommendation.
          </div>
        </aside>
        <main className="px-5 py-6 sm:px-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}

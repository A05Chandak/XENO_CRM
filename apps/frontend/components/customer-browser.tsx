"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { api, formatCurrency, type CustomerApi, type MessageApi, type OrderApi } from "../lib/api";

function relativeDate(value: string | null) {
  if (!value) return "Never";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  return `${days}d ago`;
}

export function CustomerBrowser({ customers }: { customers: CustomerApi[] }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(customers[0]?.id ?? "");
  const [detail, setDetail] = useState<(CustomerApi & { messages: MessageApi[]; orders: OrderApi[] }) | null>(null);
  const deferredQuery = useDeferredValue(query);

  const visibleCustomers = useMemo(() => {
    const lowered = deferredQuery.toLowerCase();
    return customers.filter((customer) =>
      [customer.name, customer.email, customer.city, customer.engagementStatus].some((value) => value.toLowerCase().includes(lowered))
    );
  }, [customers, deferredQuery]);

  const selectedCustomer = visibleCustomers.find((customer) => customer.id === selectedId) ?? visibleCustomers[0];
  const latestMessage = detail?.messages?.[0];

  useEffect(() => {
    if (!visibleCustomers.length) {
      return;
    }
    if (!visibleCustomers.some((customer) => customer.id === selectedId)) {
      const firstCustomer = visibleCustomers[0];
      if (firstCustomer) {
        setSelectedId(firstCustomer.id);
      }
    }
  }, [selectedId, visibleCustomers]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedId) {
      setDetail(null);
      return;
    }

    api.customer(selectedId).then((response) => {
      if (!cancelled) {
        setDetail(response);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
      <div className="panel p-5">
        <div className="flex flex-col gap-3 border-b border-white/8 pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="panel-title">Customer roster</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Customers and order history</h2>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, city, status..."
            className="w-full rounded-2xl border border-white/10 bg-ink-900/70 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 md:max-w-xs"
          />
        </div>
        <div className="mt-4 overflow-hidden rounded-3xl border border-white/8">
          <table className="min-w-full divide-y divide-white/8 text-left text-sm">
            <thead className="bg-white/4 text-slate-400">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Orders</th>
                <th className="px-4 py-3">Spent</th>
                <th className="px-4 py-3">Last order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {visibleCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  onClick={() => setSelectedId(customer.id)}
                  className={`cursor-pointer transition hover:bg-white/4 ${selectedCustomer?.id === customer.id ? "bg-ember-500/10" : ""}`}
                >
                  <td className="px-4 py-4">
                    <div className="font-medium text-white">{customer.name}</div>
                    <div className="text-xs text-slate-400">{customer.email}</div>
                  </td>
                  <td className="px-4 py-4 text-slate-300">{customer.city}</td>
                  <td className="px-4 py-4 text-slate-300">{customer.orderCount}</td>
                  <td className="px-4 py-4 text-slate-300">{formatCurrency(customer.totalSpent)}</td>
                  <td className="px-4 py-4 text-slate-300">{relativeDate(customer.lastOrderedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel p-5">
        {selectedCustomer ? (
          <div>
            <div className="panel-title">Selected customer</div>
            <h3 className="mt-2 text-2xl font-semibold text-white">{detail?.name ?? selectedCustomer.name}</h3>
            <p className="mt-1 text-sm text-slate-400">{detail?.city ?? selectedCustomer.city} | {detail?.engagementStatus ?? selectedCustomer.engagementStatus}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Stat label="Total spent" value={formatCurrency(detail?.totalSpent ?? selectedCustomer.totalSpent)} />
              <Stat label="Orders" value={String(detail?.orderCount ?? selectedCustomer.orderCount)} />
            </div>
            <div className="mt-6">
              <div className="panel-title">Recent orders</div>
              <div className="mt-3 space-y-3">
                {(detail?.orders ?? selectedCustomer.orders).map((order) => (
                  <div key={order.id} className="rounded-2xl border border-white/8 bg-white/4 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-white">{order.orderNumber}</div>
                      <div className="text-sm text-ember-400">{formatCurrency(order.amount)}</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {new Date(order.orderedAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })} | {order.status}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-3xl border border-white/8 bg-white/4 p-4 text-sm text-slate-400">
                {latestMessage ? (
                  <>
                    Latest campaign touch: <span className="text-slate-100">{latestMessage.campaign?.name ?? latestMessage.campaignId}</span> via {latestMessage.channel}
                  </>
                ) : (
                  "No campaign messages yet for this customer."
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-slate-400">No customer selected.</div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
      <div className="text-xs uppercase tracking-[0.3em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

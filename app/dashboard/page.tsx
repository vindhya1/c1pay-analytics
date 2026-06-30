"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface Summary {
  total_users: string;
  total_transactions: string;
  total_volume_dollars: string;
  pending_requests: string;
  pending_dollars: string;
}

interface DashboardData {
  summary: Summary;
  paymentRequestsByStatus: { status: string; count: string; total_dollars: string }[];
  transactionVolumeByDay: { date: string; count: string; volume_dollars: string }[];
  topUsersByBalance: { username: string; balance_dollars: string }[];
  userRegistrationsByDay: { date: string; count: string }[];
  recentTransactions: {
    id: number;
    sender: string;
    recipient: string;
    amount_dollars: string;
    note: string;
    created_at: string;
  }[];
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b",
  PAID: "#22c55e",
  DECLINED: "#ef4444",
  CANCELLED: "#6b7280",
};

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 flex flex-col gap-1">
      <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{value}</p>
      {sub && <p className="text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500 text-sm">
        Failed to load: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-screen text-zinc-400 text-sm">
        Loading dashboard…
      </div>
    );
  }

  const { summary, paymentRequestsByStatus, transactionVolumeByDay, topUsersByBalance, userRegistrationsByDay, recentTransactions } = data;

  const txnByDay = transactionVolumeByDay.map((d) => ({
    date: fmt(d.date),
    volume: parseFloat(d.volume_dollars),
    count: parseInt(d.count),
  }));

  const regByDay = userRegistrationsByDay.map((d) => ({
    date: fmt(d.date),
    users: parseInt(d.count),
  }));

  const topUsers = topUsersByBalance.map((u) => ({
    username: u.username,
    balance: parseFloat(u.balance_dollars),
  }));

  const pieData = paymentRequestsByStatus.map((s) => ({
    name: s.status,
    value: parseInt(s.count),
    dollars: parseFloat(s.total_dollars),
  }));

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">c1pay Analytics</h1>
            <p className="text-sm text-zinc-500">Live data from your database</p>
          </div>
          <a
            href="/chat"
            className="text-sm px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Ask AI →
          </a>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard label="Total Users" value={Number(summary.total_users).toLocaleString()} />
          <KpiCard label="Transactions" value={Number(summary.total_transactions).toLocaleString()} />
          <KpiCard label="Total Volume" value={`$${Number(summary.total_volume_dollars).toLocaleString()}`} />
          <KpiCard
            label="Pending Requests"
            value={Number(summary.pending_requests).toLocaleString()}
            sub={`$${Number(summary.pending_dollars).toLocaleString()} at risk`}
          />
          <KpiCard
            label="Avg Txn Value"
            value={
              summary.total_transactions !== "0"
                ? `$${(Number(summary.total_volume_dollars) / Number(summary.total_transactions)).toFixed(2)}`
                : "—"
            }
          />
        </div>

        {/* Charts row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Transaction volume */}
          <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">
              Transaction Volume — Last 30 Days
            </h2>
            {txnByDay.length === 0 ? (
              <p className="text-zinc-400 text-sm text-center py-12">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={txnByDay} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, "Volume"]} />
                  <Bar dataKey="volume" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Payment requests pie */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">
              Payment Requests by Status
            </h2>
            {pieData.length === 0 ? (
              <p className="text-zinc-400 text-sm text-center py-12">No data</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number, name: string) => [v, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1 mt-2">
                  {pieData.map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[s.name] ?? "#94a3b8" }} />
                        <span className="text-zinc-600 dark:text-zinc-400">{s.name}</span>
                      </span>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">{s.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Charts row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top users by balance */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">
              Top 10 Users by Balance
            </h2>
            {topUsers.length === 0 ? (
              <p className="text-zinc-400 text-sm text-center py-12">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={topUsers} layout="vertical" barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="username" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={80} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, "Balance"]} />
                  <Bar dataKey="balance" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* User registrations */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">
              New User Registrations — Last 30 Days
            </h2>
            {regByDay.length === 0 ? (
              <p className="text-zinc-400 text-sm text-center py-12">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={regByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip formatter={(v: number) => [v, "New users"]} />
                  <Line type="monotone" dataKey="users" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent transactions table */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Recent Transactions</h2>
          {recentTransactions.length === 0 ? (
            <p className="text-zinc-400 text-sm">No transactions yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800">
                  <th className="pb-2 font-medium">From</th>
                  <th className="pb-2 font-medium">To</th>
                  <th className="pb-2 font-medium text-right">Amount</th>
                  <th className="pb-2 font-medium hidden sm:table-cell">Note</th>
                  <th className="pb-2 font-medium hidden md:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {recentTransactions.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2.5 text-zinc-800 dark:text-zinc-200 font-medium">{t.sender}</td>
                    <td className="py-2.5 text-zinc-600 dark:text-zinc-400">{t.recipient}</td>
                    <td className="py-2.5 text-right font-semibold text-green-600">${Number(t.amount_dollars).toLocaleString()}</td>
                    <td className="py-2.5 text-zinc-500 hidden sm:table-cell truncate max-w-[160px]">{t.note || "—"}</td>
                    <td className="py-2.5 text-zinc-400 hidden md:table-cell text-xs">
                      {new Date(t.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}

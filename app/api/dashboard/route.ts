import { callTool } from "@/lib/mcp-client";

export async function GET() {
  try {
    const [
      summary,
      paymentRequestsByStatus,
      transactionVolumeByDay,
      topUsersByBalance,
      userRegistrationsByDay,
      recentTransactions,
    ] = await Promise.all([
      callTool("get_dashboard_summary"),
      callTool("get_payment_requests_summary_by_status"),
      callTool("get_transaction_volume_by_day"),
      callTool("get_top_users_by_balance"),
      callTool("get_user_registrations_by_day"),
      callTool("get_transaction_history", { limit: 5 }),
    ]);

    // Normalize get_dashboard_summary shape into flat KPI fields
    const raw = summary as {
      users: { total: number; total_balance_dollars: string };
      transactions: { total: number; total_volume_dollars: string };
      payment_requests_by_status: { status: string; count: number; total_dollars: string }[];
    };
    const pending = raw.payment_requests_by_status?.find((s) => s.status === "PENDING");
    const normalizedSummary = {
      total_users: String(raw.users?.total ?? 0),
      total_transactions: String(raw.transactions?.total ?? 0),
      total_volume_dollars: String(raw.transactions?.total_volume_dollars ?? "0"),
      pending_requests: String(pending?.count ?? 0),
      pending_dollars: String(pending?.total_dollars ?? "0"),
    };

    return Response.json({
      summary: normalizedSummary,
      paymentRequestsByStatus,
      transactionVolumeByDay,
      topUsersByBalance,
      userRegistrationsByDay,
      recentTransactions: Array.isArray(recentTransactions)
        ? (recentTransactions as Record<string, unknown>[]).map((t) => ({
            ...t,
            amount_dollars: t.amount_dollars ?? (Number(t.amount_cents) / 100).toFixed(2),
          }))
        : [],
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

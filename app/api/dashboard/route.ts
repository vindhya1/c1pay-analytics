import { Pool } from "pg";

const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "c1pay",
  user: process.env.PGUSER || process.env.USER,
});

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
      // KPI summary
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM users) AS total_users,
          (SELECT COUNT(*) FROM transactions) AS total_transactions,
          (SELECT ROUND(COALESCE(SUM(amount_cents), 0) / 100.0, 2) FROM transactions) AS total_volume_dollars,
          (SELECT COUNT(*) FROM payment_requests WHERE status = 'PENDING') AS pending_requests,
          (SELECT ROUND(COALESCE(SUM(amount_cents), 0) / 100.0, 2) FROM payment_requests WHERE status = 'PENDING') AS pending_dollars
      `),

      // Payment requests by status
      pool.query(`
        SELECT status, COUNT(*) AS count, ROUND(SUM(amount_cents)/100.0, 2) AS total_dollars
        FROM payment_requests
        GROUP BY status
        ORDER BY count DESC
      `),

      // Transaction volume by day (last 30 days)
      pool.query(`
        SELECT
          DATE(created_at) AS date,
          COUNT(*) AS count,
          ROUND(SUM(amount_cents) / 100.0, 2) AS volume_dollars
        FROM transactions
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `),

      // Top 10 users by balance
      pool.query(`
        SELECT username, ROUND(balance_cents / 100.0, 2) AS balance_dollars
        FROM users
        ORDER BY balance_cents DESC
        LIMIT 10
      `),

      // User registrations by day (last 30 days)
      pool.query(`
        SELECT
          DATE(created_at) AS date,
          COUNT(*) AS count
        FROM users
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `),

      // Recent 5 transactions
      pool.query(`
        SELECT t.id, s.username AS sender, r.username AS recipient,
               ROUND(t.amount_cents / 100.0, 2) AS amount_dollars,
               t.note, t.created_at
        FROM transactions t
        JOIN users s ON s.id = t.sender_id
        JOIN users r ON r.id = t.recipient_id
        ORDER BY t.created_at DESC
        LIMIT 5
      `),
    ]);

    return Response.json({
      summary: summary.rows[0],
      paymentRequestsByStatus: paymentRequestsByStatus.rows,
      transactionVolumeByDay: transactionVolumeByDay.rows,
      topUsersByBalance: topUsersByBalance.rows,
      userRegistrationsByDay: userRegistrationsByDay.rows,
      recentTransactions: recentTransactions.rows,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

import { Form, Link } from "react-router";

import { agingBucketKeys, type AgingBucket } from "./aging";
import type { AgingDashboardData } from "./aging-dashboard.server";
import styles from "../collections/collections-dashboard.module.css";

function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

function syncLabel(status: AgingDashboardData["shop"]["syncStatus"]): string {
  return {
    NOT_STARTED: "Not synchronized",
    SYNCING: "Initial sync in progress",
    PARTIAL: "Partially synchronized",
    RECONCILING: "Reconciling Shopify data",
    FRESH: "Current projection",
    STALE: "Projection may be stale",
    FAILED: "Synchronization needs attention",
  }[status];
}

function canShowBalances(status: AgingDashboardData["shop"]["syncStatus"]): boolean {
  return status !== "NOT_STARTED" && status !== "FAILED";
}

function agingBucketLabel(bucket: AgingBucket): string {
  return {
    CURRENT: "Current",
    ONE_TO_THIRTY: "1–30",
    THIRTY_ONE_TO_SIXTY: "31–60",
    SIXTY_ONE_TO_NINETY: "61–90",
    NINETY_PLUS: "90+",
  }[bucket];
}

export function AgingDashboard({ data }: { data: AgingDashboardData }) {
  const balancesVisible = canShowBalances(data.shop.syncStatus);
  const isComplete = data.shop.syncStatus === "FRESH";
  const hasReceivables = data.currencies.some(
    (currency) => Number(currency.totalOutstanding) > 0,
  );

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Receivables aging</h1>
          <span className={isComplete ? styles.previewLabel : styles.unsyncedLabel}>
            {syncLabel(data.shop.syncStatus)}
          </span>
        </div>
        <div className={styles.queueActions}>
          <Link className={styles.clearButton} to="/app/collections">Today’s collections</Link>
          <Link className={styles.clearButton} to="/app/reminders">Reminders</Link>
          <a className={styles.clearButton} href="/app/exports/aging.csv">Export CSV</a>
        </div>
      </header>

      <section className={styles.overview} aria-label="Receivables aging summary">
        <div className={styles.syncBar} role={isComplete ? "status" : "alert"}>
          <strong>{syncLabel(data.shop.syncStatus)}</strong>
          <span>
            {data.shop.lastReconciledAt
              ? `Last reconciled ${new Date(data.shop.lastReconciledAt).toLocaleString()}`
              : "No completed reconciliation yet"}
          </span>
          {!isComplete ? <span>Totals are not presented as fully reconciled.</span> : null}
          {data.shop.latestWork?.state === "FAILED" ? (
            <span>Last synchronization attempt failed. Retry is available.</span>
          ) : null}
          <Form method="post">
            <input type="hidden" name="intent" value="synchronize" />
            <button
              className={styles.clearButton}
              type="submit"
              disabled={
                data.shop.latestWork?.state === "QUEUED" ||
                data.shop.latestWork?.state === "PROCESSING"
              }
            >
              {data.shop.latestWork?.state === "QUEUED" ||
              data.shop.latestWork?.state === "PROCESSING"
                ? "Synchronization running"
                : data.shop.syncStatus === "NOT_STARTED"
                  ? "Start synchronization"
                  : data.shop.syncStatus === "FAILED"
                    ? "Retry synchronization"
                    : "Reconcile now"}
            </button>
          </Form>
        </div>

        {!balancesVisible ? (
          <div className={styles.dataSafetyNote}>
            <strong>Financial totals are unavailable.</strong>
            <span>Complete or repair Shopify synchronization before relying on balances.</span>
          </div>
        ) : hasReceivables ? (
          data.currencies.map((currency) => (
            <section key={currency.currency} aria-label={`${currency.currency} aging`}>
              <div className={styles.summaryGrid}>
                <div><span>Total outstanding</span><strong>{formatMoney(currency.totalOutstanding, currency.currency)}</strong><small>{currency.currency}</small></div>
                <div><span>Overdue</span><strong>{formatMoney(currency.overdue, currency.currency)}</strong><small>{currency.currency}</small></div>
                <div><span>Due within 7 days</span><strong>{formatMoney(currency.dueSoon, currency.currency)}</strong><small>{currency.currency}</small></div>
                <div><span>Recently paid</span><strong>{formatMoney(currency.recentlyPaid, currency.currency)}</strong><small>{currency.currency}</small></div>
              </div>
              <div className={styles.agingGrid}>
                {agingBucketKeys.map((bucket) => (
                  <div key={bucket}>
                    <span>{agingBucketLabel(bucket)}</span>
                    <strong>{formatMoney(currency.buckets[bucket], currency.currency)}</strong>
                  </div>
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className={styles.dataSafetyNote} role="status">
            <strong>No active payment-term receivables.</strong>
            <span>Paid, canceled, refunded, zero, and negative balances are excluded from active aging.</span>
          </div>
        )}
      </section>

      {balancesVisible ? (
        <section className={styles.queuePanel} aria-label="Receivables">
          <Form className={styles.filters} method="get">
            <label className={styles.searchControl}>Company<input name="company" defaultValue={data.filters.company} placeholder="All companies" /></label>
            <label className={styles.selectControl}>Status<select name="status" defaultValue={data.filters.status}><option value="all">All active</option><option value="overdue">Overdue</option><option value="current">Current</option></select></label>
            <label className={styles.selectControl}>Currency<input name="currency" defaultValue={data.filters.currency} placeholder="USD" maxLength={3} /></label>
            <label className={styles.selectControl}>Age<select name="age" defaultValue={data.filters.age}><option value="all">All</option><option value="current">Current</option><option value="1-30">1–30</option><option value="31-60">31–60</option><option value="61-90">61–90</option><option value="90+">90+</option></select></label>
            <label className={styles.selectControl}>Minimum amount<input name="amountMin" inputMode="decimal" defaultValue={data.filters.amountMin} /></label>
            <label className={styles.selectControl}>Maximum amount<input name="amountMax" inputMode="decimal" defaultValue={data.filters.amountMax} /></label>
            <label className={styles.selectControl}>Due from<input name="dueFrom" type="date" defaultValue={data.filters.dueFrom} /></label>
            <label className={styles.selectControl}>Due to<input name="dueTo" type="date" defaultValue={data.filters.dueTo} /></label>
            <button className={styles.clearButton} type="submit">Apply filters</button>
            <Link className={styles.clearButton} to=".">Clear</Link>
          </Form>
          <div className={styles.tableScroller}>
            <table>
              <thead><tr><th>Company / order</th><th>Outstanding</th><th>Due date</th><th>Age</th><th>Aging bucket</th></tr></thead>
              <tbody>
                {data.receivables.map((receivable) => (
                  <tr key={receivable.id}>
                    <td>{receivable.companyId ? <Link to={`/app/companies/${receivable.companyId}`}><strong>{receivable.companyName ?? "Unassigned company"}</strong></Link> : <strong>{receivable.companyName ?? "Unassigned company"}</strong>}<Link to={`/app/receivables/${receivable.id}`}><span>{receivable.orderName}</span></Link></td>
                    <td><strong>{formatMoney(receivable.outstandingAmount, receivable.currency)}</strong><span>{receivable.currency}</span></td>
                    <td>{receivable.dueDate}</td>
                    <td>{receivable.daysOverdue > 0 ? `${receivable.daysOverdue} days overdue` : receivable.daysOverdue === 0 ? "Due today" : `Due in ${Math.abs(receivable.daysOverdue)} days`}</td>
                    <td>{agingBucketLabel(receivable.bucket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className={styles.tableFooter}><span>{data.receivables.length} scheduled receivable{data.receivables.length === 1 ? "" : "s"}</span><span>All amounts remain partitioned by currency.</span></footer>
        </section>
      ) : null}

      {balancesVisible && (data.missingSchedule.count > 0 || data.excluded.zeroBalance > 0 || data.excluded.negativeBalance > 0) ? (
        <aside className={styles.dataSafetyNote} aria-label="Receivables needing review">
          <strong>Needs review</strong>
          <span>{data.missingSchedule.count} open receivable{data.missingSchedule.count === 1 ? " is" : "s are"} missing a Shopify payment schedule and excluded from aging buckets. {data.excluded.zeroBalance} zero and {data.excluded.negativeBalance} negative open balance{data.excluded.zeroBalance + data.excluded.negativeBalance === 1 ? " is" : "s are"} excluded from active aging.</span>
        </aside>
      ) : null}
    </main>
  );
}

import { Form, Link } from "react-router";

import styles from "./collections-dashboard.module.css";

type QueueData = {
  queue: Array<{
    id: string;
    companyId: string | null;
    companyName: string | null;
    orderName: string;
    outstandingAmount: string;
    currency: string;
    dueAt: string;
    daysOverdue: number;
    priorityReasons: string[];
  }>;
  generatedAt: string;
  syncStatus: string;
  lastReconciledAt: string | null;
};

function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

function dateInputValue(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

export function CollectionsQueue({ data }: { data: QueueData }) {
  const projectionCurrent = data.syncStatus === "FRESH";

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Today’s collections</h1>
          <span className={projectionCurrent ? styles.previewLabel : styles.unsyncedLabel}>
            {projectionCurrent ? "Current Shopify projection" : "Projection needs review"}
          </span>
        </div>
        <div className={styles.queueActions}>
          <Link className={styles.clearButton} to="/app">View aging</Link>
          <Link className={styles.clearButton} to="/app/reminders">Reminders</Link>
        </div>
      </header>

      <aside className={styles.dataSafetyNote} role={projectionCurrent ? "status" : "alert"}>
        <strong>Priority is explainable and stable.</strong>
        <span>
          Items are ordered by an overdue promise, overdue age, outstanding amount within the item’s own currency, then a stable due-date and ID tie-breaker. Shopify remains the payment authority.
          {data.lastReconciledAt ? ` Last reconciled ${new Date(data.lastReconciledAt).toLocaleString()}.` : " No completed reconciliation yet."}
        </span>
      </aside>

      <section className={styles.queuePanel} aria-label="Daily collections queue">
        <div className={styles.tableScroller}>
          <table>
            <thead><tr><th>Company / order</th><th>Outstanding</th><th>Due</th><th>Why now</th><th>Queue action</th></tr></thead>
            <tbody>
              {data.queue.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.companyId ? <Link to={`/app/companies/${item.companyId}`}><strong>{item.companyName ?? "Unassigned company"}</strong></Link> : <strong>{item.companyName ?? "Unassigned company"}</strong>}
                    <Link to={`/app/receivables/${item.id}`}><span>{item.orderName}</span></Link>
                  </td>
                  <td><strong>{formatMoney(item.outstandingAmount, item.currency)}</strong><span>{item.currency}</span></td>
                  <td><strong>{item.daysOverdue > 0 ? `${item.daysOverdue} days overdue` : item.daysOverdue === 0 ? "Due today" : `Due in ${Math.abs(item.daysOverdue)} days`}</strong><span>{item.dueAt}</span></td>
                  <td><ul className={styles.priorityReasons}>{item.priorityReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></td>
                  <td>
                    <div className={styles.queueActions}>
                      <Form method="post">
                        <input type="hidden" name="intent" value="dismiss" />
                        <input type="hidden" name="receivableId" value={item.id} />
                        <button type="submit" className={styles.clearButton}>Dismiss today</button>
                      </Form>
                      <Form method="post" className={styles.inlineForm}>
                        <input type="hidden" name="intent" value="snooze" />
                        <input type="hidden" name="receivableId" value={item.id} />
                        <label>Snooze until <input name="until" type="date" min={dateInputValue(1)} defaultValue={dateInputValue(1)} /></label>
                        <button type="submit" className={styles.clearButton}>Snooze</button>
                      </Form>
                    </div>
                  </td>
                </tr>
              ))}
              {data.queue.length === 0 ? <tr><td colSpan={5}><span className={styles.emptyCell}>No receivables need action today. Snoozed and dismissed items remain in their history.</span></td></tr> : null}
            </tbody>
          </table>
        </div>
        <footer className={styles.tableFooter}><span>{data.queue.length} actionable receivable{data.queue.length === 1 ? "" : "s"}</span><span>Amounts are never summed across currencies.</span></footer>
      </section>
    </main>
  );
}

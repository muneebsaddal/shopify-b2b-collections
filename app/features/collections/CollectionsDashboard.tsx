import { useMemo, useState } from "react";

import {
  agingBuckets,
  filterQueue,
  formatMoney,
  queueItems,
  sortByPriority,
  type QueueFilters,
  type QueueItem,
} from "./dashboard-data";
import styles from "./collections-dashboard.module.css";

const initialFilters: QueueFilters = {
  company: "",
  status: "all",
  currency: "USD",
  age: "all",
};

const summaries = [
  { label: "Total outstanding", amount: 247350.18, tone: "neutral" },
  { label: "Overdue", amount: 143210.45, tone: "attention" },
  { label: "Due soon", amount: 63784.62, tone: "attention" },
  { label: "Recently paid", amount: 40355.11, tone: "success" },
] as const;

function Icon({ name }: { name: "check" | "pause" | "close" | "send" }) {
  const paths = {
    check: <path d="m5 12 4 4L19 6" />,
    pause: (
      <>
        <path d="M9 5v14" />
        <path d="M15 5v14" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12" />
        <path d="m18 6-12 12" />
      </>
    ),
    send: (
      <>
        <path d="m3 11 18-8-8 18-2-8-8-2Z" />
        <path d="m11 13 4-4" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  const id = `filter-${label.toLocaleLowerCase()}`;

  return (
    <div className={styles.selectControl}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DueState({ item }: { item: QueueItem }) {
  const text =
    item.daysOverdue > 0
      ? `${item.daysOverdue} days overdue`
      : item.daysOverdue === 0
        ? "Due today"
        : item.daysOverdue >= -14
          ? `${Math.abs(item.daysOverdue)} days`
          : "Current";

  return (
    <div>
      <strong className={styles[`due_${item.status}`]}>{text}</strong>
      <span className={styles.secondaryLine}>{item.dueLabel}</span>
    </div>
  );
}

function CompanyDetail({
  item,
  onClose,
  onAction,
}: {
  item: QueueItem;
  onClose: () => void;
  onAction: (message: string) => void;
}) {
  const firstInvoice = Math.round(item.outstanding * 0.5124 * 100) / 100;
  const secondInvoice = Math.round(item.outstanding * 0.3016 * 100) / 100;
  const thirdInvoice = item.outstanding - firstInvoice - secondInvoice;

  return (
    <aside className={styles.detailRail} aria-label={`${item.company} details`}>
      <div className={styles.detailHeader}>
        <div>
          <h2>{item.company}</h2>
          <span>{item.reference}</span>
        </div>
        <button
          className={styles.iconButton}
          type="button"
          onClick={onClose}
          aria-label="Close company details"
        >
          <Icon name="close" />
        </button>
      </div>

      <section className={styles.detailSection}>
        <div className={styles.sectionHeading}>
          <h3>Receivables</h3>
          <strong>{formatMoney(item.outstanding, item.currency)}</strong>
        </div>
        <div className={styles.invoiceHeader}>
          <span>Invoice</span>
          <span>Due date</span>
          <span>Amount</span>
        </div>
        <div className={styles.invoiceRow}>
          <span>INV-20418</span>
          <span>May 17</span>
          <strong>{formatMoney(firstInvoice, item.currency)}</strong>
        </div>
        <div className={styles.invoiceRow}>
          <span>INV-20477</span>
          <span>May 24</span>
          <strong>{formatMoney(secondInvoice, item.currency)}</strong>
        </div>
        <div className={styles.invoiceRow}>
          <span>INV-20533</span>
          <span>May 31</span>
          <strong>{formatMoney(thirdInvoice, item.currency)}</strong>
        </div>
      </section>

      <section className={styles.detailSection}>
        <h3>Recent activity</h3>
        <ol className={styles.timeline}>
          <li>
            <span className={styles.timelineDot}>✓</span>
            <div>
              <strong>Promise recorded</strong>
              <small>Promise to pay on May 17</small>
            </div>
            <time>May 10</time>
          </li>
          <li>
            <span className={styles.timelineIcon}>✉</span>
            <div>
              <strong>Follow-up 1 sent</strong>
              <small>Email reminder sent</small>
            </div>
            <time>May 3</time>
          </li>
          <li>
            <span className={styles.timelineIcon}>⌕</span>
            <div>
              <strong>Call attempted</strong>
              <small>No answer</small>
            </div>
            <time>May 2</time>
          </li>
        </ol>
        <button className={styles.textButton} type="button">
          View all activity
        </button>
      </section>

      <section className={styles.promiseSection}>
        <div className={styles.sectionHeading}>
          <h3>Promise to pay</h3>
          <span className={styles.successTag}>Active</span>
        </div>
        <dl>
          <div>
            <dt>Amount</dt>
            <dd>{formatMoney(item.outstanding, item.currency)}</dd>
          </div>
          <div>
            <dt>Due date</dt>
            <dd>May 17, 2026</dd>
          </div>
          <div>
            <dt>Promised by</dt>
            <dd>Jessica Carter</dd>
          </div>
          <div>
            <dt>Promise note</dt>
            <dd>Customer confirmed ACH payment on May 17.</dd>
          </div>
        </dl>
      </section>

      <div className={styles.detailActions}>
        <button type="button" onClick={() => onAction("Note draft opened")}>
          Add note
        </button>
        <button type="button" onClick={() => onAction("Promise form opened")}>
          Record promise
        </button>
        <button
          type="button"
          onClick={() => onAction(`${item.company} snoozed for one day`)}
        >
          Snooze
        </button>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={() =>
            onAction("Approved reminder queued for eligibility recheck")
          }
        >
          <Icon name="send" />
          Send approved reminder
        </button>
      </div>
    </aside>
  );
}

export function CollectionsDashboard({
  preview = false,
}: {
  preview?: boolean;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [selectedId, setSelectedId] = useState("crown-beauty");
  const [automationPaused, setAutomationPaused] = useState(false);
  const [notice, setNotice] = useState("");

  const visibleItems = useMemo(
    () => sortByPriority(filterQueue(queueItems, filters)),
    [filters],
  );
  const selectedItem = queueItems.find((item) => item.id === selectedId);

  const updateFilter = (key: keyof QueueFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Today&apos;s collections</h1>
          {preview ? (
            <span className={styles.previewLabel}>Preview data</span>
          ) : null}
        </div>
        <button
          className={
            automationPaused ? styles.resumeButton : styles.pauseButton
          }
          type="button"
          onClick={() => {
            setAutomationPaused((value) => !value);
            setNotice(
              automationPaused ? "Automation resumed" : "Automation paused",
            );
          }}
        >
          <Icon name="pause" />
          {automationPaused ? "Resume automation" : "Pause automation"}
        </button>
      </header>

      {notice ? (
        <div className={styles.notice} role="status">
          {notice}
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            <Icon name="close" />
          </button>
        </div>
      ) : null}

      <section className={styles.overview} aria-label="Receivables summary">
        <div className={styles.syncBar}>
          <span className={styles.syncIcon}>
            <Icon name="check" />
          </span>
          <strong>Fully reconciled</strong>
          <span>Last reconciled 8 minutes ago</span>
          <button
            type="button"
            onClick={() => setNotice("Reconciliation refresh requested")}
          >
            Refresh
          </button>
        </div>
        <div className={styles.summaryGrid}>
          {summaries.map((summary) => (
            <div key={summary.label}>
              <span>
                <i className={styles[summary.tone]} />
                {summary.label}
              </span>
              <strong>{formatMoney(summary.amount, "USD")}</strong>
              <small>USD</small>
            </div>
          ))}
        </div>
        <div className={styles.agingGrid}>
          {agingBuckets.map((bucket) => (
            <div key={bucket.label}>
              <span>{bucket.label}</span>
              <strong>{formatMoney(bucket.amount, "USD")}</strong>
            </div>
          ))}
        </div>
      </section>

      <div className={styles.workspace}>
        <section className={styles.queuePanel} aria-label="Collections queue">
          <div className={styles.filters}>
            <div className={styles.searchControl}>
              <label htmlFor="filter-company">Company</label>
              <input
                id="filter-company"
                value={filters.company}
                placeholder="All companies"
                onChange={(event) =>
                  updateFilter("company", event.target.value)
                }
              />
            </div>
            <SelectFilter
              label="Status"
              value={filters.status}
              onChange={(value) => updateFilter("status", value)}
              options={[
                { label: "All", value: "all" },
                { label: "Overdue", value: "overdue" },
                { label: "Promise", value: "promise" },
                { label: "Due soon", value: "due-soon" },
                { label: "Current", value: "current" },
              ]}
            />
            <SelectFilter
              label="Currency"
              value={filters.currency}
              onChange={(value) => updateFilter("currency", value)}
              options={[
                { label: "All", value: "all" },
                { label: "USD", value: "USD" },
                { label: "CAD", value: "CAD" },
              ]}
            />
            <SelectFilter
              label="Age"
              value={filters.age}
              onChange={(value) => updateFilter("age", value)}
              options={[
                { label: "All", value: "all" },
                { label: "Current", value: "current" },
                { label: "1–30", value: "1-30" },
                { label: "31–60", value: "31-60" },
                { label: "61–90", value: "61-90" },
                { label: "90+", value: "90+" },
              ]}
            />
            <button
              className={styles.clearButton}
              type="button"
              onClick={() => setFilters(initialFilters)}
            >
              Clear filters
            </button>
          </div>

          <div className={styles.tableScroller}>
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Outstanding</th>
                  <th>Days overdue / Due date</th>
                  <th>Stage / Promise</th>
                  <th>Priority reason</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => (
                  <tr
                    key={item.id}
                    className={
                      item.id === selectedId ? styles.selectedRow : undefined
                    }
                    onClick={() => setSelectedId(item.id)}
                  >
                    <td>
                      <button
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                      >
                        <strong>{item.company}</strong>
                        <span>{item.reference}</span>
                      </button>
                    </td>
                    <td>
                      <strong>
                        {formatMoney(item.outstanding, item.currency)}
                      </strong>
                      <span>{item.currency}</span>
                    </td>
                    <td>
                      <DueState item={item} />
                    </td>
                    <td>
                      <span className={styles.stageTag}>{item.stage}</span>
                    </td>
                    <td>{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className={styles.tableFooter}>
            <span>
              {visibleItems.length} of {queueItems.length} accounts
            </span>
            <span>
              Priority is explainable and based on current Shopify state.
            </span>
          </footer>
        </section>

        {selectedItem ? (
          <CompanyDetail
            item={selectedItem}
            onClose={() => setSelectedId("")}
            onAction={setNotice}
          />
        ) : null}
      </div>
    </main>
  );
}

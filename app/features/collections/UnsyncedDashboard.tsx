import styles from "./collections-dashboard.module.css";

export function UnsyncedDashboard() {
  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Today&apos;s collections</h1>
          <span className={styles.unsyncedLabel}>Not synchronized</span>
        </div>
      </header>

      <section
        className={styles.onboardingCard}
        aria-labelledby="unsynced-heading"
      >
        <div className={styles.onboardingCopy}>
          <span className={styles.onboardingEyebrow}>Shopify data setup</span>
          <h2 id="unsynced-heading">Receivables are not synchronized yet</h2>
          <p>
            Financial balances and collection actions stay hidden until the
            initial Shopify sync completes and the imported data is fully
            reconciled.
          </p>
        </div>

        <dl className={styles.setupStatus}>
          <div>
            <dt>Shopify admin</dt>
            <dd>
              <span className={styles.readyDot} aria-hidden="true" />
              Authenticated
            </dd>
          </div>
          <div>
            <dt>Initial sync</dt>
            <dd>
              <span className={styles.pendingDot} aria-hidden="true" />
              Not started
            </dd>
          </div>
          <div>
            <dt>Dashboard totals</dt>
            <dd>
              <span className={styles.pendingDot} aria-hidden="true" />
              Unavailable until reconciliation
            </dd>
          </div>
        </dl>

        <div className={styles.dataSafetyNote} role="status">
          <strong>No financial data is shown.</strong>
          <span>
            Sample balances are available only on the explicitly labeled
            preview route.
          </span>
        </div>
      </section>
    </main>
  );
}

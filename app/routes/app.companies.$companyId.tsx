import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import styles from "../features/collections/collections-dashboard.module.css";
import { loadCompanyCollectionHistory } from "../features/collections/collections-workflow.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (!params.companyId) throw new Response("Not found", { status: 404 });
  const company = await loadCompanyCollectionHistory(session.shop, params.companyId);
  if (!company) throw new Response("Not found", { status: 404 });
  return company;
};

export default function CompanyDetail() {
  const company = useLoaderData<typeof loader>();
  const returnTo = `/app/companies/${company.id}`;
  return <main className={styles.page}>
    <Link to="/app/collections">← Back to today’s collections</Link>
    <header className={styles.detailPageHeader}><span className={styles.onboardingEyebrow}>Company collection history</span><h1>{company.displayName}</h1></header>
    <div className={styles.queueActions}>
      <a className={styles.primaryButton} href={`/app/companies/${company.id}/statement`} target="_blank" rel="noreferrer">Preview statement</a>
      <Form method="post" action="/app/reminders"><input type="hidden" name="intent" value="suppress-company" /><input type="hidden" name="companyId" value={company.id} /><input type="hidden" name="suppressed" value={String(!company.remindersSuppressed)} /><input type="hidden" name="reasonCode" value="merchant_company_control" /><button type="submit">{company.remindersSuppressed ? "Resume company reminders" : "Suppress company reminders"}</button></Form>
    </div>
    <section className={styles.reliabilityPanel} aria-label="Payment reliability facts">
      <div><strong>{company.reliability.eligibleInvoiceCount}</strong><span>Shopify-recorded paid invoices with due/payment facts</span></div>
      <div><strong>{company.reliability.paidLateCount}</strong><span>Paid after their due date</span></div>
      <div><strong>{company.reliability.medianDaysLate ?? "—"}</strong><span>Median days late</span></div>
      <div><strong>{company.reliability.brokenPromiseCount}</strong><span>Broken promises recorded</span></div>
      <p>These are explainable collection facts, not a credit score, and never change Shopify payment state.</p>
    </section>
    <div className={styles.historyGrid}>
      <section className={styles.queuePanel} aria-label="Company receivables">
        <div className={styles.tableScroller}><table><thead><tr><th>Order</th><th>Outstanding</th><th>Due date</th><th>Shopify status</th></tr></thead><tbody>{company.receivables.map((receivable) => <tr key={receivable.id}><td><Link to={`/app/receivables/${receivable.id}`}>{receivable.orderName}</Link></td><td>{receivable.outstandingAmount} {receivable.currency}</td><td>{receivable.dueAt ? new Date(receivable.dueAt).toLocaleDateString() : "Missing payment schedule"}</td><td>{receivable.status}</td></tr>)}</tbody></table></div></section>
      <aside className={styles.historyPanel} aria-label="Collection timeline">
        <h2>Collection timeline</h2>
        <ol className={styles.timeline}>{company.actions.map((action) => <li key={action.id}><span className={styles.timelineIcon}>•</span><div><strong>{action.safeSummary}</strong><small>{action.effectiveAt ? `Effective ${new Date(action.effectiveAt).toLocaleDateString()}` : "Collection activity"}</small></div><time>{new Date(action.createdAt).toLocaleDateString()}</time></li>)}{company.actions.length === 0 ? <li><div><strong>No collection activity yet</strong></div></li> : null}</ol>
      </aside>
    </div>
    <div className={styles.historyGrid}>
      <section className={styles.historyPanel} aria-label="Internal notes">
        <h2>Notes</h2>
        <Form method="post" action="/app/collections" className={styles.noteForm}><input type="hidden" name="intent" value="note" /><input type="hidden" name="companyId" value={company.id} /><input type="hidden" name="returnTo" value={returnTo} /><label>Type<select name="noteType" defaultValue="INTERNAL"><option value="INTERNAL">Internal note</option><option value="EXTERNAL_PAYMENT">External-payment note (non-authoritative)</option><option value="DISPUTE">Dispute note</option></select></label><label>Note<textarea name="body" required maxLength={4000} /></label><button className={styles.primaryButton} type="submit">Add note</button></Form>
        <ol className={styles.noteList}>{company.notes.map((note) => <li key={note.id}><strong>{note.type === "EXTERNAL_PAYMENT" ? "External payment claim — non-authoritative" : note.type.replaceAll("_", " ")}</strong><p>{note.body}</p><time>{new Date(note.createdAt).toLocaleString()}</time></li>)}</ol>
      </section>
      <section className={styles.historyPanel} aria-label="Promises to pay">
        <h2>Promises to pay</h2>
        <ol className={styles.noteList}>{company.promises.map((promise) => <li key={promise.id}><strong>{promise.status}</strong><p>Due {new Date(promise.promisedAt).toLocaleDateString()}{promise.promisedAmount ? ` · ${promise.promisedAmount} ${promise.currency}` : ""}</p>{promise.note ? <p>{promise.note}</p> : null}<Link to={`/app/receivables/${promise.receivableId}`}>Open receivable</Link></li>)}{company.promises.length === 0 ? <li>No promises recorded.</li> : null}</ol>
      </section>
    </div>
  </main>;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

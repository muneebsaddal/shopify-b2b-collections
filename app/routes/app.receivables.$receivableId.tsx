import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import styles from "../features/collections/collections-dashboard.module.css";
import { loadReceivableCollectionHistory } from "../features/collections/collections-workflow.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (!params.receivableId) throw new Response("Not found", { status: 404 });
  const receivable = await loadReceivableCollectionHistory(session.shop, params.receivableId);
  if (!receivable) throw new Response("Not found", { status: 404 });
  return receivable;
};

export default function ReceivableDetail() {
  const receivable = useLoaderData<typeof loader>();
  const returnTo = `/app/receivables/${receivable.id}`;
  return <main className={styles.page}>
    <Link to={receivable.company ? `/app/companies/${receivable.company.id}` : "/app/collections"}>← Back to collection history</Link>
    <header className={styles.detailPageHeader}><span className={styles.onboardingEyebrow}>Shopify receivable projection</span><h1>{receivable.orderName}</h1><p>{receivable.company?.displayName ?? "Unassigned company"}</p></header>
    <section className={styles.onboardingCard}><dl className={styles.setupStatus}><div><dt>Outstanding</dt><dd>{receivable.outstandingAmount} {receivable.currency}</dd></div><div><dt>Due date</dt><dd>{receivable.dueAt ? new Date(receivable.dueAt).toLocaleDateString() : "Missing payment schedule"}</dd></div><div><dt>Shopify status</dt><dd>{receivable.status}</dd></div></dl><p>Notes and promises provide collection context only. They never alter the authoritative Shopify balance or payment state.</p></section>
    <div className={styles.historyGrid}>
      <section className={styles.historyPanel}><h2>Record a promise to pay</h2><Form method="post" action="/app/collections" className={styles.noteForm}><input type="hidden" name="intent" value="promise" /><input type="hidden" name="receivableId" value={receivable.id} /><input type="hidden" name="returnTo" value={returnTo} /><label>Promised date<input name="promisedAt" type="date" required /></label><label>Optional amount ({receivable.currency})<input name="promisedAmount" inputMode="decimal" /></label><label>Internal context<textarea name="body" maxLength={4000} /></label><button className={styles.primaryButton} type="submit">Record promise</button></Form><ol className={styles.noteList}>{receivable.promises.map((promise) => <li key={promise.id}><strong>{promise.status}</strong><p>Promised for {new Date(promise.promisedAt).toLocaleDateString()}{promise.promisedAmount ? ` · ${promise.promisedAmount} ${promise.currency}` : ""}</p>{promise.note ? <p>{promise.note}</p> : null}{promise.status === "OPEN" ? <div className={styles.promiseButtons}>{["FULFILLED", "BROKEN", "CANCELED"].map((status) => <Form method="post" action="/app/collections" key={status}><input type="hidden" name="intent" value="promise-transition" /><input type="hidden" name="promiseId" value={promise.id} /><input type="hidden" name="status" value={status} /><input type="hidden" name="returnTo" value={returnTo} /><button className={styles.clearButton} type="submit">Mark {status.toLocaleLowerCase()}</button></Form>)}</div> : null}</li>)}{receivable.promises.length === 0 ? <li>No promises recorded.</li> : null}</ol></section>
      <section className={styles.historyPanel}><h2>Notes and timeline</h2><Form method="post" action="/app/collections" className={styles.noteForm}><input type="hidden" name="intent" value="note" /><input type="hidden" name="receivableId" value={receivable.id} /><input type="hidden" name="returnTo" value={returnTo} /><label>Type<select name="noteType" defaultValue="INTERNAL"><option value="INTERNAL">Internal note</option><option value="EXTERNAL_PAYMENT">External-payment note (non-authoritative)</option><option value="DISPUTE">Dispute note</option></select></label><label>Note<textarea name="body" required maxLength={4000} /></label><button className={styles.primaryButton} type="submit">Add note</button></Form><ol className={styles.noteList}>{receivable.notes.map((note) => <li key={note.id}><strong>{note.type === "EXTERNAL_PAYMENT" ? "External payment claim — non-authoritative" : note.type.replaceAll("_", " ")}</strong><p>{note.body}</p><time>{new Date(note.createdAt).toLocaleString()}</time></li>)}</ol><ol className={styles.timeline}>{receivable.actions.map((action) => <li key={action.id}><span className={styles.timelineIcon}>•</span><div><strong>{action.safeSummary}</strong><small>{action.effectiveAt ? `Effective ${new Date(action.effectiveAt).toLocaleDateString()}` : "Collection activity"}</small></div><time>{new Date(action.createdAt).toLocaleDateString()}</time></li>)}</ol></section>
    </div>
  </main>;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

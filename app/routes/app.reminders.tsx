import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, redirect, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import styles from "../features/collections/collections-dashboard.module.css";
import { correlationIdFromRequest } from "../operations/correlation.server";
import { EntitlementDeniedError } from "../billing/entitlement-service.server";
import {
  approveAndActivatePolicy,
  createReminderPolicyDraft,
  loadReminderSettings,
  previewReminderPolicy,
  ReminderPolicyInputError,
  requestReplyToVerification,
  setGlobalReminderPause,
  verifyReplyTo,
} from "../reminders/policy-service.server";
import { setCompanyReminderSuppression } from "../reminders/suppression-service.server";
import { authenticate } from "../shopify.server";

function field(form: FormData, name: string, maximum = 10_000) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return loadReminderSettings(session.shop);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = field(form, "intent", 40);
  const correlationId = correlationIdFromRequest(request);
  try {
    if (intent === "request-verification") {
      await requestReplyToVerification({
        shopDomain: session.shop,
        email: field(form, "email", 320),
        correlationId,
      });
    } else if (intent === "verify-reply-to") {
      await verifyReplyTo({
        shopDomain: session.shop,
        email: field(form, "email", 320),
        code: field(form, "code", 6),
      });
    } else if (intent === "create-policy") {
      const stageDefinitions = [
        { key: "pre_due", defaultOffset: -3 },
        { key: "due", defaultOffset: 0 },
        { key: "overdue", defaultOffset: 7 },
      ];
      const policyId = await createReminderPolicyDraft({
        shopDomain: session.shop,
        name: field(form, "name", 120),
        senderDisplayName: field(form, "senderDisplayName", 120),
        replyTo: field(form, "replyTo", 320),
        minimumOutstanding: field(form, "minimumOutstanding", 24),
        policyId: field(form, "policyId", 64) || undefined,
        stages: stageDefinitions.map((stage) => ({
          stageKey: stage.key,
          offsetDays: Number(field(form, `${stage.key}Offset`, 5) || stage.defaultOffset),
          subject: field(form, `${stage.key}Subject`, 200),
          body: field(form, `${stage.key}Body`),
          enabled: form.get(`${stage.key}Enabled`) === "on",
        })).filter((stage) => stage.enabled),
        correlationId,
      });
      return redirect(`/app/reminders?created=${policyId}`);
    } else if (intent === "preview-policy") {
      const policyId = field(form, "policyId", 64);
      await previewReminderPolicy(session.shop, policyId);
      return redirect(`/app/reminders?preview=${policyId}`);
    } else if (intent === "activate-policy") {
      await approveAndActivatePolicy({
        shopDomain: session.shop,
        policyId: field(form, "policyId", 64),
        correlationId,
      });
    } else if (intent === "set-global-pause") {
      await setGlobalReminderPause({
        shopDomain: session.shop,
        paused: field(form, "paused", 5) === "true",
        correlationId,
      });
    } else if (intent === "suppress-company") {
      await setCompanyReminderSuppression({
        shopDomain: session.shop,
        companyId: field(form, "companyId", 64),
        suppressed: field(form, "suppressed", 5) === "true",
        reasonCode: field(form, "reasonCode", 80),
        correlationId,
      });
      return redirect(`/app/companies/${field(form, "companyId", 64)}`);
    } else {
      throw new ReminderPolicyInputError("Unsupported reminder action");
    }
  } catch (error) {
    if (error instanceof ReminderPolicyInputError)
      throw new Response(error.message, { status: 400 });
    if (error instanceof EntitlementDeniedError)
      throw new Response(
        `Reminder automation is unavailable: ${error.decision.reason}`,
        { status: 402 },
      );
    throw error;
  }
  return redirect("/app/reminders");
};

const DEFAULT_STAGES = [
  {
    key: "pre_due",
    title: "Pre-due",
    offset: -3,
    subject: "Upcoming balance for {{orderName}}",
    body: "Hello {{companyName}},\n\nA balance of {{outstandingAmount}} {{currency}} for {{orderName}} is due on {{dueDate}}.",
  },
  {
    key: "due",
    title: "Due today",
    offset: 0,
    subject: "Balance due for {{orderName}}",
    body: "Hello {{companyName}},\n\n{{outstandingAmount}} {{currency}} for {{orderName}} is due today.",
  },
  {
    key: "overdue",
    title: "Overdue",
    offset: 7,
    subject: "Overdue balance for {{orderName}}",
    body: "Hello {{companyName}},\n\nOur Shopify records show {{outstandingAmount}} {{currency}} for {{orderName}} remains outstanding.",
  },
];

export default function ReminderSettingsRoute() {
  const data = useLoaderData<typeof loader>();
  return (
    <main className={styles.page}>
      <div className={styles.pageHeader}>
        <div><h1>Reminder automation</h1><span className={data.paused ? styles.unsyncedLabel : styles.successTag}>{data.paused ? "Globally paused" : "Sending enabled"}</span></div>
        <Form method="post"><input type="hidden" name="intent" value="set-global-pause" /><input type="hidden" name="paused" value={String(!data.paused)} /><button className={data.paused ? styles.resumeButton : styles.pauseButton} type="submit">{data.paused ? "Resume all reminders" : "Pause all reminders"}</button></Form>
      </div>
      <p><Link to="/app">Aging dashboard</Link> · <Link to="/app/collections">Today’s collections</Link></p>
      {data.syncStatus !== "FRESH" ? <div className={styles.dataSafetyNote}><strong>Sending remains fail-closed.</strong><span>Shopify synchronization is {data.syncStatus.toLowerCase()}.</span></div> : null}
      {!data.entitlementDecision.allowed ? <div className={styles.dataSafetyNote}><strong>Plan limit</strong><span>Automation cannot be activated: {data.entitlementDecision.reason.replaceAll("_", " ")}. Existing data and manual collections remain available.</span></div> : null}
      <div className={styles.historyGrid}>
        <section className={styles.historyPanel}>
          <h2>1. Verify reply-to</h2>
          <Form method="post" className={styles.noteForm}><input type="hidden" name="intent" value="request-verification" /><label>Email<input name="email" type="email" required maxLength={320} /></label><button className={styles.primaryButton} type="submit">Send code</button></Form>
          <Form method="post" className={styles.noteForm}><input type="hidden" name="intent" value="verify-reply-to" /><label>Email<input name="email" type="email" required maxLength={320} /></label><label>Six-digit code<input name="code" inputMode="numeric" pattern="[0-9]{6}" required /></label><button type="submit">Verify</button></Form>
          <ul className={styles.noteList}>{data.verifications.map((item) => <li key={item.email}><strong>{item.email}</strong><p>{item.state}</p></li>)}</ul>
        </section>
        <section className={styles.historyPanel}>
          <h2>2. Create a policy draft</h2>
          <Form method="post" className={styles.noteForm}>
            <input type="hidden" name="intent" value="create-policy" />
            <label>Policy to revise (optional)<select name="policyId" defaultValue=""><option value="">Create a new policy</option>{data.policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name} · next version</option>)}</select></label>
            <label>Policy name<input name="name" required maxLength={120} defaultValue="Standard net terms" /></label>
            <label>Sender display name<input name="senderDisplayName" required maxLength={120} /></label>
            <label>Verified reply-to<input name="replyTo" type="email" required maxLength={320} /></label>
            <label>Minimum outstanding<input name="minimumOutstanding" inputMode="decimal" defaultValue="0" /></label>
            {DEFAULT_STAGES.map((stage) => <fieldset key={stage.key}><legend>{stage.title}</legend><label><input type="checkbox" name={`${stage.key}Enabled`} defaultChecked /> Enabled</label><label>Days relative to due date<input name={`${stage.key}Offset`} type="number" min="-365" max="365" defaultValue={stage.offset} /></label><label>Subject<input name={`${stage.key}Subject`} required maxLength={200} defaultValue={stage.subject} /></label><label>Body<textarea name={`${stage.key}Body`} required maxLength={10000} defaultValue={stage.body} /></label></fieldset>)}
            <button className={styles.primaryButton} type="submit">Save immutable draft</button>
          </Form>
        </section>
      </div>
      <section className={styles.historyPanel}>
        <h2>3. Preview and explicitly approve</h2>
        <div className={styles.historyGrid}>{data.policies.map((policy) => <article className={styles.historyPanel} key={policy.id}><h3>{policy.name}</h3><p>{policy.state} · Version {policy.version?.versionNumber ?? "—"} · Reply-to {policy.version?.replyToState}</p>{policy.version?.stages.map((stage) => <div key={stage.id}><strong>{stage.stageKey} ({stage.offsetDays} days)</strong><p>{stage.subject}</p><pre>{stage.body}</pre></div>)}<div className={styles.queueActions}><Form method="post"><input type="hidden" name="intent" value="preview-policy" /><input type="hidden" name="policyId" value={policy.id} /><button type="submit">Confirm preview</button></Form><Form method="post"><input type="hidden" name="intent" value="activate-policy" /><input type="hidden" name="policyId" value={policy.id} /><button className={styles.primaryButton} type="submit" disabled={!policy.version?.previewedAt || !data.entitlementDecision.allowed}>Approve and activate</button></Form></div></article>)}</div>
      </section>
      <section className={styles.historyPanel}><h2>Delivery history</h2><ul className={styles.noteList}>{data.deliveries.map((delivery) => <li key={delivery.id}><strong>{delivery.state}</strong><p>Scheduled {new Date(delivery.scheduledAt).toLocaleString()}{delivery.errorClass ? ` · ${delivery.errorClass}` : ""}</p></li>)}{data.deliveries.length === 0 ? <li>No reminder reservations yet.</li> : null}</ul></section>
    </main>
  );
}

export const headers: HeadersFunction = (args) => boundary.headers(args);

import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, Link, redirect, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import styles from "../features/collections/collections-dashboard.module.css";
import { entitlementForDomain } from "../billing/entitlement-service.server";
import { correlationIdFromRequest } from "../operations/correlation.server";
import { loadShopDiagnostics } from "../operations/diagnostics.server";
import {
  isOperationAllowed,
  SafetyControlConfirmationError,
  setSafetyControl,
} from "../operations/safety-controls.server";
import { updateShopSettings } from "../operations/settings-service.server";
import { authenticate } from "../shopify.server";
import { normalizeShopDomain } from "../tenancy/shop-domain";
import prisma from "../db.server";

function field(form: FormData, name: string, maximum = 120): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  if (url.searchParams.has("plan_handle")) {
    const shop = await prisma.shop.findUnique({
      where: { shopDomain: normalizeShopDomain(session.shop) },
      select: { id: true },
    });
    if (shop && (await isOperationAllowed(shop.id, "BILLING_CHANGES"))) {
      await entitlementForDomain(session.shop, { refresh: true });
    }
  }
  const data = await loadShopDiagnostics(session.shop);
  const storeHandle = normalizeShopDomain(session.shop).split(".")[0];
  const appHandle = process.env.SHOPIFY_APP_HANDLE;
  return {
    ...data,
    pricingUrl: appHandle
      ? `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/charges/${encodeURIComponent(appHandle)}/pricing_plans`
      : null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = field(form, "intent", 40);
  const correlationId = correlationIdFromRequest(request);

  if (intent === "refresh-billing") {
    const shop = await prisma.shop.findUnique({
      where: { shopDomain: normalizeShopDomain(session.shop) },
      select: { id: true },
    });
    if (!shop || !(await isOperationAllowed(shop.id, "BILLING_CHANGES"))) {
      throw new Response("Billing changes are temporarily blocked", {
        status: 423,
      });
    }
    await entitlementForDomain(session.shop, { refresh: true });
  } else if (intent === "update-settings") {
    await updateShopSettings({
      shopDomain: session.shop,
      timezone: field(form, "timezone", 100),
      completeOnboarding: form.get("completeOnboarding") === "on",
      correlationId,
    });
  } else if (intent === "set-safety-control") {
    const shop = await prisma.shop.findUnique({
      where: { shopDomain: normalizeShopDomain(session.shop) },
      select: { id: true },
    });
    if (!shop) throw new Response("Shop not found", { status: 404 });
    try {
      await setSafetyControl({
        shopId: shop.id,
        controlKey:
          field(form, "controlKey", 40) === "STATEMENTS"
            ? "STATEMENTS"
            : "SHOPIFY_IMPORTS",
        blocked: field(form, "blocked", 5) === "true",
        reasonCode: "merchant_safety_control",
        actorType: "MERCHANT",
        confirmation: field(form, "confirmation", 10),
        correlationId,
      });
    } catch (error) {
      if (error instanceof SafetyControlConfirmationError) {
        throw new Response(error.message, { status: 400 });
      }
      throw error;
    }
  } else {
    throw new Response("Unsupported action", { status: 400 });
  }
  return redirect("/app/settings");
};

function stateLabel(value: boolean): string {
  return value ? "Complete" : "Still needed";
}

export default function SettingsRoute() {
  const data = useLoaderData<typeof loader>();
  const customerLimit =
    data.entitlement.limits.activeCustomerLimit === null
      ? "No product limit"
      : `${data.entitlement.limits.activeCustomerLimit} active customers`;

  return (
    <main className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1>Settings and operations</h1>
          <span
            className={
              data.alerts.some((alert) => alert.severity === "critical")
                ? styles.unsyncedLabel
                : styles.successTag
            }
          >
            {data.alerts.length === 0
              ? "Operationally healthy"
              : `${data.alerts.length} item${data.alerts.length === 1 ? "" : "s"} need attention`}
          </span>
        </div>
      </div>
      <p>
        <Link to="/app">Aging dashboard</Link> ·{" "}
        <Link to="/app/collections">Today’s collections</Link> ·{" "}
        <Link to="/app/reminders">Reminder automation</Link>
      </p>

      {data.alerts.map((alert) => (
        <div className={styles.dataSafetyNote} key={alert.code}>
          <strong>{alert.severity === "critical" ? "Action required" : "Check"}</strong>
          <span>{alert.message}</span>
        </div>
      ))}

      <div className={styles.historyGrid}>
        <section className={styles.historyPanel}>
          <h2>Pilot onboarding</h2>
          <dl className={styles.setupStatus}>
            <div>
              <dt>Shopify data reconciled</dt>
              <dd>{stateLabel(data.onboarding.synchronized)}</dd>
            </div>
            <div>
              <dt>Billing checked</dt>
              <dd>{stateLabel(data.onboarding.billingChecked)}</dd>
            </div>
            <div>
              <dt>Reply-to verified</dt>
              <dd>{stateLabel(data.onboarding.replyToVerified)}</dd>
            </div>
            <div>
              <dt>Reminder policy drafted</dt>
              <dd>{stateLabel(data.onboarding.reminderPolicyCreated)}</dd>
            </div>
          </dl>
          <Form method="post" className={styles.noteForm}>
            <input type="hidden" name="intent" value="update-settings" />
            <label>
              Merchant timezone
              <input
                name="timezone"
                required
                maxLength={100}
                defaultValue={data.shop.timezone}
              />
            </label>
            <label>
              <input
                type="checkbox"
                name="completeOnboarding"
                defaultChecked={data.onboarding.completed}
              />{" "}
              Mark pilot onboarding complete
            </label>
            <button className={styles.primaryButton} type="submit">
              Save settings
            </button>
          </Form>
        </section>

        <section className={styles.historyPanel}>
          <h2>Plan and limits</h2>
          <p>
            <strong>{data.entitlement.plan}</strong> · {customerLimit}
          </p>
          <p>
            {data.entitlement.activeCustomerCount} active payment-term customers
            currently use the product.
          </p>
          <p>
            Billing state: {data.entitlement.state}
            {data.entitlement.stale ? " (stale; paid changes blocked)" : ""}
          </p>
          <div className={styles.queueActions}>
            <Form method="post">
              <input type="hidden" name="intent" value="refresh-billing" />
              <button type="submit">Verify with Shopify</button>
            </Form>
            {data.pricingUrl ? (
              <a href={data.pricingUrl} target="_top" rel="noreferrer">
                View Shopify pricing
              </a>
            ) : (
              <span>Set SHOPIFY_APP_HANDLE to enable the upgrade link.</span>
            )}
          </div>
          {!data.entitlement.decision.allowed ? (
            <div className={styles.dataSafetyNote}>
              <strong>Automation unavailable</strong>
              <span>
                {data.entitlement.decision.reason === "active_customer_limit"
                  ? "The current plan’s active-customer limit is exceeded. Existing data is retained."
                  : "Choose an eligible paid plan and verify it before activating reminder automation."}
              </span>
            </div>
          ) : null}
        </section>
      </div>

      <section className={styles.historyPanel}>
        <h2>Support-safe diagnostics</h2>
        <div className={styles.summaryGrid}>
          <div>
            <span>Sync failures</span>
            <strong>{data.diagnostics.failedSyncWork}</strong>
          </div>
          <div>
            <span>Webhook failures</span>
            <strong>{data.diagnostics.failedWebhooks}</strong>
          </div>
          <div>
            <span>Tokens expiring soon</span>
            <strong>{data.diagnostics.expiringTokens}</strong>
          </div>
          <div>
            <span>Unknown sends</span>
            <strong>{data.diagnostics.unknownDeliveries}</strong>
          </div>
          <div>
            <span>Failed sends</span>
            <strong>{data.diagnostics.failedDeliveries}</strong>
          </div>
          <div>
            <span>Privacy work overdue</span>
            <strong>{data.diagnostics.overduePrivacy}</strong>
          </div>
        </div>
        <p>
          Diagnostics expose internal counts and states only. Tokens, buyer
          email, HMAC values, webhook bodies, and message content are excluded.
        </p>
      </section>

      <section className={styles.historyPanel}>
        <h2>Per-shop safety controls</h2>
        {(["SHOPIFY_IMPORTS", "STATEMENTS"] as const).map((controlKey) => {
          const control = data.safetyControls.find(
            (item) =>
              item.shopId === data.shop.id && item.controlKey === controlKey,
          );
          const blocked = control?.blocked ?? false;
          return (
            <Form method="post" className={styles.inlineForm} key={controlKey}>
              <input type="hidden" name="intent" value="set-safety-control" />
              <input type="hidden" name="controlKey" value={controlKey} />
              <input type="hidden" name="blocked" value={String(!blocked)} />
              <input type="hidden" name="confirmation" value="CONFIRM" />
              <span>
                <strong>{controlKey.replaceAll("_", " ")}</strong> ·{" "}
                {blocked ? "Blocked" : "Allowed"}
              </span>
              <button type="submit">{blocked ? "Allow" : "Block"}</button>
            </Form>
          );
        })}
      </section>

      <section className={styles.historyPanel}>
        <h2>Privacy and retention</h2>
        <p>
          Customer requests are durably queued. Customer redaction removes
          protected contact and message content; shop redaction purges the
          tenant while preserving a non-reversible deletion tombstone for
          backup restore replay.
        </p>
        <p>
          Processed webhook metadata: 7 days. Delivery and access metadata:
          1 year. Encrypted backups: maximum 35 days. Uninstall disables work
          immediately and schedules protected-data cleanup.
        </p>
      </section>
    </main>
  );
}

export const headers: HeadersFunction = (args) => boundary.headers(args);

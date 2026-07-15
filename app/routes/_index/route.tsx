import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const meta = () => [
  { title: "B2B A/R Collections Assistant" },
  {
    name: "description",
    content:
      "Get Shopify wholesale invoices paid without spreadsheets or manual chasing.",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>
          Get wholesale invoices paid without spreadsheets.
        </h1>
        <p className={styles.text}>
          See trusted aging, work a focused daily queue, and automate reminders
          safely from Shopify.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Trusted aging.</strong> Reconciled balances, due dates, and
            currency-safe totals from Shopify.
          </li>
          <li>
            <strong>Today&apos;s collections.</strong> One explainable queue for
            accounts that need attention.
          </li>
          <li>
            <strong>Safe reminders.</strong> Approved policies, suppression,
            payment rechecks, and an auditable pause control.
          </li>
        </ul>
      </div>
    </div>
  );
}

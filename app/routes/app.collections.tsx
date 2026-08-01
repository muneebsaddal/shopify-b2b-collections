import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { CollectionsQueue } from "../features/collections/CollectionsQueue";
import {
  CollectionInputError,
  dismissReceivableForDay,
  loadCollectionsQueue,
  recordCollectionNote,
  recordPromiseToPay,
  snoozeReceivable,
  transitionPromiseToPay,
} from "../features/collections/collections-workflow.server";
import { correlationIdFromRequest } from "../operations/correlation.server";
import { authenticate } from "../shopify.server";

function stringField(formData: FormData, name: string, maximum = 160): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function actorFor(request: Request) {
  return { id: null, correlationId: correlationIdFromRequest(request) };
}

function safeReturnTo(value: string): string {
  return value.startsWith("/app/") && !value.startsWith("//") ? value : "/app/collections";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return loadCollectionsQueue(session.shop);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const receivableId = stringField(formData, "receivableId");
  const intent = stringField(formData, "intent", 40);
  const actor = actorFor(request);
  const returnTo = safeReturnTo(stringField(formData, "returnTo", 300));

  try {
    if (intent === "dismiss") {
      await dismissReceivableForDay({ shopDomain: session.shop, receivableId, actor });
    } else if (intent === "snooze") {
      const until = new Date(`${stringField(formData, "until", 10)}T23:59:59.999Z`);
      await snoozeReceivable({ shopDomain: session.shop, receivableId, until, actor });
    } else if (intent === "note") {
      const type = stringField(formData, "noteType", 40);
      if (type !== "INTERNAL" && type !== "EXTERNAL_PAYMENT" && type !== "DISPUTE") {
        throw new CollectionInputError("Unsupported note type");
      }
      await recordCollectionNote({
        shopDomain: session.shop,
        companyId: stringField(formData, "companyId"),
        receivableId: receivableId || undefined,
        type,
        body: stringField(formData, "body", 4_001),
        actor,
      });
    } else if (intent === "promise") {
      const amount = stringField(formData, "promisedAmount", 24);
      if (amount && !/^\d{1,16}(?:\.\d{1,4})?$/.test(amount)) {
        throw new CollectionInputError("Promise amount must have up to four decimal places");
      }
      await recordPromiseToPay({
        shopDomain: session.shop,
        receivableId,
        promisedAt: new Date(`${stringField(formData, "promisedAt", 10)}T12:00:00.000Z`),
        promisedAmount: amount || undefined,
        note: stringField(formData, "body", 4_001) || undefined,
        actor,
      });
    } else if (intent === "promise-transition") {
      const status = stringField(formData, "status", 20);
      if (status !== "FULFILLED" && status !== "BROKEN" && status !== "CANCELED") {
        throw new CollectionInputError("Unsupported promise state");
      }
      await transitionPromiseToPay({
        shopDomain: session.shop,
        promiseId: stringField(formData, "promiseId"),
        status,
        actor,
      });
    } else {
      throw new CollectionInputError("Unsupported collection action");
    }
  } catch (error) {
    if (error instanceof CollectionInputError) throw new Response(error.message, { status: 400 });
    throw error;
  }

  return redirect(returnTo);
};

export default function CollectionsRoute() {
  return <CollectionsQueue data={useLoaderData<typeof loader>()} />;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

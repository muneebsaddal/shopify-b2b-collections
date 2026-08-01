import { randomUUID } from "node:crypto";

import type { SafetyControlKey } from "@prisma/client";

import prisma from "../app/db.server";
import { setSafetyControl } from "../app/operations/safety-controls.server";

const allowedKeys = new Set<SafetyControlKey>([
  "REMINDER_SENDS",
  "SHOPIFY_IMPORTS",
  "STATEMENTS",
  "BILLING_CHANGES",
  "PROVIDER_WEBHOOKS",
]);
const [controlKeyArgument, stateArgument, reasonArgument] = process.argv.slice(2);
const controlKey = controlKeyArgument as SafetyControlKey;
if (
  !allowedKeys.has(controlKey) ||
  !new Set(["block", "unblock"]).has(stateArgument) ||
  !reasonArgument?.trim()
) {
  throw new Error(
    "Usage: npm run operations:global-control -- <CONTROL_KEY> <block|unblock> <reason-code>",
  );
}
if (process.env.OPERATOR_CONFIRMATION !== "CONFIRM") {
  throw new Error("OPERATOR_CONFIRMATION must equal CONFIRM");
}
if (!process.env.OPERATOR_ID?.trim()) {
  throw new Error("OPERATOR_ID is required for the audit record");
}

try {
  await setSafetyControl({
    controlKey,
    blocked: stateArgument === "block",
    reasonCode: reasonArgument,
    actorType: "OPERATOR",
    actorId: process.env.OPERATOR_ID,
    confirmation: process.env.OPERATOR_CONFIRMATION,
    correlationId: process.env.CORRELATION_ID || randomUUID(),
  });
  process.stdout.write(`${controlKey} is now ${stateArgument}ed globally.\n`);
} finally {
  await prisma.$disconnect();
}

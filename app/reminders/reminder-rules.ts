import { createHash } from "node:crypto";

export type ReminderTemplateFacts = {
  companyName: string;
  orderName: string;
  outstandingAmount: string;
  currency: string;
  dueDate: string;
};

const VARIABLE_PATTERN =
  /\{\{(companyName|orderName|outstandingAmount|currency|dueDate)\}\}/g;
const HEADER_BREAK = /[\r\n]/;

export function renderReminderTemplate(
  template: string,
  facts: ReminderTemplateFacts,
): string {
  return template.replace(VARIABLE_PATTERN, (_, key: keyof ReminderTemplateFacts) =>
    facts[key],
  );
}

export function validateReminderTemplate(template: string): void {
  if (!template.trim() || template.length > 10_000)
    throw new Error("template_length_invalid");
  const unknown = template.match(/\{\{[^}]+\}\}/g)?.find(
    (token) => !VARIABLE_PATTERN.test(token),
  );
  VARIABLE_PATTERN.lastIndex = 0;
  if (unknown) throw new Error("template_variable_not_allowed");
}

export function validateEmailHeader(value: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || HEADER_BREAK.test(normalized))
    throw new Error("email_header_invalid");
  return normalized;
}

export function eligibilityEvidenceHash(value: {
  shopId: string;
  receivableId: string;
  outstandingAmount: string;
  currency: string;
  status: string;
  dueAt: string;
  contactId: string;
  stageId: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export function isStageDue(
  dueAt: Date,
  offsetDays: number,
  now: Date,
  timezone = "UTC",
): boolean {
  return resolvedStageInstant(dueAt, offsetDays, timezone).valueOf() <= now.valueOf();
}

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

export function resolvedStageInstant(
  dueAt: Date,
  offsetDays: number,
  timezone: string,
): Date {
  const due = zonedParts(dueAt, timezone);
  const targetDate = new Date(Date.UTC(due.year, due.month - 1, due.day + offsetDays));
  const desired = Date.UTC(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth(),
    targetDate.getUTCDate(),
    9,
  );
  let candidate = new Date(desired);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = zonedParts(candidate, timezone);
    const represented = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    candidate = new Date(candidate.valueOf() + desired - represented);
  }
  return candidate;
}

import { Prisma } from "@prisma/client";

export type QueueAction = {
  type: "SNOOZED" | "DAILY_DISMISSED" | string;
  createdAt: Date;
  effectiveAt: Date | null;
};

export type QueuePromise = {
  promisedAt: Date;
  status: "OPEN" | "FULFILLED" | "BROKEN" | "CANCELED" | "SUPERSEDED";
};

export type QueueCandidate = {
  id: string;
  companyId: string | null;
  companyName: string | null;
  orderName: string;
  outstandingAmount: string;
  currency: string;
  dueAt: Date;
  promises: QueuePromise[];
  actions: QueueAction[];
};

export type DailyQueueItem = {
  id: string;
  companyId: string | null;
  companyName: string | null;
  orderName: string;
  outstandingAmount: string;
  currency: string;
  dueAt: string;
  daysOverdue: number;
  priorityReasons: string[];
};

function localDateKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function calendarDaysBetween(start: string, end: string): number {
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  return Math.round(
    (Date.UTC(endYear, endMonth - 1, endDay) -
      Date.UTC(startYear, startMonth - 1, startDay)) /
      86_400_000,
  );
}

function isSuppressedForToday(
  actions: QueueAction[],
  now: Date,
  timezone: string,
): boolean {
  const today = localDateKey(now, timezone);
  return actions.some(
    (action) =>
      (action.type === "SNOOZED" &&
        action.effectiveAt !== null &&
        action.effectiveAt > now) ||
      (action.type === "DAILY_DISMISSED" &&
        localDateKey(action.createdAt, timezone) === today),
  );
}

function promiseUrgency(
  promises: QueuePromise[],
  today: string,
  timezone: string,
): { rank: number; reason: string | null } {
  const openPromises = promises.filter((promise) => promise.status === "OPEN");
  if (openPromises.length === 0) return { rank: 0, reason: null };
  const earliest = openPromises
    .map((promise) => localDateKey(promise.promisedAt, timezone))
    .sort()[0];
  const daysPastPromise = calendarDaysBetween(earliest, today);
  if (daysPastPromise > 0) {
    return { rank: 2, reason: `Promise overdue by ${daysPastPromise} days` };
  }
  if (daysPastPromise === 0) return { rank: 1, reason: "Promise due today" };
  return { rank: 0, reason: `Promise due in ${Math.abs(daysPastPromise)} days` };
}

type RankedQueueItem = DailyQueueItem & {
  promiseRank: number;
  amount: Prisma.Decimal;
};

export function buildDailyCollectionQueue(input: {
  candidates: QueueCandidate[];
  now: Date;
  timezone: string;
}): DailyQueueItem[] {
  const today = localDateKey(input.now, input.timezone);
  const inactiveAfter = new Date(input.now.valueOf() - 7 * 86_400_000);
  const ranked: RankedQueueItem[] = [];

  for (const candidate of input.candidates) {
    if (isSuppressedForToday(candidate.actions, input.now, input.timezone)) continue;

    const dueDate = localDateKey(candidate.dueAt, input.timezone);
    const daysOverdue = calendarDaysBetween(dueDate, today);
    const promise = promiseUrgency(candidate.promises, today, input.timezone);
    const priorityReasons: string[] = [];
    if (promise.reason) priorityReasons.push(promise.reason);
    if (daysOverdue > 0) priorityReasons.push(`${daysOverdue} days overdue`);
    if (!candidate.actions.some((action) => action.createdAt >= inactiveAfter)) {
      priorityReasons.push("No collection activity in the last 7 days");
    }
    if (priorityReasons.length === 0) priorityReasons.push("Due today or due soon");

    ranked.push({
      id: candidate.id,
      companyId: candidate.companyId,
      companyName: candidate.companyName,
      orderName: candidate.orderName,
      outstandingAmount: candidate.outstandingAmount,
      currency: candidate.currency,
      dueAt: dueDate,
      daysOverdue,
      priorityReasons,
      promiseRank: promise.rank,
      amount: new Prisma.Decimal(candidate.outstandingAmount),
    });
  }

  return [...ranked]
    .sort((left, right) => {
      const promiseDifference = right.promiseRank - left.promiseRank;
      if (promiseDifference !== 0) return promiseDifference;
      const overdueDifference = right.daysOverdue - left.daysOverdue;
      if (overdueDifference !== 0) return overdueDifference;
      if (left.currency === right.currency) {
        const amountDifference = right.amount.comparedTo(left.amount);
        if (amountDifference !== 0) return amountDifference;
      }
      const dueDifference = left.dueAt.localeCompare(right.dueAt);
      if (dueDifference !== 0) return dueDifference;
      const currencyDifference = left.currency.localeCompare(right.currency);
      if (currencyDifference !== 0) return currencyDifference;
      return left.id.localeCompare(right.id);
    })
    .map((item) => ({
      id: item.id,
      companyId: item.companyId,
      companyName: item.companyName,
      orderName: item.orderName,
      outstandingAmount: item.outstandingAmount,
      currency: item.currency,
      dueAt: item.dueAt,
      daysOverdue: item.daysOverdue,
      priorityReasons: item.priorityReasons,
    }));
}

export type ReliabilityPayment = { dueAt: Date; paidAt: Date };

export function buildReliabilityFacts(input: {
  paidInvoices: ReliabilityPayment[];
  brokenPromiseCount: number;
  timezone: string;
}): {
  eligibleInvoiceCount: number;
  paidLateCount: number;
  medianDaysLate: number | null;
  averageDaysLate: number | null;
  brokenPromiseCount: number;
} {
  const daysLate = input.paidInvoices
    .map((invoice) =>
      Math.max(
        calendarDaysBetween(
          localDateKey(invoice.dueAt, input.timezone),
          localDateKey(invoice.paidAt, input.timezone),
        ),
        0,
      ),
    )
    .sort((left, right) => left - right);
  const paidLate = daysLate.filter((days) => days > 0);
  const median =
    paidLate.length === 0
      ? null
      : paidLate[Math.floor((paidLate.length - 1) / 2)];
  const average =
    paidLate.length === 0
      ? null
      : Math.round((paidLate.reduce((sum, days) => sum + days, 0) / paidLate.length) * 10) /
        10;

  return {
    eligibleInvoiceCount: input.paidInvoices.length,
    paidLateCount: paidLate.length,
    medianDaysLate: median,
    averageDaysLate: average,
    brokenPromiseCount: input.brokenPromiseCount,
  };
}

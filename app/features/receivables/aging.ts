import { Prisma, type ReceivableStatus } from "@prisma/client";

export const agingBucketKeys = [
  "CURRENT",
  "ONE_TO_THIRTY",
  "THIRTY_ONE_TO_SIXTY",
  "SIXTY_ONE_TO_NINETY",
  "NINETY_PLUS",
] as const;

export type AgingBucket = (typeof agingBucketKeys)[number];

export type AgingReceivable = {
  id: string;
  companyId: string | null;
  companyName: string | null;
  orderName: string;
  status: ReceivableStatus;
  outstandingAmount: string;
  originalTotal: string;
  currency: string;
  dueAt: Date | null;
  lastObservedAt: Date;
};

export type AgingDashboardInput = {
  timezone: string;
  now: Date;
  receivables: AgingReceivable[];
};

export type AgingDashboard = {
  currencies: Array<{
    currency: string;
    totalOutstanding: string;
    overdue: string;
    dueSoon: string;
    recentlyPaid: string;
    buckets: Record<AgingBucket, string>;
  }>;
  receivables: Array<{
    id: string;
    companyId: string | null;
    companyName: string | null;
    orderName: string;
    currency: string;
    outstandingAmount: string;
    dueDate: string;
    daysOverdue: number;
    bucket: AgingBucket;
  }>;
  missingSchedule: { count: number; byCurrency: Record<string, string> };
  excluded: { zeroBalance: number; negativeBalance: number };
};

function localDateKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
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

export function agingForDueDate(
  dueAt: Date,
  now: Date,
  timezone: string,
): { daysOverdue: number; bucket: AgingBucket; dueDate: string } {
  const dueDate = localDateKey(dueAt, timezone);
  const daysOverdue = calendarDaysBetween(dueDate, localDateKey(now, timezone));
  const bucket =
    daysOverdue <= 0
      ? "CURRENT"
      : daysOverdue <= 30
        ? "ONE_TO_THIRTY"
        : daysOverdue <= 60
          ? "THIRTY_ONE_TO_SIXTY"
          : daysOverdue <= 90
            ? "SIXTY_ONE_TO_NINETY"
            : "NINETY_PLUS";

  return { daysOverdue, bucket, dueDate };
}

type CurrencyTotals = {
  totalOutstanding: Prisma.Decimal;
  overdue: Prisma.Decimal;
  dueSoon: Prisma.Decimal;
  recentlyPaid: Prisma.Decimal;
  buckets: Record<AgingBucket, Prisma.Decimal>;
};

function zero(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

function emptyCurrencyTotals(): CurrencyTotals {
  return {
    totalOutstanding: zero(),
    overdue: zero(),
    dueSoon: zero(),
    recentlyPaid: zero(),
    buckets: {
      CURRENT: zero(),
      ONE_TO_THIRTY: zero(),
      THIRTY_ONE_TO_SIXTY: zero(),
      SIXTY_ONE_TO_NINETY: zero(),
      NINETY_PLUS: zero(),
    },
  };
}

function serializeCurrencyTotals(
  currency: string,
  totals: CurrencyTotals,
): AgingDashboard["currencies"][number] {
  return {
    currency,
    totalOutstanding: totals.totalOutstanding.toString(),
    overdue: totals.overdue.toString(),
    dueSoon: totals.dueSoon.toString(),
    recentlyPaid: totals.recentlyPaid.toString(),
    buckets: Object.fromEntries(
      agingBucketKeys.map((bucket) => [bucket, totals.buckets[bucket].toString()]),
    ) as Record<AgingBucket, string>,
  };
}

export function buildAgingDashboard(input: AgingDashboardInput): AgingDashboard {
  const totalsByCurrency = new Map<string, CurrencyTotals>();
  const missingScheduleByCurrency = new Map<string, Prisma.Decimal>();
  const receivables: AgingDashboard["receivables"] = [];
  let missingScheduleCount = 0;
  let zeroBalance = 0;
  let negativeBalance = 0;
  const recentlyPaidAfter = new Date(input.now.valueOf() - 7 * 86_400_000);

  const totalsFor = (currency: string) => {
    const existing = totalsByCurrency.get(currency);
    if (existing) return existing;
    const totals = emptyCurrencyTotals();
    totalsByCurrency.set(currency, totals);
    return totals;
  };

  for (const receivable of input.receivables) {
    const amount = new Prisma.Decimal(receivable.outstandingAmount);
    const originalTotal = new Prisma.Decimal(receivable.originalTotal);
    const isOpen = receivable.status === "OPEN";

    if (!isOpen) {
      if (receivable.status === "PAID" && receivable.lastObservedAt >= recentlyPaidAfter) {
        totalsFor(receivable.currency).recentlyPaid = totalsFor(
          receivable.currency,
        ).recentlyPaid.plus(originalTotal);
      }
      continue;
    }
    if (amount.isZero()) {
      zeroBalance += 1;
      continue;
    }
    if (amount.isNegative()) {
      negativeBalance += 1;
      continue;
    }

    const totals = totalsFor(receivable.currency);
    totals.totalOutstanding = totals.totalOutstanding.plus(amount);
    if (!receivable.dueAt) {
      missingScheduleCount += 1;
      missingScheduleByCurrency.set(
        receivable.currency,
        (missingScheduleByCurrency.get(receivable.currency) ?? zero()).plus(amount),
      );
      continue;
    }

    const aging = agingForDueDate(receivable.dueAt, input.now, input.timezone);
    totals.buckets[aging.bucket] = totals.buckets[aging.bucket].plus(amount);
    if (aging.daysOverdue > 0) totals.overdue = totals.overdue.plus(amount);
    if (aging.daysOverdue >= -7 && aging.daysOverdue <= 0)
      totals.dueSoon = totals.dueSoon.plus(amount);

    receivables.push({
      id: receivable.id,
      companyId: receivable.companyId,
      companyName: receivable.companyName,
      orderName: receivable.orderName,
      currency: receivable.currency,
      outstandingAmount: amount.toString(),
      ...aging,
    });
  }

  return {
    currencies: [...totalsByCurrency.entries()]
      .map(([currency, totals]) => serializeCurrencyTotals(currency, totals))
      .sort((left, right) => left.currency.localeCompare(right.currency)),
    receivables,
    missingSchedule: {
      count: missingScheduleCount,
      byCurrency: Object.fromEntries(
        [...missingScheduleByCurrency.entries()].map(([currency, amount]) => [
          currency,
          amount.toString(),
        ]),
      ),
    },
    excluded: { zeroBalance, negativeBalance },
  };
}

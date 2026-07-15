export type QueueStatus = "current" | "due-soon" | "overdue" | "promise";

export interface QueueItem {
  id: string;
  company: string;
  reference: string;
  outstanding: number;
  currency: string;
  daysOverdue: number;
  dueLabel: string;
  stage: string;
  reason: string;
  status: QueueStatus;
}

export interface QueueFilters {
  company: string;
  status: string;
  currency: string;
  age: string;
}

export const agingBuckets = [
  { label: "Current", amount: 70139.71 },
  { label: "1–30", amount: 62145.36 },
  { label: "31–60", amount: 48925.22 },
  { label: "61–90", amount: 36450.77 },
  { label: "90+", amount: 29689.12 },
] as const;

export const queueItems: QueueItem[] = [
  {
    id: "luxe-glow",
    company: "Luxe Glow Beauty",
    reference: "#1032",
    outstanding: 12450,
    currency: "USD",
    daysOverdue: 45,
    dueLabel: "Apr 2, 2026",
    stage: "Follow-up 2",
    reason: "Past due and no response to last reminder",
    status: "overdue",
  },
  {
    id: "blush-bloom",
    company: "Blush & Bloom Boutique",
    reference: "#1048",
    outstanding: 8760.5,
    currency: "USD",
    daysOverdue: 12,
    dueLabel: "May 5, 2026",
    stage: "Follow-up 1",
    reason: "Overdue and promised payment not recorded",
    status: "overdue",
  },
  {
    id: "crown-beauty",
    company: "Crown Beauty Co.",
    reference: "#1021",
    outstanding: 15320.75,
    currency: "USD",
    daysOverdue: 0,
    dueLabel: "Due today",
    stage: "Promise made",
    reason: "Promise due today",
    status: "promise",
  },
  {
    id: "glow-haus",
    company: "Glow Haus",
    reference: "#1055",
    outstanding: 6214.2,
    currency: "USD",
    daysOverdue: 3,
    dueLabel: "May 14, 2026",
    stage: "Follow-up 1",
    reason: "Overdue and high order frequency",
    status: "overdue",
  },
  {
    id: "radiant-beauty",
    company: "Radiant Beauty Supply",
    reference: "#1017",
    outstanding: 23845.6,
    currency: "USD",
    daysOverdue: -7,
    dueLabel: "May 24, 2026",
    stage: "Pre-reminder",
    reason: "Due soon",
    status: "due-soon",
  },
  {
    id: "beauty-bar",
    company: "The Beauty Bar",
    reference: "#1039",
    outstanding: 11230,
    currency: "USD",
    daysOverdue: 61,
    dueLabel: "Mar 17, 2026",
    stage: "Follow-up 3",
    reason: "Long overdue",
    status: "overdue",
  },
  {
    id: "silk-stone",
    company: "Silk & Stone Spa",
    reference: "#1043",
    outstanding: 14675.83,
    currency: "USD",
    daysOverdue: 92,
    dueLabel: "Feb 14, 2026",
    stage: "Final notice",
    reason: "Severely past due",
    status: "overdue",
  },
  {
    id: "noir-beauty",
    company: "Noir Beauty Collective",
    reference: "#1051",
    outstanding: 9972,
    currency: "USD",
    daysOverdue: -30,
    dueLabel: "Jun 16, 2026",
    stage: "—",
    reason: "Not due",
    status: "current",
  },
  {
    id: "atelier-rose",
    company: "Atelier Rose",
    reference: "#2014",
    outstanding: 4800,
    currency: "CAD",
    daysOverdue: 8,
    dueLabel: "May 9, 2026",
    stage: "Follow-up 1",
    reason: "Recently overdue",
    status: "overdue",
  },
];

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function groupOutstandingByCurrency(items: QueueItem[]) {
  return items.reduce<Record<string, number>>((groups, item) => {
    groups[item.currency] = (groups[item.currency] ?? 0) + item.outstanding;
    return groups;
  }, {});
}

function matchesAge(item: QueueItem, age: string) {
  if (age === "all") return true;
  if (age === "current") return item.daysOverdue <= 0;
  if (age === "1-30") return item.daysOverdue >= 1 && item.daysOverdue <= 30;
  if (age === "31-60") return item.daysOverdue >= 31 && item.daysOverdue <= 60;
  if (age === "61-90") return item.daysOverdue >= 61 && item.daysOverdue <= 90;
  return item.daysOverdue >= 91;
}

export function filterQueue(items: QueueItem[], filters: QueueFilters) {
  const companyQuery = filters.company.trim().toLocaleLowerCase();

  return items.filter(
    (item) =>
      (!companyQuery ||
        item.company.toLocaleLowerCase().includes(companyQuery)) &&
      (filters.status === "all" || item.status === filters.status) &&
      (filters.currency === "all" || item.currency === filters.currency) &&
      matchesAge(item, filters.age),
  );
}

export function priorityScore(item: QueueItem) {
  const promiseWeight = item.status === "promise" ? 1_000_000 : 0;
  const overdueWeight = Math.max(item.daysOverdue, 0) * 10_000;
  return promiseWeight + overdueWeight + item.outstanding;
}

export function sortByPriority(items: QueueItem[]) {
  return [...items].sort((a: QueueItem, b: QueueItem) => {
    const difference = priorityScore(b) - priorityScore(a);
    return difference || a.company.localeCompare(b.company);
  });
}

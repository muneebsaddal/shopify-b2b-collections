import { useSearchParams } from "react-router";

import { CollectionsDashboard } from "../features/collections/CollectionsDashboard";
import { UnsyncedDashboard } from "../features/collections/UnsyncedDashboard";

export const meta = () => [
  { title: "Today's collections — preview" },
  {
    name: "description",
    content: "Local UI preview for the B2B A/R Collections Assistant.",
  },
];

export default function Preview() {
  const [searchParams] = useSearchParams();

  if (searchParams.get("state") === "unsynced") {
    return <UnsyncedDashboard />;
  }

  return <CollectionsDashboard preview />;
}

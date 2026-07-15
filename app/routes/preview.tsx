import { CollectionsDashboard } from "../features/collections/CollectionsDashboard";

export const meta = () => [
  { title: "Today's collections — preview" },
  {
    name: "description",
    content: "Local UI preview for the B2B A/R Collections Assistant.",
  },
];

export default function Preview() {
  return <CollectionsDashboard preview />;
}

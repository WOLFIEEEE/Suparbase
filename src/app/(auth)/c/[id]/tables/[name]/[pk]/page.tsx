import { RowPresetRouter } from "@/components/workspace/RowPresetRouter";

interface Props {
  params: Promise<{ name: string; pk: string }>;
}

export default async function TableRowPage({ params }: Props) {
  const { name, pk } = await params;
  return <RowPresetRouter tableName={decodeURIComponent(name)} pkSegment={pk} />;
}

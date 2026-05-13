import { TablePresetRouter } from "@/components/workspace/TablePresetRouter";

interface Props {
  params: Promise<{ name: string }>;
}

export default async function TablePage({ params }: Props) {
  const { name } = await params;
  return <TablePresetRouter tableName={decodeURIComponent(name)} />;
}

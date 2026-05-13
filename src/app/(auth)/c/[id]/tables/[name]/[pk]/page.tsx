import { TableRowView } from "@/components/workspace/TableRowView";

interface Props {
  params: Promise<{ name: string; pk: string }>;
}

export default async function TableRowPage({ params }: Props) {
  const { name, pk } = await params;
  return <TableRowView tableName={decodeURIComponent(name)} pkSegment={pk} />;
}

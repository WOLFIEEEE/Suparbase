import { TableListView } from "@/components/workspace/TableListView";

interface Props {
  params: Promise<{ name: string }>;
}

export default async function TableListPage({ params }: Props) {
  const { name } = await params;
  return <TableListView tableName={decodeURIComponent(name)} />;
}

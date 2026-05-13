import { TableNewView } from "@/components/workspace/TableNewView";

interface Props {
  params: Promise<{ name: string }>;
}

export default async function TableNewPage({ params }: Props) {
  const { name } = await params;
  return <TableNewView tableName={decodeURIComponent(name)} />;
}

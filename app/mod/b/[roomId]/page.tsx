import { ModView } from "@/components/ModView";

export default function ModBPage({
  params,
}: {
  params: { roomId: string };
}) {
  return <ModView roomId={params.roomId} mod="b" />;
}

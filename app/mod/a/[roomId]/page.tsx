import { ModView } from "@/components/ModView";

export default function ModAPage({
  params,
}: {
  params: { roomId: string };
}) {
  return <ModView roomId={params.roomId} mod="a" />;
}

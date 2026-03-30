import { StreamOverlay } from "@/components/StreamOverlay";

export default function StreamPage({
  params,
}: {
  params: { roomId: string };
}) {
  return <StreamOverlay roomId={params.roomId} />;
}

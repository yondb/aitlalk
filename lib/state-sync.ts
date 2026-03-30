import { trigger } from "./pusher-server";
import { getRoom } from "./store";

export async function emitStateSync(roomId: string): Promise<void> {
  const room = await getRoom(roomId);
  if (!room) return;
  await trigger(roomId, "state", {
    debateStatus: room.debateStatus,
    currentTurnIndex: room.currentTurnIndex,
    totalTurns: room.totalTurns,
    interventionsRemainingA: room.interventionsRemainingA,
    interventionsRemainingB: room.interventionsRemainingB,
    generationLocked: room.generationLocked,
  });
}

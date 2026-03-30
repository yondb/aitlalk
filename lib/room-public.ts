import type { RoomState } from "./types";

/** Omits pending intervention text from other moderator views. */
export function publicRoom(
  room: RoomState,
  mask: "mod-a" | "mod-b" | "none"
): RoomState {
  const copy: RoomState = { ...room };
  if (mask === "mod-a") {
    copy.pendingInterventionB = undefined;
  } else if (mask === "mod-b") {
    copy.pendingInterventionA = undefined;
  } else {
    copy.pendingInterventionA = undefined;
    copy.pendingInterventionB = undefined;
  }
  return copy;
}

export type Side = "A" | "B";

export type DebateMessage = {
  side: Side;
  content: string;
  at: number;
};

export type RoomState = {
  id: string;
  topic: string;
  sideA: { name: string; systemPrompt: string };
  sideB: { name: string; systemPrompt: string };
  rounds: number;
  totalTurns: number;
  transcript: DebateMessage[];
  /** Not started */
  debateStatus: "lobby" | "between_turns" | "ended";
  currentTurnIndex: number;
  /** True while a turn is being generated (LLM + TTS) */
  generationLocked: boolean;
  interventionsRemainingA: number;
  interventionsRemainingB: number;
  pendingInterventionA?: string;
  pendingInterventionB?: string;
  createdAt: number;
};

export const MAX_INTERVENTIONS = 3;

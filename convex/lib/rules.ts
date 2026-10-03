export type Role = "mafia" | "doctor" | "detective" | "villager";
export type Phase = "lobby" | "reveal" | "transition" | "night" | "day" | "vote" | "ended";
export type NightStage = "mafia" | "detective" | "doctor";
export type Team = "town" | "mafia";
export type Person = { _id: string; alive: boolean; role?: Role };
export type Choice = { playerId: string; targetId?: string; skip?: boolean };

export function roleDeck(count: number, smallGameMafiaCount: 1 | 2 = 1): Role[] {
  if (count < 6 || count > 12) throw new Error("Games need 6–12 players.");
  const mafia = count <= 7 ? smallGameMafiaCount : count <= 10 ? 2 : 3;
  return [...Array<Role>(mafia).fill("mafia"), "doctor", "detective", ...Array<Role>(count - mafia - 2).fill("villager")];
}

export function winner(players: Person[]): Team | null {
  const alive = players.filter(p => p.alive);
  const mafia = alive.filter(p => p.role === "mafia").length;
  if (!mafia) return "town";
  return mafia >= alive.length - mafia ? "mafia" : null;
}

/** Missing ballots are abstentions; only a unique highest count can eliminate. */
export function resolveVote(players: Person[], choices: Choice[]) {
  const alive = players.filter(p => p.alive);
  const counts: Record<string, number> = {};
  for (const player of alive) {
    const ballot = choices.find(c => c.playerId === player._id);
    const target = !ballot?.skip && ballot?.targetId && ballot.targetId !== player._id && alive.some(p => p._id === ballot.targetId) ? ballot.targetId : "skip";
    counts[target] = (counts[target] ?? 0) + 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const target = ranked[0]?.[0];
  const tied = ranked.length > 1 && ranked[0][1] === ranked[1][1];
  return { eliminatedId: target && target !== "skip" && !tied ? target : null, counts };
}

/** All night choices resolve against the same set of living players. */
export function resolveNight(players: Person[], choices: Choice[]) {
  const alive = players.filter(p => p.alive);
  const mafia = alive.filter(p => p.role === "mafia");
  const proposed = mafia.map(p => choices.find(c => c.playerId === p._id)?.targetId);
  const victim = proposed[0];
  const agreed = victim && proposed.every(t => t === victim) && alive.some(p => p._id === victim && p.role !== "mafia");
  const doctor = alive.find(p => p.role === "doctor");
  const protectedId = doctor && choices.find(c => c.playerId === doctor._id)?.targetId;
  const detective = alive.find(p => p.role === "detective");
  const investigatedId = detective && choices.find(c => c.playerId === detective._id)?.targetId;
  const investigated = alive.find(p => p._id === investigatedId && p._id !== detective?._id);
  return {
    eliminatedId: agreed && victim !== protectedId ? victim : null,
    saved: Boolean(agreed && victim === protectedId),
    investigation: detective && investigated ? { playerId: detective._id, targetId: investigated._id, isMafia: investigated.role === "mafia" } : null,
  };
}

export function nightStageSeconds(total: number, stage: NightStage): number {
  const mafia = Math.max(16, Math.round(total / 2));
  const detective = Math.floor((total - mafia) / 2);
  return stage === "mafia" ? mafia : stage === "detective" ? detective : total - mafia - detective;
}

export function canChoose(phase: Phase, actor: Person, target: Person | undefined, stage?: NightStage): boolean {
  if (!actor.alive || !target?.alive) return false;
  if (phase === "vote") return actor._id !== target._id;
  if (phase !== "night") return false;
  if (stage && actor.role !== stage) return false;
  if (actor.role === "mafia") return target.role !== "mafia";
  if (actor.role === "doctor") return true;
  if (actor.role === "detective") return actor._id !== target._id;
  return false;
}

export function mediaAccess(phase: Phase, player: Person, stage?: NightStage, isNarrator = false) {
  if (phase === "night") return (!stage || stage === "mafia") && (player.alive && player.role === "mafia" || isNarrator) ? { channel: "private", publish: !isNarrator } : null;
  if (["lobby", "day", "ended"].includes(phase)) return { channel: "table", publish: phase === "ended" || phase === "lobby" || player.alive || isNarrator };
  return null;
}

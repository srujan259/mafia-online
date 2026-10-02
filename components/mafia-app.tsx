"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import { ConvexProvider, ConvexReactClient, useMutation, useQuery, useConvexConnectionState } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRight, Check, CheckCheck, ChevronLeft, Copy, Crown, Eye, EyeOff, Fingerprint, HeartPulse, Hourglass, LockKeyhole, LogOut, Mic, Moon, Radio, Search, ShieldCheck, Skull, Sparkles, Sunrise, Users, VenetianMask, Volume2, VolumeX, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MediaStage } from "./media-stage";
import { ModeratorChannel } from "./moderator-channel";
import { roleDeck, type NightStage, type Role } from "@/convex/lib/rules";

export type GameState = FunctionReturnType<typeof api.games.state>;
type Seat = { gameId: Id<"games">; code: string; name: string };
const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = url ? new ConvexReactClient(url) : null;
const roleNames: Record<Role, string> = { mafia: "Mafia", doctor: "Doctor", detective: "Detective", villager: "Villager" };
const roleDescriptions: Record<Role, string> = {
  mafia: "Blend in by day. Agree with your teammates on one victim each night.",
  doctor: "Protect one person each night. You can save yourself, and repeat a choice.",
  detective: "Investigate one person each night. Your private result arrives at dawn.",
  villager: "You have your voice, your vote, and your instincts. Find the Mafia.",
};
function message(error: unknown) {
  if (error && typeof error === "object" && "data" in error && typeof error.data === "string") return error.data;
  return error instanceof Error ? error.message.replace(/\[CONVEX[^\]]*\]\s*/, "").split("\n")[0] : "Something went wrong. Please try again.";
}
function Brand() { return <span className="brand">MAFIA<span>.</span></span>; }
function RoleIcon({ role, size = 22 }: { role?: Role; size?: number }) {
  const Icon = role === "mafia" ? VenetianMask : role === "doctor" ? HeartPulse : role === "detective" ? Search : Users;
  return <Icon size={size} />;
}

export function MafiaApp() {
  if (!client) return <Landing configured={false} />;
  return <ConvexProvider client={client}><Session /></ConvexProvider>;
}
function Session() {
  const [secret, setSecret] = useState("");
  const [seat, setSeat] = useState<Seat | null>(null);
  const [saved, setSaved] = useState<Seat | null>(null);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      let value = localStorage.getItem("mafia-guest");
      if (!value || !/^[a-f0-9]{64}$/.test(value)) {
        value = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
        localStorage.setItem("mafia-guest", value);
      }
      setSecret(value);
      const previous = localStorage.getItem("mafia-seat");
      if (previous) { const p = JSON.parse(previous); if (typeof p.gameId === "string" && /^[A-Z2-9]{6}$/.test(p.code) && typeof p.name === "string") setSaved(p); }
    } catch { setStorageError(true); }
  }, []);
  function enter(s: Seat) { localStorage.setItem("mafia-seat", JSON.stringify(s)); setSaved(s); setSeat(s); }
  if (seat && secret) return <RoomBoundary onExit={() => setSeat(null)}><GameRoom secret={secret} seat={seat} onExit={() => setSeat(null)} /></RoomBoundary>;
  return <Landing configured secret={secret} onEnter={enter} saved={saved} onResume={() => saved && setSeat(saved)} storageError={storageError} />;
}

function Landing({ configured, secret = "", onEnter, saved, onResume, storageError }: { configured: boolean; secret?: string; onEnter?: (s: Seat) => void; saved?: Seat | null; onResume?: () => void; storageError?: boolean }) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState(""); const [code, setCode] = useState("");
  const [title, setTitle] = useState("The usual suspects");
  useEffect(() => { const invited = new URLSearchParams(window.location.search).get("room"); if (invited) { setCode(invited.toUpperCase().slice(0, 6)); setMode("join"); } }, []);
  return <div className="site-shell">
    <header className="site-header"><Brand /><span className="quiet"><span className="status-dot" /> Your people. Your table.</span><a href="#how-it-works" className="text-link">How to play <ArrowRight size={15} /></a></header>
    <main className="landing">
      <section className="hero">
        <span className="eyebrow"><span className="tiny-line" /> Game night, from anywhere</span>
        <h1>Good friends.<br /><em>Terrible alibis.</em></h1>
        <p className="hero-copy">Someone at your table is lying. See their face, hear their story, and decide who you trust.</p>
        <div className="hero-art" aria-label="Secret Mafia, Doctor, and Detective role cards">
          <div className="art-card card-doctor"><span className="eyebrow">01 / the town</span><HeartPulse /><span>THE DOCTOR</span><small>One life to save.</small></div>
          <div className="art-card card-mafia"><span className="eyebrow">02 / the secret</span><VenetianMask /><span>THE MAFIA</span><small>A familiar face. A fatal secret.</small><span className="card-star">✦</span></div>
          <div className="art-card card-detective"><span className="eyebrow">03 / the truth</span><Search /><span>THE DETECTIVE</span><small>Ask the right question.</small></div>
        </div>
        <div className="hero-features"><span><Users size={16} /> 6–12 players</span><span><Volume2 size={16} /> Video & voice</span><span><Sparkles size={16} /> Automatic or live host</span></div>
      </section>
      <section className="entry-panel" aria-label="Start or join a game">
        <div className="entry-heading"><span className="eyebrow">Pull up a chair</span><h2>Your next good night<br />starts here.</h2></div>
        <div className="segmented"><button aria-pressed={mode === "create"} onClick={() => setMode("create")}>Create a room</button><button aria-pressed={mode === "join"} onClick={() => setMode("join")}>Join friends</button></div>
        <label>Your name<input maxLength={24} autoComplete="nickname" placeholder="What should we call you?" value={name} onChange={e => setName(e.target.value)} /></label>
        {mode === "create" ? <label>Room name<input maxLength={40} value={title} onChange={e => setTitle(e.target.value)} /></label> : <label>Invitation code<input className="code-input" maxLength={6} placeholder="WOLF42" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))} /></label>}
        {configured ? <EnterButton secret={secret} name={name} title={title} code={code} mode={mode} onEnter={onEnter!} /> : <><button className="primary full" disabled>Room setup pending <ArrowRight size={17} /></button><p className="setup-note">Connect the Convex deployment to enable rooms. The setup steps are in the project README.</p></>}
        {storageError && <p className="error" role="alert">Browser storage is unavailable. Enable site storage to keep your seat when reconnecting.</p>}
        {saved && <button className="resume full" onClick={onResume}>Return to {saved.code} as {saved.name} <ArrowRight size={15} /></button>}
        <div className="entry-footer"><LockKeyhole size={15} /><span>Private rooms. No account needed.<br />Your invitation link is all your friends need.</span></div>
      </section>
    </main>
    <section className="how-section" id="how-it-works"><div className="eyebrow">A familiar game. A new table.</div><div className="how-grid"><article><span>01</span><h3>Keep a secret.</h3><p>Get your private role. Your friends might be your teammates—or your next suspects.</p></article><article><span>02</span><h3>Make your case.</h3><p>Talk face to face. Bluff, accuse, defend. At night, special roles act in private.</p></article><article><span>03</span><h3>Trust your gut.</h3><p>Vote together. Keep playing until the town catches every Mafia, or the Mafia takes over.</p></article></div></section>
    <footer className="site-footer"><span>MAFIA — an evening well suspected.</span><span>Built for friends, wherever they are.</span></footer>
  </div>;
}
function EnterButton({ secret, name, title, code, mode, onEnter }: { secret: string; name: string; title: string; code: string; mode: string; onEnter: (s: Seat) => void }) {
  const create = useMutation(api.games.create), join = useMutation(api.games.join);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit() {
    setBusy(true); setError("");
    try { const room = mode === "create" ? await create({ secret, name, title }) : await join({ secret, name, code }); onEnter({ ...room, name }); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <><button className="primary full" disabled={busy || !secret || name.trim().length < 2 || (mode === "join" ? code.length !== 6 : title.trim().length < 2)} onClick={submit}>{busy ? "Pulling up your chair…" : mode === "create" ? "Create a private room" : "Join the table"}<ArrowRight size={17} /></button>{error && <p className="error" role="alert">{error}</p>}</>;
}

class RoomBoundary extends Component<{ children: ReactNode; onExit: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="center-page"><Brand /><h1>Let’s find your table again.</h1><p>Your session may have expired or the host may have removed your seat.</p><button className="primary" onClick={this.props.onExit}>Back to rooms</button></div> : this.props.children; }
}
function useNow() { const [now, setNow] = useState(Date.now()); useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []); return now; }
function Clock({ deadline, now }: { deadline?: number; now: number }) {
  if (!deadline) return null;
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <div className="clock"><span className="eyebrow">{seconds ? "Time remaining" : "Resolving round"}</span><strong>{String(Math.floor(seconds / 60)).padStart(2, "0")}<span>:</span>{String(seconds % 60).padStart(2, "0")}</strong></div>;
}
const nightTurns: NightStage[] = ["mafia", "detective", "doctor"];
function NightSequence({ stage }: { stage: NightStage }) {
  const current = nightTurns.indexOf(stage);
  return <ol className="night-sequence" aria-label="Night sequence">{nightTurns.map((turn, index) => <li key={turn} className={index === current ? "current" : index < current ? "done" : ""}>{index < current ? <Check size={13} /> : <span>{index + 1}</span>}{roleNames[turn]}</li>)}<li className="dawn-step"><Sunrise size={14} /> Dawn</li></ol>;
}
function narratorLine(state: GameState | undefined): string | null {
  if (!state) return null;
  const { phase, nightStage, winner } = state.game;
  if (phase === "reveal") return "Secret roles are dealt. Read yours, then get ready for night.";
  if (phase === "night" && nightStage === "mafia") return "Everyone, close your eyes. Mafia, wake up. Discuss your choice in private.";
  if (phase === "night" && nightStage === "detective") return "Mafia, go back to sleep. Detective, wake up and investigate one person.";
  if (phase === "night" && nightStage === "doctor") return "Detective, go back to sleep. Doctor, wake up and protect one person.";
  if (phase === "day") return "Doctor, go back to sleep. Everyone, wake up. Morning has arrived. Talk, question, and listen.";
  if (phase === "vote") return "Discussion is over. Cast your secret votes now.";
  if (phase === "ended") return winner === "town" ? "The town has found the Mafia. The town wins." : "The Mafia has taken the town. The Mafia wins.";
  return null;
}
export function GameRoom({ seat, secret, onExit }: { seat: Seat; secret: string; onExit: () => void }) {
  const credentials = { gameId: seat.gameId, secret };
  const data = useQuery(api.games.state, credentials);
  const heartbeat = useMutation(api.games.heartbeat), ready = useMutation(api.games.ready), start = useMutation(api.games.start), settings = useMutation(api.games.settings), remove = useMutation(api.games.removePlayer), rematch = useMutation(api.games.rematch), reclaim = useMutation(api.games.reclaimHost), retry = useMutation(api.games.retryTransition);
  const setNarrationMode = useMutation(api.games.setNarrationMode), volunteerNarrator = useMutation(api.games.volunteerNarrator), advanceAsNarrator = useMutation(api.games.advanceAsNarrator);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false), [peek, setPeek] = useState(false), [callEnabled, setCallEnabled] = useState(false);
  const [narratorOn, setNarratorOn] = useState(true);
  const [callConnected, setCallConnected] = useState(false);
  const [hasConnectedCall, setHasConnectedCall] = useState(false);
  const [devices, setDevices] = useState({ mic: false, cam: false });
  const connection = useConvexConnectionState(); const now = useNow();
  useEffect(() => { const beat = () => { heartbeat({ gameId: seat.gameId, secret }).catch(() => {}); }; beat(); const t = setInterval(beat, 20_000); return () => clearInterval(t); }, [heartbeat, seat.gameId, secret]);
  useEffect(() => { setPeek(false); setError(""); }, [data?.game.epoch]);
  useEffect(() => { if (!peek) return; const t = setTimeout(() => setPeek(false), 10_000); return () => clearTimeout(t); }, [peek]);
  useEffect(() => { if (callConnected) setHasConnectedCall(true); }, [callConnected]);
  const cue = narratorLine(data);
  useEffect(() => {
    if (!hasConnectedCall || !narratorOn || data?.game.narrationMode === "volunteer" || !cue || typeof window === "undefined" || !window.speechSynthesis) return;
    const line = new SpeechSynthesisUtterance(cue);
    line.rate = 0.92;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(line);
    return () => window.speechSynthesis.cancel();
  }, [hasConnectedCall, cue, data?.game.epoch, data?.game.narrationMode, narratorOn]);
  async function run(fn: () => Promise<unknown>) { setBusy(true); setError(""); try { await fn(); } catch (e) { setError(message(e)); } finally { setBusy(false); } }
  async function copy() { try { await navigator.clipboard.writeText(`${window.location.origin}/?room=${seat.code}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError(`Share this room code with your friends: ${seat.code}`); } }
  if (!data) return <div className="center-page"><Brand /><Hourglass /><h2>Finding your table…</h2><button onClick={onExit}>Back</button></div>;
  const { game, me, players } = data;
  const host = me.id === game.hostId;
  const humanNarrator = game.narrationMode === "volunteer";
  const playingCount = players.filter(p => !p.isNarrator).length;
  const aliveCount = players.filter(p => p.alive).length;
  const hostAbsent = now - (players.find(p => p.id === game.hostId)?.lastSeen ?? 0) > 60_000;
  const narratorAbsent = now - (players.find(p => p.id === game.narratorId)?.lastSeen ?? 0) > 60_000;
  const reconnecting = players.filter(p => now - p.lastSeen >= 60_000);
  const waitingToReady = players.filter(p => !p.ready);
  const allReady = playingCount >= 6 && (!humanNarrator || !!game.narratorId) && players.every(p => p.ready && now - p.lastSeen < 60_000);
  const startHint = playingCount < 6 ? `Need ${6 - playingCount} more playing ${6 - playingCount === 1 ? "person" : "people"}. The moderator sits out.` : humanNarrator && !game.narratorId ? "One person needs to volunteer as moderator." : !callConnected ? "Join the call and wait for Live before starting." : reconnecting.length ? `${reconnecting.map(p => p.name).join(", ")} ${reconnecting.length === 1 ? "needs" : "need"} to reconnect before starting.` : waitingToReady.length ? `Waiting for ${waitingToReady.map(p => p.name).join(", ")} to ready up.` : "Everyone is ready. Start when you are.";
  const canAdvance = humanNarrator && (me.isNarrator || host && narratorAbsent) && ["reveal", "night", "day", "vote"].includes(game.phase);
  const nextScene = game.phase === "reveal" ? "Begin Mafia turn" : game.phase === "night" ? game.nightStage === "mafia" ? "Call Detective" : game.nightStage === "detective" ? "Call Doctor" : "Bring everyone to dawn" : game.phase === "day" ? "Open voting" : "Reveal vote";
  const ownName = players.find(p => p.id === me.id)?.name ?? seat.name;
  const nightActor = game.phase === "night" && me.alive && me.role !== "villager" && (!game.nightStage || me.role === game.nightStage);
  const nightTitle = game.nightStage ? `${roleNames[game.nightStage]}, wake up.` : me.role === "mafia" && me.alive ? "The town is asleep." : "Keep your secrets.";
  const nightSubtitle = game.nightStage === "mafia" ? "Everyone else sleeps while the Mafia discuss and choose a victim." : game.nightStage === "detective" ? "Only the Detective may investigate. Everyone else waits in silence." : game.nightStage === "doctor" ? "Only the Doctor may protect someone. Dawn is close." : me.role === "mafia" && me.alive ? "Only living Mafia can see and hear this conversation." : "Your microphone and camera are off. Everyone returns at sunrise.";
  const titles = { lobby: "The usual suspects are gathering.", reveal: "A secret worth keeping.", transition: "Setting the scene…", night: nightTitle, day: "Someone here is lying.", vote: "Who doesn’t add up?", ended: "The masks come off." };
  const subtitles = { lobby: "Invite your friends, check your camera, and get comfortable.", reveal: humanNarrator ? "Read your role privately. The moderator will begin the night." : "Read your role privately. Night begins when the countdown ends.", transition: "Closing the previous conversation before opening the next one.", night: nightSubtitle, day: "Listen closely. Ask questions. Make your case.", vote: humanNarrator ? "Choose a player or skip. The moderator ends voting when the group is ready." : "Choose a player or skip. Ballots are revealed together when time runs out.", ended: "Everyone can talk again. Time for the stories behind the stories." };
  return <div className="game-shell">
    <header className="game-header"><div className="row"><Brand /><span className="room-title">{game.title}</span></div><div className="row">{humanNarrator ? <span className="human-host-badge"><Mic size={15} /> Volunteer moderator</span> : <button className="icon-button" aria-label={narratorOn ? "Mute narrator" : "Enable narrator"} aria-pressed={narratorOn} onClick={() => setNarratorOn(!narratorOn)}>{narratorOn ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>}<button className="invite-button" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />}<span>{game.code}</span></button><button className="icon-button" aria-label="Leave table" onClick={onExit}><LogOut size={17} /></button></div></header>
    {!connection.isWebSocketConnected && <div className="notice" role="status"><Radio size={16} /> Reconnecting to the game. Your seat is saved.</div>}
    <main className="game-main"><div className="game-title"><div><span className="eyebrow">{game.phase === "lobby" ? "Private lobby" : game.phase === "ended" ? "Game complete" : `Round ${game.round} · ${game.phase === "transition" ? "Changing phase" : game.phase}`}<span className="separator">/</span>{game.phase === "lobby" ? `${playingCount} of 12 players${humanNarrator ? " + moderator" : ""}` : `${aliveCount} players alive`}</span><h1>{titles[game.phase]}</h1><p>{subtitles[game.phase]}</p></div><Clock deadline={game.deadline} now={now} /></div>
    {error && <div className="notice error" role="alert">{error}<button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><X size={15} /></button></div>}
    {humanNarrator && ["transition", "reveal", "night", "vote"].includes(game.phase) && <ModeratorChannel key={game.round} data={data} secret={secret} enabled={callEnabled} onEnable={() => setCallEnabled(true)} />}
    {canAdvance && <section className="moderator-panel"><span className="eyebrow">Your cue to say aloud</span><p>{cue}</p>{data.narratorProgress && <span className="muted small">{data.narratorProgress.submitted} of {data.narratorProgress.expected} actions received</span>}<button className="primary" disabled={busy} onClick={() => run(() => advanceAsNarrator({ ...credentials, epoch: game.epoch }))}>{nextScene} <ArrowRight size={16} /></button></section>}
    {game.phase === "night" && game.nightStage && <NightSequence stage={game.nightStage} />}
    <div className="game-layout"><section className="main-stage">
      {game.phase === "transition" ? <div className="night-screen"><span className="celestial"><Hourglass size={34} /></span><h2>One moment, suspects.</h2><p>{game.mediaError || "Your next chapter is almost ready."}</p>{game.mediaError && (host || me.isNarrator) && <button onClick={() => run(() => retry(credentials))} disabled={busy}>Retry connection</button>}</div>
      : game.phase === "reveal" ? <div className="reveal-screen"><span className="eyebrow">{me.isNarrator ? "Your place at the table" : "For your eyes only"}</span><div className="role-emblem">{me.isNarrator ? <Mic size={56} /> : <RoleIcon role={me.role} size={56} />}</div><h2>{me.isNarrator ? "You are the moderator." : `You are ${me.role && roleNames[me.role]}.`}</h2><p>{me.isNarrator ? "You sit out this game. Speak the cues, then advance each scene when the group is ready." : me.role && roleDescriptions[me.role]}</p>{data.teammates.length > 0 && <div className="private-note">Your team: {players.filter(p => data.teammates.includes(p.id)).map(p => p.name).join(", ")}</div>}<span className="muted small">The table is silent while everyone reads their role.</span></div>
      : game.phase === "vote" ? me.isNarrator ? <div className="night-screen"><span className="celestial"><LockKeyhole size={35} /></span><h2>The town is voting.</h2><p>Let everyone confirm a secret ballot before you reveal the result.</p></div> : <ActionPanel key={game.epoch} data={data} secret={secret} now={now} />
      : <>
        {game.phase === "ended" && <div className="victory-banner"><Sparkles size={20} /><div><span className="eyebrow">{game.winner === "town" ? "Town victory" : "Mafia victory"}</span><h2>{game.winner === "town" ? "The town found every last one." : "The Mafia owns the table."}</h2></div></div>}
        {data.mediaAllowed ? <MediaStage key={`media-${game.epoch}`} data={data} secret={secret} enabled={callEnabled} onEnable={() => setCallEnabled(true)} onConnectionChange={setCallConnected} devices={devices} onDevices={setDevices} /> : <div className="night-screen"><span className="celestial"><Moon size={38} /></span><span className="eyebrow">{nightActor ? "Your private turn" : me.isNarrator ? "Moderating" : "Eyes closed"}</span><h2>{nightActor ? "Your moment to act." : me.isNarrator ? "Guide the night." : "The town is sleeping."}</h2><p>{me.isNarrator ? "Speak each cue in the moderator audio channel above. This night channel is voice-only; your camera is available again during the day. Mafia talk stays private." : !me.alive ? "Stay for the reveal. Private night conversations stay private." : nightActor ? "Make your choice below. Only you can see your action." : "Listen for the next host cue. Your camera and microphone stay off."}</p><span className="pill"><LockKeyhole size={13} /> {me.isNarrator ? "Players’ private calls remain hidden" : "Camera and microphone off"}</span></div>}
        {nightActor && <ActionPanel key={`action-${game.epoch}`} data={data} secret={secret} now={now} />}
      </>}
      {game.phase === "ended" && <div className="role-reveal-grid">{players.map(p => <div className="reveal-person" key={p.id}>{p.isNarrator ? <Mic size={22} /> : <RoleIcon role={p.role} />}<div><strong>{p.name}</strong><span>{p.isNarrator ? "Moderator" : p.role && roleNames[p.role]}</span></div>{!p.alive && !p.isNarrator && <Skull size={15} />}</div>)}</div>}
    </section><aside className="sidebar">
      {game.phase === "lobby" ? <>
        <section className="panel"><div className="panel-title"><h2>Your table</h2><span className="pill">{playingCount} / 12 players</span></div><div className="roster">{players.map(p => <div className="roster-row" key={p.id}><span className="mini-avatar">{p.name.slice(0, 1)}</span><span className="roster-name">{p.name}{p.id === me.id ? " · you" : ""}{p.isNarrator ? " · moderator" : ""}<small>{now - p.lastSeen > 60_000 ? "Reconnecting" : p.ready ? "Ready" : "Getting comfortable"}</small></span>{p.id === game.hostId ? <Crown size={14} className="warm" /> : p.ready ? <Check size={15} className="green" /> : null}{host && p.id !== me.id && <button className="remove-button" aria-label={`Remove ${p.name}`} disabled={busy} onClick={() => run(() => remove({ ...credentials, playerId: p.id }))}><X size={12} /></button>}</div>)}</div>{playingCount < 6 && <p className="muted small">{6 - playingCount} more playing {6 - playingCount === 1 ? "friend" : "friends"} needed to start.</p>}</section>
        <section className="panel">
          <h2>House rules</h2>
          <label className="rule-row">Narration<select aria-label="Narration mode" value={game.narrationMode} disabled={!host || busy} onChange={e => run(() => setNarrationMode({ ...credentials, mode: e.target.value as "automatic" | "volunteer" }))}><option value="automatic">Automatic voice and timers</option><option value="volunteer">Volunteer moderator</option></select></label>
          {humanNarrator && <div className="volunteer-box">{game.narratorId ? <p><strong>{players.find(p => p.id === game.narratorId)?.name}</strong> moderates and sits out. The browser narrator is off for everyone.</p> : <p>One person volunteers to sit out, speak each cue, and move the game forward.</p>}{me.isNarrator ? <button className="full" disabled={busy} onClick={() => run(() => volunteerNarrator({ ...credentials, volunteer: false }))}>Step down as moderator</button> : !game.narratorId && <button className="full" disabled={busy} onClick={() => run(() => volunteerNarrator({ ...credentials, volunteer: true }))}>Volunteer to moderate</button>}</div>}
          <div className="rule-row"><span>Mafia</span><strong>{playingCount < 6 ? 1 : playingCount > 12 ? 3 : roleDeck(playingCount).filter(r => r === "mafia").length}</strong></div>
          <div className="rule-row"><span>Doctor / Detective</span><strong>1 each</strong></div>
          {humanNarrator ? <div className="rule-row"><span>Phase changes</span><strong>Moderator controls</strong></div> : <><label className="rule-row">Discussion<select aria-label="Discussion duration" value={game.daySeconds} disabled={!host || busy} onChange={e => run(() => settings({ ...credentials, daySeconds: Number(e.target.value), nightSeconds: game.nightSeconds }))}>{[60, 120, 180, 300].map(t => <option value={t} key={t}>{t / 60} min</option>)}</select></label><label className="rule-row">Night<select aria-label="Night duration" value={game.nightSeconds} disabled={!host || busy} onChange={e => run(() => settings({ ...credentials, daySeconds: game.daySeconds, nightSeconds: Number(e.target.value) }))}>{[30, 45, 60, 90].map(t => <option value={t} key={t}>{t} sec</option>)}</select></label><div className="rule-row"><span>Voting</span><strong>30 sec · secret</strong></div></>}
          {!callConnected && <p className="muted small">{me.ready ? "Reconnect to the call before the game starts." : "Join the call before you ready up. Your camera and mic can stay off."}</p>}
          <button className={`full ${me.ready ? "ready-button" : "secondary"}`} disabled={busy || (!me.ready && !callConnected)} onClick={() => run(() => ready({ ...credentials, ready: !me.ready }))}>{me.ready ? <CheckCheck size={17} /> : <Check size={17} />}{me.ready ? "You’re ready" : "I’m ready"}</button>
          {(host || me.isNarrator) && <p className={`start-hint ${allReady && callConnected ? "ready" : ""}`} role="status">{startHint}</p>}
          {host || me.isNarrator ? <button className="primary full" disabled={!allReady || !callConnected || busy} onClick={() => run(() => start(credentials))}>Start the game <ArrowRight size={17} /></button> : <p className="small muted">The organizer or moderator will start when everyone is ready.</p>}
        </section>
      </> : <>
        {me.role && game.phase !== "ended" && <section className="panel secret-panel"><div className="panel-title"><span className="eyebrow">Your secret</span><LockKeyhole size={16} /></div><div className="role-emblem small-emblem">{peek ? <RoleIcon role={me.role} size={28} /> : <Fingerprint size={28} />}</div><h2>{peek ? `You are ${roleNames[me.role]}.` : "Trust no one."}</h2><p>{peek ? roleDescriptions[me.role] : "Your role is yours to keep. A peek closes automatically."}</p><button className="full" onClick={() => setPeek(!peek)}>{peek ? <EyeOff size={16} /> : <Eye size={16} />}{peek ? "Hide my role" : "Peek at my role"}</button>{!me.alive && <span className="spectator-label"><Skull size={14} /> Eliminated · watch only</span>}</section>}
        {data.investigations.length > 0 && <section className="panel"><h2><Search size={16} /> Your discoveries</h2>{data.investigations.map(i => <div className="discovery" key={i.round}><span>Night {i.round}</span><strong>{players.find(p => p.id === i.targetId)?.name}: {i.isMafia ? "Mafia" : "not Mafia"}</strong></div>)}</section>}
        <section className="panel"><h2>The story so far</h2><div className="timeline" aria-live="polite">{data.events.slice(0, 6).map(e => <div className="timeline-event" key={e.id}><span className="timeline-dot" /><div><small>Round {e.round}</small><p>{e.text}</p></div></div>)}</div></section>
        {game.phase === "ended" && (host || me.isNarrator) && <button className="primary full" disabled={busy} onClick={() => run(() => rematch(credentials))}>Another round? <ArrowRight size={17} /></button>}
        {game.phase === "night" && <div className="sunrise-note"><Sunrise size={18} /><div><strong>Back together at sunrise</strong><p>The host wakes each role in turn. Everyone returns when the Doctor’s turn ends.</p></div></div>}
      </>}
      {hostAbsent && !host && <button onClick={() => run(() => reclaim(credentials))} disabled={busy}>Host disconnected · take over</button>}
    </aside></div></main>
    <footer className="game-footer"><span><ShieldCheck size={14} /> {game.phase === "night" ? me.isNarrator ? "Your voice reaches everyone; Mafia talk stays private" : me.role === "mafia" && me.alive ? "Private audience: living Mafia only" : "No private conversations audible" : game.phase === "vote" || game.phase === "reveal" || game.phase === "transition" ? humanNarrator ? "Only the moderator can speak to everyone" : "The table is silent" : "Private room · invite only"}</span><span>{me.isNarrator ? "Moderating" : "Playing"} as {ownName} · <button className="text-button" onClick={onExit}>Leave table</button></span></footer>
  </div>;
}

function ActionPanel({ data, secret, now }: { data: GameState; secret: string; now: number }) {
  const choose = useMutation(api.games.choose);
  const [selected, setSelected] = useState<string>(data.myChoice?.skip ? "skip" : data.myChoice?.targetId ?? "");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const { me, game, players } = data;
  const voting = game.phase === "vote";
  const eligible = players.filter(p => p.alive && (voting ? p.id !== me.id : me.role === "mafia" ? p.id !== me.id && !data.teammates.includes(p.id) : me.role === "detective" ? p.id !== me.id : true));
  const savedChoice = data.myChoice?.skip ? "skip" : data.myChoice?.targetId;
  const submitted = selected && selected === savedChoice;
  const actionClosed = !!game.deadline && now >= game.deadline;
  async function submit() {
    setBusy(true); setError("");
    try { await choose({ gameId: game._id, secret, epoch: game.epoch, skip: selected === "skip", targetId: selected === "skip" ? undefined : selected as Id<"players"> }); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  if (!me.alive) return <div className="night-screen"><Skull size={32} /><h2>The town is deciding.</h2><p>You’ve been eliminated. Watch for the result when voting closes.</p></div>;
  return <section className="action-panel"><div className="panel-title"><div><span className="eyebrow">{voting ? "Your secret ballot" : "Private action"}</span><h2>{voting ? "Who gets your vote?" : me.role === "mafia" ? "Agree on one victim." : me.role === "doctor" ? "Who will you protect?" : "Who will you investigate?"}</h2></div><LockKeyhole size={18} /></div><div className="target-grid">{eligible.map(p => <button className="target" aria-pressed={selected === p.id} key={p.id} onClick={() => setSelected(p.id)} disabled={busy || actionClosed}><span className="mini-avatar">{p.name.slice(0, 1)}</span><span>{p.name}{p.id === me.id ? " · you" : ""}</span>{selected === p.id && <Check size={16} />}</button>)}<button className="target skip-target" aria-pressed={selected === "skip"} onClick={() => setSelected("skip")} disabled={busy || actionClosed}>Skip {voting ? "elimination" : "action"}{selected === "skip" && <Check size={16} />}</button></div><div className="action-footer"><span className="muted small">{submitted ? game.narrationMode === "volunteer" ? "Saved. You can change it until the moderator moves on." : "Saved. You can change it until the timer ends." : "Choose, then confirm. Your choice stays private."}</span><button className="primary" onClick={submit} disabled={!selected || busy || !!submitted || actionClosed}>{submitted ? <><Check size={16} /> Choice saved</> : "Confirm choice"}</button></div>{error && <p className="error" role="alert">{error}</p>}{!voting && me.role === "mafia" && <div className="mafia-consensus"><span className="eyebrow">Your team’s choices</span>{data.teammates.filter(id => players.find(p => p.id === id)?.alive).map(id => { const c = data.mafiaChoices.find(c => c.playerId === id); return <p key={id}>{players.find(p => p.id === id)?.name}: <strong>{c?.skip ? "Skip" : c?.targetId ? players.find(p => p.id === c.targetId)?.name : "Deciding…"}</strong></p>; })}<small>Every living Mafia must pick the same victim. A split or missing choice means no kill.</small></div>}</section>;
}

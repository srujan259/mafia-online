"use client";

import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { LiveKitRoom, ParticipantTile, useConnectionState, useLocalParticipant, useTracks } from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";
import { Camera, CameraOff, Eye, Radio } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { GameState } from "./mafia-app";

type Grant = { token: string; url: string; round: number };

export function NightWatch({ data, secret, enabled, onEnable, cameraWasOn }: { data: GameState; secret: string; enabled: boolean; onEnable: () => void; cameraWasOn: boolean }) {
  const getToken = useAction(api.media.watchToken);
  const [grant, setGrant] = useState<Grant | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    getToken({ gameId: data.game._id, secret, round: data.game.round }).then(result => {
      if (!current) return;
      if (!result || "unavailable" in result) setError("Moderator camera view is unavailable. Check LiveKit setup.");
      else { setGrant(result); setError(""); }
    }).catch(() => { if (current) setError("Could not connect the moderator camera view. Refresh to retry."); });
    return () => { current = false; };
  }, [data.game._id, data.game.round, enabled, getToken, secret]);

  if (!enabled) return <div className="watch-status"><Eye size={16} /> Moderator camera view is off. <button onClick={onEnable}>Join night view</button></div>;
  if (error) return <div className="watch-status error" role="alert">{error}</div>;
  if (!grant || grant.round !== data.game.round) return <div className="watch-status"><Radio size={16} /> Connecting moderator camera view…</div>;
  return <LiveKitRoom serverUrl={grant.url} token={grant.token} connect audio={false} video={false} options={{ adaptiveStream: true }} onError={cause => setError(cause.message)}>
    {data.me.isNarrator ? <ModeratorView data={data} /> : <PlayerCamera cameraWasOn={cameraWasOn} />}
  </LiveKitRoom>;
}

function PlayerCamera({ cameraWasOn }: { cameraWasOn: boolean }) {
  const connection = useConnectionState();
  const { localParticipant, isCameraEnabled } = useLocalParticipant();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!cameraWasOn || connection !== ConnectionState.Connected) return;
    let current = true;
    void localParticipant.setCameraEnabled(true).catch(() => { if (current) setError("Your camera did not reconnect for the moderator. Turn it on below if you want to be seen."); });
    return () => { current = false; };
  }, [cameraWasOn, connection, localParticipant]);
  async function toggle() {
    setBusy(true);
    try { await localParticipant.setCameraEnabled(!isCameraEnabled); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Camera unavailable."); }
    finally { setBusy(false); }
  }
  return <div className="watch-status"><Eye size={16} /><span>{connection !== ConnectionState.Connected ? "Connecting night view…" : isCameraEnabled ? "Your camera is visible only to the moderator" : "Your camera is off; the moderator sees your name"}</span><button onClick={toggle} disabled={busy || connection !== ConnectionState.Connected} aria-pressed={isCameraEnabled}>{isCameraEnabled ? <CameraOff size={15} /> : <Camera size={15} />}{isCameraEnabled ? "Hide camera" : "Show camera to moderator"}</button>{error && <span className="error" role="alert">{error}</span>}</div>;
}

function ModeratorView({ data }: { data: GameState }) {
  const connection = useConnectionState();
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  return <section className="watch-panel"><div className="panel-title"><div><span className="eyebrow">Moderator only</span><h2>Night camera view</h2></div><span className="muted small">{connection === ConnectionState.Connected ? "Live" : "Connecting"}</span></div><p className="muted small">You can see every connected player who leaves their camera on. Players cannot see one another here.</p><div className="video-grid watch-grid">{data.players.filter(p => !p.isNarrator).map(p => {
    const track = tracks.find(t => t.participant.identity === p.id);
    return <div className="video-cell" key={p.id}>{track ? <ParticipantTile trackRef={track} className="media-tile" /> : <div className="video-placeholder"><span>{p.name.slice(0, 1).toUpperCase()}</span></div>}<div className="video-label"><span>{p.name}</span></div></div>;
  })}</div></section>;
}

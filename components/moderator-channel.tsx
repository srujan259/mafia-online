"use client";

import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { LiveKitRoom, RoomAudioRenderer, StartAudio, useConnectionState, useLocalParticipant } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { Headphones, Mic, MicOff, Radio } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { GameState } from "./mafia-app";

type Grant = { token: string; url: string; round: number };

export function ModeratorChannel({ data, secret, enabled, onEnable }: { data: GameState; secret: string; enabled: boolean; onEnable: () => void }) {
  const getToken = useAction(api.media.moderatorToken);
  const [grant, setGrant] = useState<Grant | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    getToken({ gameId: data.game._id, secret, round: data.game.round })
      .then(result => {
        if (!current) return;
        if (!result || "unavailable" in result) setError("Moderator audio is unavailable. Check LiveKit setup.");
        else setGrant(result);
      })
      .catch(() => { if (current) setError("Could not connect to the moderator. Refresh to retry."); });
    return () => { current = false; };
  }, [data.game._id, data.game.round, enabled, getToken, secret]);

  if (!enabled) return <div className="moderator-audio"><span><Radio size={16} /> Moderator audio is off</span><button onClick={onEnable}><Headphones size={15} /> Hear the moderator</button></div>;
  if (error) return <div className="moderator-audio" role="alert">{error}</div>;
  if (!grant || grant.round !== data.game.round) return <div className="moderator-audio"><Radio size={16} /> Connecting moderator audio…</div>;
  return <LiveKitRoom serverUrl={grant.url} token={grant.token} connect audio={false} video={false} onError={err => setError(err.message)}>
    <ModeratorVoice isNarrator={data.me.isNarrator} />
  </LiveKitRoom>;
}

function ModeratorVoice({ isNarrator }: { isNarrator: boolean }) {
  const connection = useConnectionState();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const [error, setError] = useState("");
  async function toggleMic() {
    try { await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Microphone unavailable."); }
  }
  return <div className="moderator-audio">
    <span><Radio size={16} /> {connection === ConnectionState.Connected ? "Moderator voice · Live" : "Connecting moderator voice…"}</span>
    {isNarrator && <button onClick={toggleMic} disabled={connection !== ConnectionState.Connected} aria-pressed={isMicrophoneEnabled}>{isMicrophoneEnabled ? <Mic size={15} /> : <MicOff size={15} />}{isMicrophoneEnabled ? "Mute moderator mic" : "Speak to everyone"}</button>}
    <StartAudio label="Allow moderator audio" />
    {error && <span className="error" role="alert">{error}</span>}
    <RoomAudioRenderer />
  </div>;
}

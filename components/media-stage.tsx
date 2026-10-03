"use client";

import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { LiveKitRoom, ParticipantTile, RoomAudioRenderer, StartAudio, useConnectionState, useLocalParticipant, useTracks } from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";
import { Camera, CameraOff, Headphones, LockKeyhole, Mic, MicOff, Radio, RotateCcw, Volume2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { GameState } from "./mafia-app";

type DeviceState = { mic: boolean; cam: boolean };
type Grant = { token: string; url: string; epoch: number };

export function MediaStage({ data, secret, enabled, onEnable, onConnectionChange, devices, onDevices }: { data: GameState; secret: string; enabled: boolean; onEnable: () => void; onConnectionChange: (connected: boolean) => void; devices: DeviceState; onDevices: (next: DeviceState) => void }) {
  const getToken = useAction(api.media.token);
  const [grant, setGrant] = useState<Grant | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "missing" | "error">("idle");
  const [message, setMessage] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => { if (!enabled) return; let live = true; setStatus("loading"); setMessage(""); (async () => { try { const result = await getToken({ gameId: data.game._id, secret, epoch: data.game.epoch }); if (!live) return; if (!result) { setStatus("error"); setMessage("The room changed. Waiting for the next scene."); } else if ("unavailable" in result) setStatus("missing"); else { setGrant(result); setStatus("idle"); } } catch (error) { if (live) { setStatus("error"); setMessage(error instanceof Error ? error.message : "Could not connect to video."); } } })(); return () => { live = false; }; }, [data.game._id, data.game.epoch, enabled, getToken, secret, retryKey]);
  const privateRoom = data.game.phase === "night";
  const viewing = privateRoom ? data.players.filter(p => p.alive && (p.id === data.me.id || data.teammates.includes(p.id))) : data.players;
  if (!enabled) return <div className="join-call"><div className="call-symbol">{privateRoom ? <LockKeyhole size={36} /> : <Radio size={36} />}</div><span className="eyebrow">{privateRoom ? "Private Mafia conversation" : "Your table is ready"}</span><h2>{privateRoom ? "Your team is waiting." : "See the faces behind the stories."}</h2><p>{privateRoom ? "Only living Mafia can speak here. A volunteer moderator can listen. Use private text if you share a physical room; microphone and camera begin off." : "Join to hear your friends. Turn your own microphone and camera on when you’re ready."}</p><button className="primary" onClick={onEnable}><Headphones size={17} /> Join the call</button></div>;
  if (status === "missing") return <div className="join-call"><CameraOff size={30} /><h2>Video needs its final setup.</h2><p>Connect a LiveKit project to enable real calls.</p></div>;
  if (status === "error") return <div className="join-call"><Radio size={30} /><h2>Let’s reconnect the call.</h2><p>{message}</p><button onClick={() => { setGrant(null); setRetryKey(n => n + 1); }}><RotateCcw size={16} /> Retry video</button></div>;
  if (!grant || status === "loading") return <div className="join-call"><Radio size={30} /><h2>Connecting everyone…</h2><p>Your game seat is safe.</p></div>;
  if (grant.epoch !== data.game.epoch) return null;
  return <LiveKitRoom serverUrl={grant.url} token={grant.token} connect audio={false} video={false} options={{ adaptiveStream: true, dynacast: true }} onConnected={() => onConnectionChange(true)} onDisconnected={() => onConnectionChange(false)} onError={error => { onConnectionChange(false); setStatus("error"); setMessage(error.message); }} onMediaDeviceFailure={() => { setMessage("Your browser couldn’t access that device. Check its camera and microphone permissions."); }}>
    <CallContent data={data} viewing={viewing} devices={devices} onDevices={onDevices} message={message} privateRoom={privateRoom} />
  </LiveKitRoom>;
}

function CallContent({ data, viewing, devices, onDevices, message, privateRoom }: { data: GameState; viewing: GameState["players"]; devices: DeviceState; onDevices: (next: DeviceState) => void; message: string; privateRoom: boolean }) {
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const connection = useConnectionState();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const [mediaError, setMediaError] = useState("");
  const [cameraBusy, setCameraBusy] = useState(false);
  const mayPublish = data.me.alive || data.me.isNarrator || data.game.phase === "lobby" || data.game.phase === "ended";
  async function toggleMic() { try { await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled); onDevices({ ...devices, mic: !isMicrophoneEnabled }); setMediaError(""); } catch (error) { setMediaError(error instanceof Error ? error.message : "Microphone unavailable."); } }
  async function toggleCam() {
    setCameraBusy(true);
    setMediaError("");
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
      onDevices({ ...devices, cam: !isCameraEnabled });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      setMediaError(name === "NotAllowedError" || name === "PermissionDeniedError"
        ? "Camera access was blocked. Allow Camera for this site in your browser and in your computer’s privacy settings, then reload."
        : name === "NotFoundError" || name === "DevicesNotFoundError"
          ? "No camera was found. Connect one, then try again."
          : error instanceof Error ? error.message : "Camera unavailable.");
    } finally {
      setCameraBusy(false);
    }
  }
  return <div className="call-wrap"><div className="call-banner"><span><span className="status-dot" />{privateRoom ? `Private Mafia room · ${viewing.length} Mafia${data.game.narrationMode === "volunteer" ? " · moderator listening" : ""}` : `${viewing.length} at the table`}</span><span className="muted">{connection === ConnectionState.Connected ? "Live" : connection === ConnectionState.Reconnecting ? "Reconnecting" : "Connecting"}</span></div>
    <div className={`video-grid ${privateRoom ? "private-grid" : ""}`}>{viewing.map(p => {
      const track = tracks.find(t => t.participant.identity === p.id);
      return <div className={`video-cell ${!p.alive && !p.isNarrator ? "out" : ""}`} key={p.id}>
        {track ? <ParticipantTile trackRef={track} className="media-tile" /> : <div className="video-placeholder"><span>{p.name.slice(0, 1).toUpperCase()}</span></div>}
        <div className="video-label"><span>{p.name}{p.id === data.me.id ? " · you" : ""}</span>{p.isNarrator ? <span>moderator</span> : !p.alive && <span>spectating</span>}</div>
      </div>;
    })}</div>
    <div className="call-controls"><button className={`media-toggle ${!isMicrophoneEnabled ? "media-toggle-off" : ""}`} aria-pressed={isMicrophoneEnabled} onClick={toggleMic} disabled={!mayPublish || connection !== ConnectionState.Connected}>{isMicrophoneEnabled ? <Mic size={17} /> : <MicOff size={17} />}{isMicrophoneEnabled ? "Mute mic" : "Turn mic on"}</button><button className={`media-toggle ${!isCameraEnabled ? "media-toggle-off" : ""}`} aria-pressed={isCameraEnabled} onClick={toggleCam} disabled={!mayPublish || cameraBusy || connection !== ConnectionState.Connected}>{isCameraEnabled ? <Camera size={17} /> : <CameraOff size={17} />}{cameraBusy ? "Opening camera…" : isCameraEnabled ? "Turn camera off" : "Turn camera on"}</button><StartAudio label="Allow audio playback" /><span className="muted small"><Volume2 size={15} /> {!mayPublish ? "Spectating · mic and camera off" : connection === ConnectionState.Connected ? "Choose a button to turn on your mic or camera" : "Controls unlock when the call connects"}</span></div>
    {cameraBusy && <p className="muted small" role="status">Waiting for camera access in your browser…</p>}
    {(mediaError || message) && <p className="error" role="alert">{mediaError || message}</p>}
    <RoomAudioRenderer />
  </div>;
}

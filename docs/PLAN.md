# Mafia Online: first playable release

## Product

A private, phone-friendly Mafia game for 6–12 playing friends, plus an optional non-playing moderator. The hosted site admits invited WorkOS accounts; local development can use guest invitations. Players join a specific game by room code and name. Video is the main social surface. Convex owns game state, scheduling, authorization, and persistence; LiveKit owns audio/video. Next.js renders the interface and runs the WorkOS sign-in callback on Vercel. No extra database service is needed.

## Build sequence

1. Implement and test the authoritative rules and private per-player views.
2. Add room creation, invitations, lobby readiness, and reconnectable guest seats.
3. Add scheduled role reveal → narrated Mafia, Detective, and Doctor turns → day → vote cycles and automatic victory detection.
4. Integrate LiveKit with server-issued room grants, private Mafia nights, and spectator restrictions.
5. Build responsive screens based on the reviewed design; validate the real UI and document setup.

## Default rules

- 6–7 players: the organizer chooses 1 or 2 Mafia in the lobby (default 1); 8–10: 2 Mafia; 11–12: 3 Mafia. One Doctor, one Detective, remaining players Villagers. Two Mafia with six players is intentionally a harder variant for the town.
- All participants must be ready; the room organizer or volunteer moderator starts. Random roles are assigned on the backend to playing participants.
- The organizer chooses automatic narration or a volunteer moderator in the lobby. In volunteer mode, one participant sits out, receives no secret role or vote, and controls phase changes. Six playing participants are still required.
- Automatic mode reveals roles for 12 seconds, then begins Night 1. It calls Mafia, Detective, and Doctor in sequence before dawn. Default night: 60 seconds total, discussion: 180 seconds, secret voting: 30 seconds.
- Volunteer mode has no phase deadlines. The moderator reads a cue and advances each scene manually. They see action submission counts, not private targets. Missing actions count as abstentions when the moderator advances.
- Every player sees the same role wake-up sequence. Automatic mode offers optional browser narration; volunteer mode keeps the browser voice off for everyone and carries the moderator's live voice. Only the active role receives its private action. The Mafia can speak privately during their turn; other night turns have no player video room.
- Automatic mode uses full phase timers regardless of how quickly players act. The UI counts down a server deadline; browser timers never determine results.
- Mafia must unanimously choose the same living non-Mafia target. Disagreement or missing choices means no kill. Choices remain editable until the night ends.
- Doctor protects one living player, including themselves; repeat protection is allowed.
- Detective investigates one other living player. The result becomes available at dawn only to that Detective.
- Night actions are chosen in sequence but resolve together at dawn, including actions from a player killed that night.
- Daytime votes are editable until the deadline in automatic mode, or until the moderator advances in volunteer mode. No self-votes. Missing votes count as skip. A tied maximum or a winning skip means no elimination.
- Eliminated players remain in the daytime video call and may speak or keep their camera on, but cannot vote or take night actions. Eliminated Mafia cannot enter subsequent private Mafia rooms.
- Roles stay secret after elimination and are all revealed when the game ends.
- Town wins at zero living Mafia. Mafia wins when living Mafia equal or outnumber the other living players. Check immediately after eliminations; rounds have no fixed maximum.
- Disconnections preserve a player's seat and role. Missing actions follow the normal no-action rules. A present player can reclaim room organization after its holder has been absent for 150 seconds. If the volunteer moderator is absent for 150 seconds, the room organizer may advance scenes so the game does not stall.

## Privacy and phase transitions

Never send the complete game state or other players' secrets to a browser. On the hosted site, WorkOS authenticates invited accounts and Convex uses the verified account ID to identify each player's seat. In local guest mode, a random browser secret identifies the seat and Convex stores only its hash. A room code identifies a game, not a player's identity.

Use a fresh LiveKit room for each media phase. At a transition, stop issuing tokens, disconnect the previous media room on the server, then open the next phase. Non-Mafia never receive a Mafia room token. The Mafia room closes before the Detective turn begins. Everyone leaves the day room together so individual departure events cannot reveal Mafia membership. Eliminated players retain camera and microphone publishing rights in the shared daytime room. Tokens permit only camera and microphone publishing, never screen share or data messages. No roles are stored in public participant metadata.

In volunteer mode, an audio-only moderator room spans role reveal, night, voting, and their transitions. Only the moderator receives microphone publishing rights there; everyone else can only listen. Mafia have a separate private room for their discussion; the moderator can listen but the town cannot. A separate camera room lets the moderator watch connected players whose cameras are on, without letting players watch one another. The moderator speaks in the normal shared table room during daytime discussion.

The backend checks every role action against the current turn and either a server deadline or the moderator's manual phase change; it never trusts a browser's displayed role or timer. This prevents in-app impersonation and out-of-turn actions. It cannot detect off-app texting, a second device, photographing a role screen, or verbal collusion. A human host cannot reliably detect these either. Groups should agree on fair play before starting.

Media cleanup failures hold the game in a visible transition state and retry. They must never silently advance into a potentially leaking call. Token grants are checked against current phase and player state, with short initial token lifetimes. The front end discards stale token responses and disconnects at every media epoch change.

## Validation

Test voting ties/abstentions, saves, simultaneous resolution, Mafia disagreement, both win conditions, invalid and out-of-turn actions, role leakage, guest impersonation, stale deadlines, manual moderator controls, and media grants. Compile and production-build the app. Exercise room creation/join/readiness and both narration modes in the browser. Real cross-device audio/video requires a configured LiveKit project and a final multi-device playtest.

## Not in this release

Public matchmaking, payments, recording, AI voices, custom role packs, and native mobile apps. Invited accounts are included on the hosted site. Automatic narration uses written announcements and browser speech synthesis; it does not need an AI service.

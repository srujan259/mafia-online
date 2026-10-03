# Mafia Online

A private, browser-based Mafia game for 6–12 playing friends, with live video and voice. Convex runs the game and keeps roles and votes private; LiveKit handles calls. Choose an automatic narrator or a volunteer moderator who sits out, speaks the cues, and controls when scenes change. During their turn, living Mafia can talk in a private call or text channel; the volunteer moderator can listen and read, while the town cannot. Everyone returns to the table for daytime discussion. See the [technical user journey](docs/SYSTEM_DESIGN.md) and [product plan](docs/PLAN.md).

## Play locally

Requires Node.js 20 or newer and a LiveKit Cloud project. This checkout uses a local Convex deployment for development, so a Convex account is not required yet.

1. Run `npm install`.
2. In your first terminal, run `CONVEX_AGENT_MODE=anonymous npx convex dev`. This starts the already-selected local Convex deployment on port 3210. Keep it running.
3. In your LiveKit project settings, find the Project URL and create an API key and secret. In a second terminal, run these commands **one at a time**. Convex prompts you to paste the corresponding value after each command. The `CONVEX_AGENT_MODE=anonymous` prefix makes sure they target this local deployment:

   ```sh
   CONVEX_AGENT_MODE=anonymous npx convex env set LIVEKIT_URL         # paste wss://YOUR-PROJECT.livekit.cloud when prompted
   CONVEX_AGENT_MODE=anonymous npx convex env set LIVEKIT_API_KEY     # paste YOUR_API_KEY when prompted
   CONVEX_AGENT_MODE=anonymous npx convex env set LIVEKIT_API_SECRET  # paste YOUR_API_SECRET when prompted
   CONVEX_AGENT_MODE=anonymous npx convex env remove ALLOW_NO_MEDIA
   ```

The text after `#` is an explanation, not a value passed to Convex. Replace the examples with your real LiveKit values at the prompts. This keeps the secret out of shell history.

4. Create your own one-time invitation with `CONVEX_AGENT_MODE=anonymous node scripts/create-invite.mjs "Your name"`. Save the printed code and paste it into the site. The local Convex backend must be running first.
5. In that second terminal, run `npm run dev` and open `http://127.0.0.1:3000`. Enter your invitation, create a room, and share its room link with five or more playing friends. Each friend needs their own one-time site invitation **and** the room code. Everyone joins the call, waits for the **Live** indicator, then readies up. The room organizer can then start. For a volunteer moderator, choose that narration mode in the lobby and have one person volunteer before everyone readies up; this requires at least seven people in total. The volunteer can also start the game.

When using a Convex account and a cloud development deployment later, run `npx convex dev` and the same `npx convex env set NAME` commands without the `CONVEX_AGENT_MODE=anonymous` prefix. Local development is only available on your computer; hosting the game online requires a production Convex deployment.

The API secret stays in Convex. Browsers receive short-lived, role-scoped room tokens. Camera and microphone start off; each player turns them on deliberately.

In automatic mode, the narrator speaks wake-up cues using your browser's voice only after you have connected to the call, and shows them on screen. The speaker button mutes or enables narration. If a living player has been absent for 150 seconds at a phase deadline, or two full rounds pass without any submitted action, the game pauses instead of continuing through empty rounds. Once every living player reconnects, anyone in the room can press **Resume game** to restart that scene's timer. In volunteer mode, browser narration is off for everyone. The moderator receives a cue script and a button to move to the next phase; there are no phase timers. Their microphone can address everyone during role reveal, night, and voting through a separate moderator audio channel. During the Mafia turn, the moderator listens to Mafia speech and can read their text chat but cannot speak in that private call. A separate camera-only room lets the moderator see every connected player whose camera is on; players cannot see each other through that room. Players may turn their camera off, and the app never bypasses browser camera permission. The moderator receives no secret role and cannot vote. A new room is needed to test this flow from the beginning.

Mafia counts scale with the number of playing people (excluding the moderator): at 6–7, the organizer chooses one or two Mafia in the lobby (one by default); at 8–10 there are two, and at 11–12 there are three. Changing the lobby count clears everyone's Ready status. Two Mafia in a six-player game strongly favors the Mafia: one night kill followed by an incorrect town elimination can give them parity and a win. With one Mafia there is no teammate to discuss with. For friends in the same physical room, Mafia can use private text instead of speaking aloud. Private voice requires headphones and enough physical separation to avoid being overheard; everyone should keep their screen out of sight. The night camera room adds LiveKit participants and media usage in volunteer mode, so check your LiveKit allowance before a long group session.

The game enforces secret roles, turn order, server-controlled phase changes, and private call access. It cannot tell whether someone texts another player, shares a screen outside the game, or uses a second device. Agree on fair play with your group before starting.

For a local interface check, `CONVEX_AGENT_MODE=anonymous node scripts/fill-local-room.mjs ROOM_CODE` adds five ready test seats in automatic mode; add `6` for a volunteer moderator who sits out. The helper issues test invitations through the Convex CLI, then saves its test sessions in `.mafia-test-seats.json` (gitignored). Rerunning the same command refreshes their presence and readiness. Start within two minutes of the last run, since test seats do not send heartbeats. Seats created by an older version of the helper cannot be refreshed; remove those seats in the lobby or create a new room before rerunning. These seats are not bots: they do not join calls, vote, or use night actions. Use real friends to test actual gameplay.

If you only want to exercise game rules without a LiveKit project, set `ALLOW_NO_MEDIA=true` **on a local development Convex deployment only**. The game can then start, but the video panel shows setup is still needed. Do not use that setting for a hosted game.

## Deploy

Deploy the frontend on Vercel and the game backend on Convex. Set `CONVEX_DEPLOY_KEY` in Vercel for the Convex deployment you intend the site to use, then use this Vercel build command:

```sh
npx convex deploy --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL --cmd 'npm run build'
```

Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` on that **same Convex deployment** before hosting a game. They do not belong in Vercel's public environment variables. Each environment needs its own Convex configuration. Then do a multi-device test of lobby, private Mafia night, day, voting, and reconnection before inviting a full group.

The following code-based invitations apply only to deployments running in **guest mode**. The current `https://mafia-online-pearl.vercel.app/` site uses WorkOS sign-in and does not accept these codes. For a guest-mode deployment, sign in with `npx convex login` and issue an invitation on the deployment used by that site. This example names the Convex development deployment `polite-buzzard-693`:

```sh
node scripts/create-invite.mjs "Your name" --deployment polite-buzzard-693
```

For a group of eight in guest mode, issue one code with `node scripts/create-invite.mjs "Friday friends" --uses 8 --deployment polite-buzzard-693`, then share that code with the eight people. Each browser claims one of the eight uses. The default without `--uses` remains a single-person code. Check that the script prints `Convex deployment: https://polite-buzzard-693.convex.cloud`. Do not use `--prod` merely because the Vercel URL is a production URL: the frontend currently points to a **development** Convex deployment. The script checks its target before issuing a code. A code accepts new claims for seven days; claimed access persists until revoked. Once claimed, it is bound to that browser's stored guest secret; clearing site data or moving to another device uses another available claim or requires a new invitation. An admitted guest may create rooms but still needs a room's six-character code to join it. Anyone who receives a shared code can claim one of its remaining uses, so share it only with intended guests. This is possession-based invitation access, not verified email identity.

The invite command prints an invitation ID. To revoke access later, run `npx convex run invitations:revoke '{"invitationId":"PASTE_ID"}' --deployment polite-buzzard-693` for that same deployment. Do not publish invitation codes. The CLI functions that issue and revoke them are internal, so website visitors cannot call them.

For a solo guest-mode flow check, set `NEXT_PUBLIC_CONVEX_URL` to the target Convex URL before running `node scripts/fill-local-room.mjs ROOM_CODE`. The helper derives the target deployment from that URL and will create test invitations and seats in that deployment. It does not create WorkOS accounts, so it cannot fill a WorkOS-protected room. Use a throwaway room; test seats cannot test real video or hidden-role conversations.

For a throwaway hosted room with WorkOS sign-in, a Convex project admin can add ready, non-playing test seats with `npx convex run testSeats:fill '{"code":"ROOM_CODE","count":6}' --deployment polite-buzzard-693`. Use `count:5` when the organizer is playing, or `count:6` when the organizer is a volunteer moderator. This is an internal mutation available only through the authenticated Convex CLI, never from the website. It must run while the room is in the lobby; rerunning it refreshes the same seats for another two minutes. The fake seats have no WorkOS accounts, cannot join LiveKit, and cannot vote or use night actions. Do not use this command in a room intended for a real game with friends.

## Invited email accounts

The current live site uses WorkOS **Staging** accounts for entry, backed by Convex deployment `polite-buzzard-693`. Public signup is disabled in WorkOS, and players are invited by email. WorkOS Staging is for testing; switch to a WorkOS Production environment before serving ongoing public traffic. Local Convex remains in guest mode unless `AUTHKIT_AUTH_REQUIRED` is enabled there. You do not need to create another Next.js project. The `clerk-nextjs/` folder from the failed Clerk setup is unused by this app.

1. Create a [WorkOS workspace](https://dashboard.workos.com/) and use its **staging** environment for testing. In Authentication, enable [Magic Auth email codes](https://workos.com/docs/authkit/magic-auth) and disable public **Sign up**. Invite your own email from Users → Invites. Test codes sent by email are for signing in; your player account remains after the code expires.
2. In WorkOS application redirects, add `http://localhost:3000/callback` as a staging callback, `http://localhost:3000/sign-in` as the initiate-login URI, and `http://localhost:3000/` as the sign-out URI. For the live environment, use the matching `https://mafia-online-pearl.vercel.app/callback`, `/sign-in`, and root URLs. WorkOS production requires billing details, though AuthKit is free up to its published monthly active user limit. A custom domain is optional.
3. Set these **server-side** variables in Vercel for the deployment you are configuring: `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD` (at least 32 random characters), and `NEXT_PUBLIC_WORKOS_REDIRECT_URI=https://mafia-online-pearl.vercel.app/callback`. Store the API key and cookie password only as private Vercel variables; do not put them in a `NEXT_PUBLIC_` variable or the repository. For a local staging test, put the staging values in ignored `.env.local` and use `NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/callback`. WorkOS staging and production have separate client IDs, API keys, users, and invitations.
4. On the **Convex deployment used by that site**, set `WORKOS_CLIENT_ID` to the client ID of the application used by the website. If that is not the default application in its WorkOS environment, also set `WORKOS_ISSUER_CLIENT_ID` to the default application's client ID. WorkOS puts the default application's ID in the token issuer even for another application; the game separately checks the token's `client_id` claim against `WORKOS_CLIENT_ID`. Set `MAFIA_AUTH_PRIVATE_KEY` to the private key matching the public JWKS in `convex/auth.config.ts`. Keep the private key in Convex only; never put it in Vercel, a public environment variable, or Git. The current `polite-buzzard-693` deployment already has its matching key. For a new deployment, generate a new RSA key pair, set its private PEM with `npx convex env set MAFIA_AUTH_PRIVATE_KEY --from-file key.pem --deployment DEPLOYMENT`, and replace the public JWKS in `convex/auth.config.ts` before deploying. WorkOS's API key is not needed in Convex. Keep `AUTHKIT_AUTH_REQUIRED` unset during initial setup.
5. Test the callback and sign-in with your invited account, then set `AUTHKIT_AUTH_REQUIRED=true` on that Convex deployment. WorkOS access tokens omit a JWT header that Convex requires. The game's token exchange action verifies the WorkOS signature and application ID, then signs a five-minute token that Convex can accept. After this switch, game functions and LiveKit token actions require a verified WorkOS identity; old browser-only invitation codes no longer grant access. Each signed-in account gets one game seat across devices. Existing guest seats do not transfer to accounts, so start a new room after the switch. Invite friends by email in WorkOS Users → Invites; they accept once and can sign in again later without a new game invitation code. A six-character room code is still needed to join a specific room.

For this site's current Convex development deployment, use the deployment selector in the Convex dashboard and confirm its URL is `https://polite-buzzard-693.convex.cloud` before changing its variables. Its WorkOS issuer client ID is `client_01M3YSE8BZKZC3JX4FKDEMH1E4`. Do not set `AUTHKIT_AUTH_REQUIRED=true` on a new deployment until the website's WorkOS variables, callback, invited owner account, and Convex client IDs are ready. To return to the old guest flow, remove `AUTHKIT_AUTH_REQUIRED` from that Convex deployment; the old invitations remain in its database.

See [WorkOS invite-only signup](https://workos.com/docs/authkit/invite-only-signup), [WorkOS Next.js SDK](https://workos.com/docs/sdks/authkit-nextjs), and [Convex AuthKit integration](https://docs.convex.dev/auth/authkit/add-to-app). WorkOS application-wide invitations can be accepted with another email address, so share invitation links only with the intended player; use organization-specific invitations if the exact consumer email address must match.

## Check the code

`npm run check` runs TypeScript, the rules and access tests, and the production build. The automated tests cover invitation admission and revocation, the automatic game cycle, manual moderator phases, camera-room grants, private-chat access, and privacy boundaries. Actual camera, microphone, and cross-device calls still need a LiveKit-backed playtest with real players.

The implementation follows the [Convex Vercel deployment guide](https://docs.convex.dev/production/hosting/vercel) and [LiveKit server SDK](https://docs.livekit.io/reference/server-sdk-js/) guidance.

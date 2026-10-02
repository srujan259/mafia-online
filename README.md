# Mafia Online

A private, browser-based Mafia game for 6–12 playing friends, with live video and voice. Convex runs the game and keeps roles and votes private; LiveKit handles calls. Choose an automatic narrator or a volunteer moderator who sits out, speaks the cues, and controls when scenes change. Only living Mafia can join their private video room during their turn. Everyone returns to the table for daytime discussion. See the [technical user journey](docs/SYSTEM_DESIGN.md) and [product plan](docs/PLAN.md).

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

In automatic mode, the narrator speaks wake-up cues using your browser's voice only after you have connected to the call, and shows them on screen. The speaker button mutes or enables narration. In volunteer mode, browser narration is off for everyone. The moderator receives a cue script and a button to move to the next phase; there are no phase timers. Their microphone can address everyone during role reveal, night, and voting through a separate moderator audio channel. Mafia speech stays in its private room, unheard by the moderator or town. The moderator receives no secret role, cannot vote, and can speak in the shared table call during the day. Start a new room to test either mode from the beginning.

The game enforces secret roles, turn order, server-controlled phase changes, and private call access. It cannot tell whether someone texts another player, shares a screen outside the game, or uses a second device. Agree on fair play with your group before starting.

For a local interface check, `CONVEX_AGENT_MODE=anonymous node scripts/fill-local-room.mjs ROOM_CODE` adds five ready test seats in automatic mode; add `6` for a volunteer moderator who sits out. The helper issues test invitations through the Convex CLI, then saves its test sessions in `.mafia-test-seats.json` (gitignored). Rerunning the same command refreshes their presence and readiness. Start within a minute of the last run, since test seats do not send heartbeats. Seats created by an older version of the helper cannot be refreshed; remove those seats in the lobby or create a new room before rerunning. These seats are not bots: they do not join calls, vote, or use night actions. Use real friends to test actual gameplay.

If you only want to exercise game rules without a LiveKit project, set `ALLOW_NO_MEDIA=true` **on a local development Convex deployment only**. The game can then start, but the video panel shows setup is still needed. Do not use that setting for a hosted game.

## Deploy

Deploy the frontend on Vercel and the game backend on Convex. Set `CONVEX_DEPLOY_KEY` in Vercel for the Convex deployment you intend the site to use, then use this Vercel build command:

```sh
npx convex deploy --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL --cmd 'npm run build'
```

Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` on that **same Convex deployment** before hosting a game. They do not belong in Vercel's public environment variables. Each environment needs its own Convex configuration. Then do a multi-device test of lobby, private Mafia night, day, voting, and reconnection before inviting a full group.

After the new Convex functions have deployed, sign in with `npx convex login` and issue the invitation on the **deployment used by the deployed site**. For `https://mafia-online-pearl.vercel.app/`, the current frontend points to the Convex development deployment `polite-buzzard-693`:

```sh
node scripts/create-invite.mjs "Your name" --deployment polite-buzzard-693
```

For a group of eight, issue one code with `node scripts/create-invite.mjs "Friday friends" --uses 8 --deployment polite-buzzard-693`, then share that code with the eight people. Each browser claims one of the eight uses. The default without `--uses` remains a single-person code. Check that the script prints `Convex deployment: https://polite-buzzard-693.convex.cloud`. Do not use `--prod` merely because the Vercel URL is a production URL: the frontend currently points to a **development** Convex deployment. The script checks its target before issuing a code. A code accepts new claims for seven days; claimed access persists until revoked. Once claimed, it is bound to that browser's stored guest secret; clearing site data or moving to another device uses another available claim or requires a new invitation. An admitted guest may create rooms but still needs a room's six-character code to join it. Anyone who receives a shared code can claim one of its remaining uses, so share it only with intended guests. If the Vercel production domain is publicly reachable, visitors can see the invitation screen, but game creation, room joining, state, and media access are enforced by Convex. Vercel Deployment Protection is a separate hosting setting; if enabled, visitors must pass that gate before seeing the game. This is possession-based invitation access, not verified email identity.

The invite command prints an invitation ID. To revoke access later, run `npx convex run invitations:revoke '{"invitationId":"PASTE_ID"}' --deployment polite-buzzard-693` for that same deployment. Do not publish invitation codes. The CLI functions that issue and revoke them are internal, so website visitors cannot call them.

For a solo production flow check, set `NEXT_PUBLIC_CONVEX_URL` to the **production Convex URL** before running `node scripts/fill-local-room.mjs ROOM_CODE`. The helper derives the target deployment from that URL and will create test invitations and seats in that deployment. Use a throwaway room; these seats cannot test real video or hidden-role conversations.

## Replace site codes with invited email accounts

The app has a WorkOS AuthKit path for permanent player accounts. It is **inactive until configured**: the current live site keeps using Convex invitation codes. You do not need to create another Next.js project. The `clerk-nextjs/` folder from the failed Clerk setup is unused by this app.

1. Create a [WorkOS workspace](https://dashboard.workos.com/) and use its **staging** environment to test locally. In Authentication, enable [Magic Auth email codes](https://workos.com/docs/authkit/magic-auth) and disable public **Sign up**. Invite your own email from Users → Invites. Test codes sent by email are for signing in; your player account remains after the code expires.
2. In WorkOS application redirects, add `http://localhost:3000/callback` as a staging callback, `http://localhost:3000/sign-in` as the initiate-login URI, and `http://localhost:3000/` as the sign-out URI. For the live environment, use the matching `https://mafia-online-pearl.vercel.app/callback`, `/sign-in`, and root URLs. WorkOS production requires billing details, though AuthKit is free up to its published monthly active user limit. A custom domain is optional.
3. Set these **server-side** variables in Vercel for the deployment you are configuring: `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD` (at least 32 random characters), and `NEXT_PUBLIC_WORKOS_REDIRECT_URI=https://mafia-online-pearl.vercel.app/callback`. Store the API key and cookie password only as private Vercel variables; do not put them in a `NEXT_PUBLIC_` variable or the repository. For a local staging test, put the staging values in ignored `.env.local` and use `NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/callback`. WorkOS staging and production have separate client IDs, API keys, users, and invitations.
4. On the **Convex deployment used by that site**, set `WORKOS_CLIENT_ID` to the **same WorkOS environment's** client ID. Then copy `convex/auth.config.ts.example` to `convex/auth.config.ts`, commit and push that file, and redeploy. Convex requires the Client ID before it will accept an auth configuration that references it. The Vercel build command above deploys this configuration when it uses the correct `CONVEX_DEPLOY_KEY`. WorkOS's API key is not needed in Convex for this integration. Keep `AUTHKIT_AUTH_REQUIRED` unset during setup.
5. Test the callback and sign-in with your invited account, then set `AUTHKIT_AUTH_REQUIRED=true` on that Convex deployment. After this switch, game functions and LiveKit token actions require a verified WorkOS identity; old browser-only invitation codes no longer grant access. Each signed-in account gets one game seat across devices. Existing guest seats do not transfer to accounts, so start a new room after the switch. Invite friends by email in WorkOS Users → Invites; they accept once and can sign in again later without a new game invitation code. A six-character room code is still needed to join a specific room.

For this site's current Convex development deployment, use the deployment selector in the Convex dashboard and confirm its URL is `https://polite-buzzard-693.convex.cloud` before changing its variables. Do not set `AUTHKIT_AUTH_REQUIRED=true` until the website's WorkOS variables, callback, invited owner account, and Convex `WORKOS_CLIENT_ID` are ready. To return to the old guest flow, remove `AUTHKIT_AUTH_REQUIRED` from that Convex deployment; the old invitations remain in its database.

See [WorkOS invite-only signup](https://workos.com/docs/authkit/invite-only-signup), [WorkOS Next.js SDK](https://workos.com/docs/sdks/authkit-nextjs), and [Convex AuthKit integration](https://docs.convex.dev/auth/authkit/add-to-app). WorkOS application-wide invitations can be accepted with another email address, so share invitation links only with the intended player; use organization-specific invitations if the exact consumer email address must match.

## Check the code

`npm run check` runs TypeScript, the rules and access tests, and the production build. The automated tests cover invitation admission and revocation, the automatic game cycle, manual moderator phases, and privacy boundaries. Actual camera, microphone, and cross-device calls still need a LiveKit-backed playtest.

The implementation follows the [Convex Vercel deployment guide](https://docs.convex.dev/production/hosting/vercel) and [LiveKit server SDK](https://docs.livekit.io/reference/server-sdk-js/) guidance.

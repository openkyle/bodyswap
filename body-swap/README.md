# Body Swap — preview 0.3.8

Target: Foundry VTT **11 build 315**, D&D 5e **2.4.1**. This preview has automated logic tests, but has not yet been tested inside a running Foundry world.

## Install

1. Extract the archive so `Data/modules/body-swap/module.json` exists in your Foundry user-data folder.
2. Restart Foundry, open your world, and enable **Body Swap** under Manage Modules.
3. Create a Script macro containing `await game.modules.get("body-swap").api.installMacros();` and run it as the primary active GM.
4. Drag **Body Swap: Swap Selected**, **Revert Now**, and **Cancel Roll Request** from the Macro Directory onto your hotbar.
5. Configure options under Configure Settings → Module Settings → Body Swap.

## Use

Select at least two eligible tokens and run **Swap Selected**. Each participant moves to a different selected body; the chat card shows `original character name → destination portrait and body name`, without repeating the original portrait. The physical tokens stay in place. During the swap, each destination token takes the incoming character’s original scene-token name, including for enemies. Character names are the default. Enable **Show player names** in module settings to append account names, such as **Brother (Josh)**, in assignments, chat, and temporary token/initiative names. This option is off by default and applies to new swaps. Existing name-display settings are left untouched. Existing initiative entries use the same name. Prototype token names are updated too; a shared sidebar Actor lists its incoming names separated by `/`. Original token names, prototype names, and existing initiative aliases are restored on reversion. Initiative entries added during the swap have inherited temporary names restored to the original body name. Players receive ownership of their destination Actor and their assigned character changes. Double-clicking the destination token opens its sheet using Foundry's native ownership behavior.

With **zero or one token selected**, the same macro opens **Assign Bodies** for the current scene. Character names appear in a responsive grid with a destination dropdown under each name. The initial assignment is randomized. Change any destination and its previous occupant automatically receives the freed destination; all dropdowns update immediately, with no duplicate destinations. Click **Enable Body Swap** to apply the displayed assignments, or **Randomize** to reshuffle. Closing or cancelling the window changes nothing.

Assignments to the same body are labeled **Stays in this body** and are not swapped. This allows individual characters to sit out. Ineligible scene tokens remain visible with an explanation; enable **Include enemies** in settings to use unassigned NPC bodies. The window respects the same eligibility and linked-token and player-assignment restrictions as quick swapping. It can also be opened directly with `await game.modules.get("body-swap").api.configure();`.

Each card shows an 80-pixel destination portrait above a centered 56-pixel original portrait, with names and an upward arrow. Destination portraits update with dropdown changes, including displaced assignments. Images use scene token artwork, falling back to Actor portraits for video textures and a placeholder for unavailable images. These previews only appear in the interface; scene artwork is unchanged.

Click **Pair ↔** beneath a destination to make it mutual: A → B also sets B → A, automatically redistributing displaced destinations. **Leave unchanged** excludes that character and body from other destination dropdowns and keeps it excluded through Randomize. Unchecking it rejoins the character to an available assignment. Pairing adjusts the current plan; Randomize can change pairs.

The active-swap chat card includes a live countdown, or **Active — manual reversion** when no timer is set. Its **Revert now** button is visible only to GMs and executable by the primary active GM. After restoration the card shows **Ended**; old cards cannot revert a newer swap. Countdown display refreshes each second; actual expiry checks remain every five seconds and require an active GM.

For manual assignments with Constitution resistance, successful bodies are removed from their assignment cycles, and the remaining destinations reconnect around them. If A → B → C → A and B resists, A and C swap. If only one body remains in a cycle, it stays unchanged. The GM's assignments are not rerandomized after rolls.

With Constitution resistance enabled, a chat card requests one roll per body, with each Roll Constitution button on its own line below the portrait and name. Assigned players may click their own button, and the GM may roll for NPCs or offline players. Buttons show when rolls are submitted or received, and prevent duplicate clicks. Self-only rolls are whispered to the player and GM so the request can resolve; other roll modes are preserved. The native D&D 5e roll dialog supports the usual roll options. A result meeting the DC excludes that body. The swap waits for everyone; fewer than two failures means no swap. Cancel Roll Request abandons a pending request.

The optional timer measures real-world seconds from the completed swap. Zero disables it. The primary active GM checks expiry every five seconds. A reload preserves the deadline; if no GM is connected, reversion waits until one reconnects. Revert Now restores immediately.

## Persistent timer and automatic swaps

A persistent timer panel sits at the bottom of chat, above the input controls and outside the message log. It remains after chat messages are cleared and shows the current swap countdown, manual-reversion status, or waiting-for-rolls status. When idle it stays visible with “no active swap.” It also shows the next automatic-swap countdown when enabled.

Enable **Automatic swaps** in module settings and set **Automatic swaps every X minutes (real time)**. The feature is off by default; the recommended/default interval is **30 minutes**, with a minimum of 1 minute. Enabling the setting starts the countdown immediately; no manual swap is required. Each automatic swap uses all eligible tokens on the currently active world scene, regardless of the GM’s selection or viewed scene. Enable **Include enemies** to include unassigned NPC bodies. Duplicate linked bodies and repeated starting bodies for the same player are skipped. Each run uses a new random plan; manual exclusions and pairings are not retained. Each active swap is restored before the next random swap begins. Constitution resistance and other module options still apply.

The schedule uses real-world time, independently of the reversion duration, and survives reloads. An active primary GM checks it every five seconds. Pending rolls or recovery delay the next swap; missed intervals produce one swap, not a backlog. Changing the interval or starting a new manual swap resets the countdown. Turning automatic swaps off stops future swaps without ending the current one; manual Revert Now alone does not stop the schedule. Scenes with fewer than two eligible bodies are skipped without opening an assignment dialog. The persistent current-swap timer works independently with automatic swaps disabled.

## Permissions and shared accounts

The full original ownership map is saved for every affected Actor, including default access, multiple owners, observers, and offline users. Original player character assignments are saved separately. Reversion restores these exact values, including shared vision permissions. HP, items, effects, and positions are not rolled back.

By default, participating accounts lose access to other participating bodies and receive ownership of their destination. Unrelated accounts retain their existing access.

Enable **Shared vision** in module settings to preserve all existing permissions and give every non-GM account Owner access to any body occupied by a swapped player, including enemy bodies. This includes offline players and players outside the swap. Existing access to original player bodies remains intact even when an enemy mind enters one. Owner access also permits controlling and editing these bodies. The option is off by default and is saved with each new swap request; reversion restores the exact original permissions. Token vision and sight settings are unchanged. Permissions edited manually during the swap are replaced by the saved original permissions on reversion.

Eligibility is based on each player's **assigned character**, not every character they can access. This prevents shared party ownership from accidentally treating every player as every character's controller. Foundry assigns only one character per account: a partner's additional character sharing the same login is not automatically recognized as a separate player-controlled participant in this preview. Multiple accounts assigned to the same body travel together. With Include enemies enabled, unassigned bodies participate as GM-controlled minds.

Unlinked scene tokens from the same sidebar Actor can participate as separate bodies, retaining their own HP, items, and effects. The shared sidebar Actor grants ownership to all incoming players; each participating unlinked token receives its own incoming controller permissions. Other tokens using that sidebar Actor may inherit the broader access. Linked tokens sharing an Actor still represent one body, so select only one of those. A player account cannot enter the same swap through multiple starting bodies. One swap or pending request may exist per world.

## Actor lookup and recovery

A token's existing Actor is authoritative, including its synthetic token data. If it has no Actor, resolve an exact unique name in the Actors sidebar, then optionally search Actor compendiums. Ambiguous names stop the request. Compendium matches are imported into the Actors sidebar; imported Actors remain there after reversion. Temporary token bindings are restored.

Recovery data is saved before changing permissions. Failed recovery retains the journal for another Revert Now attempt. After an interrupted application, run Revert Now before starting another swap. Keep the module enabled until reversion completes.

## Verification

Run `node --test tests/body-swap.test.mjs` from the source workspace. Tests cover random cycles, control transfer, exact permission restoration including shared access, resistance, default enemy exclusion, mutation failure recovery, timer expiry, assignment displacement, cycle reconnection, macro routing, execution of the editor's displayed plan, mutual pairing, exclusions through reshuffling, and chat countdown/reversion controls. These are mocked integration tests; they do not substitute for testing native Foundry documents, the rendered Dialog, and connected player clients.

Before release, test with a GM and separate player browsers in a test world: linked and unlinked tokens, shared ownership, Constitution check/save dialogs, two-player swaps, NPC participation, Actor compendium lookup, movement and double-click sheet access, reload recovery, and timed/manual reversion.

API reference: [Foundry v11 Users and primary GM](https://foundryvtt.com/api/v11/classes/client.Users.html), [Foundry v11 TokenDocument](https://foundryvtt.com/api/v11/classes/client.TokenDocument.html).

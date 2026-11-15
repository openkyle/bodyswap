Body Swap 0.3.7 preview for Foundry VTT 11 build 315 and D&D 5e 2.4.1.

Adds a persistent timer panel at the bottom of chat, outside the scrolling message log. Clearing messages does not remove it. It shows remaining swap time, manual-reversion or pending-roll status, and the next automatic-swap countdown.

Adds optional Automatic swaps every X minutes (real time). Off by default, with a recommended/default 30-minute interval. Run a manual swap to choose participants; scheduled swaps reuse them, restore the previous swap, then randomize again. Manual pairings are not retained. Constitution resistance and other module settings still apply.

Schedules survive reloads and require an active primary GM. Pending rolls and recovery delay swaps; missed intervals do not accumulate. Disabling automatic swaps stops the schedule without ending the current swap. Manual reversion alone does not disable the schedule.

All 27 automated tests pass. Live Foundry layout and connected-player testing are pending.

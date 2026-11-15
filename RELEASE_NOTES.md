Body Swap 0.3.8 preview for Foundry VTT 11 build 315 and D&D 5e 2.4.1.

Automatic swaps now use all eligible tokens on the currently active world scene instead of participants saved by a manual swap. Enabling the setting starts the countdown immediately. Include enemies controls unassigned NPC participation. Duplicate linked bodies and repeated starting bodies for one player are skipped; scenes with fewer than two eligible bodies are skipped without opening a dialog.

The persistent current-swap timer remains available independently of automatic swaps. Automatic swaps remain off by default, with a recommended/default interval of 30 real-world minutes.

All 28 automated tests pass, including active-scene changes, automatic start without manual setup, empty scenes, duplicate bodies, and the timer with automatic swaps disabled. Live Foundry testing is pending.

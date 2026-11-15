Body Swap 0.3.5 preview for Foundry VTT 11 build 315 and D&D 5e 2.4.1.

Adds Shared vision, off by default. When enabled, every non-GM account receives Owner access to bodies occupied by swapped players, including enemy bodies. Offline players and players outside the swap are included. Existing permissions on original player bodies and other party characters are preserved rather than removed.

Owner access includes control and editing as well as shared vision. Token sight settings are unchanged. The option is saved with new swap requests; reversion restores original ownership exactly, even if the setting changes during the swap.

Character names remain the default, optional player labels remain available, and names still revert without overriding name-display settings.

All 21 automated tests pass, including linked and unlinked destinations, offline and nonparticipating players, exact restoration, and failure recovery. Live Foundry testing is pending.

Body Swap 0.3.11 preview for Foundry VTT 11 build 315 and D&D 5e 2.4.1.

Swap names now apply only to participating scene tokens and initiative entries. Sidebar prototype names remain original, so dragging out a NetherMote while Brother occupies another NetherMote creates a normally named fresh body.

New tokens from affected sidebar Actors are created unlinked with the Actor’s original permissions, preventing temporary swap/shared-vision ownership from leaking onto the fresh body. Other token data is preserved. Fresh bodies are not rolled back when the existing swap ends.

Prototype names changed by older versions are repaired on GM reconnect without ending the active swap. Existing tokens created before this fix are not retroactively renamed.

All 31 automated tests pass, including linked/unlinked fresh drops, permission isolation, reversion, and legacy prototype repair. Live Foundry testing is pending.

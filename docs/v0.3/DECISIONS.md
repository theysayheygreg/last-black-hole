# v0.3 Decisions

> Document revision: v0.3. Updated 2026-07-15. This file records accepted
> implementation decisions for the current source line. Remaining Greg-owned
> decisions stay in `OPEN-DECISIONS.md`.

## Pause And Resume Reconciliation

**Status:** accepted on `341268b17f76a58303531c57743b461b4d7c9e83`.

Pause is a local presentation overlay. The remote authority world continues:
authority, network health, snapshot intake, and covered event intake remain
live, and pause never auto-unpauses. Entry neutralizes held and edge inputs
exactly once, clears pending action flags, and leaves server truth untouched.

Covered presentation coalesces to the latest authority snapshot. A short resume
under `1500ms` follows the current phase normally. A long resume at or above
`1500ms` applies the newest authority truth atomically, settles camera, fluid,
and presentation, and clears stale UI motion. Terminal, phase, and run changes
route directly from current authority truth; cached terminal events are scoped
to the exact authority run.

The local debug/sandbox freeze is separate and may freeze client simulation for
debugging only. Deck/controller prompts use the accepted graphical glyph family
without raw keyboard fallback copy. Reduced motion keeps required pause,
recovery, terminal, and resume copy settled and readable.

This decision changes no protocol or server authority behavior. Visual feel and
headed proof remain deferred; this source acceptance does not require visual
proof.

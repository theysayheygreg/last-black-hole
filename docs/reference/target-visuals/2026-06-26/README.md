# 2026-06-26 Target Visuals

> **v0.2 status:** Generated visual targets for the Three entity hierarchy pass.
> These are not source assets. They are art-direction references for readable
> layering, entity separation, and palette exploration.

## Files

- `01-playable-separation-target.png` - broad gameplay composition with ASCII
  fabric, void depth, entity separation, wells, portals, wrecks, stars, and an
  Inhibitor-adjacent magenta region.
- `02-entity-readability-target.png` - closer gameplay readability target for
  contact mattes, richer wreck clusters, comet tails, enemy trails, and local
  glow.
- `03-scene-stack-style-board.png` - generated scene-stack and entity-language
  board. The labels are illustrative only; use the written docs as canonical.

## How To Use These

Use these as a pressure test for implementation decisions:

- can the real game keep this much black space without feeling empty;
- can entities read through local contrast instead of larger icons;
- can stars, wrecks, portals, and comets become distinct object families;
- can magenta/violet stay rare enough that Inhibitor space feels invasive;
- can post-processing make the world cohesive without washing out the ASCII.

When a target conflicts with `docs/design/PILLARS.md` or
`docs/design/THREE-SCENE-VISUAL-HIERARCHY.md`, the docs win.

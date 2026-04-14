# Content Manifests

LBH's authority/runtime split is now real enough that content truth needs to stop hiding inside hot codepaths.

This document tracks which runtime data surfaces have been extracted into explicit manifests and which ones are still scattered across the sim, client, and design docs.

## Why This Exists

The goal is not to turn LBH into a data-driven cathedral overnight.

The goal is simpler:

- keep gameplay identity in data space when it is really content
- keep runtime logic focused on simulation, orchestration, and rendering
- make agent feature work safer by giving it a smaller number of trusted places to edit

## Manifest Status

### Hull Manifest — First Pass Complete

Source:

- `/Users/theysayheygreg/clawd/projects/last-black-hole/scripts/content/hulls.js`

Now owns:

- rig track names and themes
- profile ship → hull mapping
- hull baseline coefficients
- hull abilities
- AI personality → allowed hull mapping

Consumers:

- `/Users/theysayheygreg/clawd/projects/last-black-hole/scripts/player-brain.js`
- `/Users/theysayheygreg/clawd/projects/last-black-hole/scripts/sim-runtime.js`

Why this one first:

- it was already duplicated conceptually across `player-brain.js`, `sim-runtime.js`, and the design docs
- it is high leverage for both feature work and balance work
- it preserves the original intent of the hull system while reducing hidden coupling

### Still to Extract

#### Seeded generation content

Still scattered across:

- `/Users/theysayheygreg/clawd/projects/last-black-hole/scripts/seeded-generation.js`
- `/Users/theysayheygreg/clawd/projects/last-black-hole/src/seeded-generation.js`

Candidate manifest contents:

- cosmic signatures
- well names
- chronicle fragments
- seeded loot catalog
- seeded consumables
- wreck wave schedule

#### Client loot/item UI catalog

Still centered in:

- `/Users/theysayheygreg/clawd/projects/last-black-hole/src/items.js`

Candidate future split:

- item catalog manifest
- sell/value bands
- UI-facing item descriptors
- category and rarity metadata

#### Session/map profiles

Still centered in:

- `/Users/theysayheygreg/clawd/projects/last-black-hole/scripts/sim-runtime.js`

Candidate manifest contents:

- map-scale profiles
- overload defaults
- AI/hazard budgets
- force budgets
- coarse-field settings

## Rule of Thumb

Extract content when all three are true:

1. it is primarily descriptive rather than procedural
2. multiple systems want the same truth
3. moving it out will reduce drift without hiding the important logic

Do not extract just to feel tidy.

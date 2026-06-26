# Three Entity Mood Board

> **v0.2 status:** Reference board for the entity visual pass. This is a
> technique board, not a request to imitate any game's style directly.

## Why These References

Last Singularity needs a specific hybrid: symbolic 2D readability, staged 3D
depth, modern lighting, strong post-processing, and a black void that keeps the
world frightening. The references below are useful because each solves one part
of that problem.

## Reference Notes

| Reference | Useful Technique | LBH Translation | Source |
|-----------|------------------|-----------------|--------|
| Octopath Traveler / HD-2D | 2D identity fused with 3D environments, lighting, lens language, and diorama staging | Keep ASCII/glyph identity and pixel entity surfaces, but stage them in a modern depth/post stack. Do not copy heavy depth of field; LBH's black void needs sharper contrast tools. | [Square Enix Octopath Traveler II](https://www.square-enix-games.com/en_US/games/octopath-traveler-ii), [Unreal Engine HD-2D interview](https://www.unrealengine.com/spotlights/octopath-traveler-s-hd-2d-art-style-and-story-make-for-a-jrpg-dream-come-true) |
| Dragon Quest III HD-2D | Modernized classic readability with 3D graphics supporting old-school forms | Let simple symbolic entities gain modern lighting without losing map readability | [Square Enix HD-2D notes](https://www.square-enix.com/asia/newsportal/en/th/dragon-quest-iii-hd-2d/) |
| Hollow Knight | Layered foreground/background depth, strong silhouettes, dense atmosphere without losing player read | Use near/far parallax, value staging, and negative-space silhouettes around the player | [Team Cherry progress post](https://www.teamcherry.com.au/blog/hollow-knight-then-and-now) |
| Caves of Qud | Dense symbolic world language and science-fantasy specificity | Keep LBH's ASCII fabric meaningful; iconography can be strange and readable rather than literal | [Caves of Qud official site](https://www.cavesofqud.com/) |
| Rain World | Fragile player silhouette inside a broken ecosystem, atmosphere as threat context | Make small entities feel alive or hostile through motion and layered habitat, not size | [Rain World Steam page](https://store.steampowered.com/app/312520/Rain_World/) |
| Dead Cells | 3D pipeline resolved into 2D/pixel-scale animation, modern effects over classic reads | If 3D source assets are used, resolve them into pixel-scale top-down reads rather than smooth miniatures | [Game Developer art pipeline](https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-), [80.lv interview](https://80.lv/articles/interview-with-the-developers-of-dead-cells) |
| Ori and the Will of the Wisps | Hand-painted depth, glow, foreground atmosphere, rich value control | Borrow the discipline of foreground haze and source-driven glow while keeping LBH darker and harsher | [Ori official site](https://www.orithegame.com/) |
| Darkest Dungeon | Harsh silhouettes, readable gothic cutouts, high-contrast dread | Use cutout-like hull and threat silhouettes with hard rim lights, not smooth generic ships | [Red Hook Darkest Dungeon about](https://www.darkestdungeon.com/darkest-dungeon/about/) |

## What Not To Borrow

- Do not let HD-2D turn LBH into a cozy miniature diorama. The void is colder
  and more hostile.
- Do not overpaint the ASCII fabric until it stops being the product identity.
- Do not copy character, creature, prop, or palette specifics from reference
  games. Borrow rendering structure and readability tricks only.
- Do not make the entity layer busier than the fabric. Entities need local
  contrast, not universal glow.
- Do not use smooth low-poly or glossy vector-clean ships/entities. LBH entity
  assets should be 2D pixel surfaces or 3D meshes with pixelated top-down
  textures.
- Do not lean on heavy depth of field. Octopath can blur rich scenic layers;
  LBH's empty black space should usually stay sharp, ominous, and high contrast.

## Mood Board Takeaways

1. **Depth is mostly value discipline.** A black void, mid-value field, bright
   interactables, and rare saturated accents will read better than more colors.
2. **Tiny objects need a three-part read.** Shape, matte, and glow/trail are the
   minimum. A naked icon disappears in the fabric.
3. **2D identity can live inside a 3D scene.** LBH can use Three groups,
   instancing, lights, bloom, and render targets while still looking like ASCII
   cosmology.
4. **Motion is art direction.** Comet tails, rival trails, sentry lunges, and
   salvage glints should identify object families before labels do.
5. **The player silhouette is sacred.** The world can be loud, but the player
   craft needs the cleanest separation system in the scene.

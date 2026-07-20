# Void Stares Back — promo capture

In-engine capture of the `promoVoidStares` renderer fixture: the title
well winks. Render-only theater (`src/render/promo-wink.js`), never
reachable from gameplay.

## Regenerate

```sh
node scripts/promo/capture-void-wink.cjs
```

Writes one 6 s wink loop at 30 fps to `frames/` plus three hero stills
(`still-stare`, `still-wink`, `still-glint`).

## Assemble

```sh
cd docs/promo/void-stares-back
ffmpeg -y -framerate 30 -i frames/frame-%03d.png -c:v libx264 -pix_fmt yuv420p -crf 18 void-stares-back.mp4
ffmpeg -y -framerate 30 -i frames/frame-%03d.png -vf "fps=20,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" void-stares-back.gif
```

The `frames/` directory is regenerable scratch — don't commit it.

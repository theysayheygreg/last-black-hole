/**
 * promo-wink.js — "the void stares back" promo-fixture overlay.
 *
 * Render-only theater for promo captures: the fixture's central well
 * winks. An upper lid sweeps down as a void-colored occlusion with a
 * cyan lash-arc edge (tilted — the smirk), holds, reopens, and leaves a
 * brief cyan catchlight on the rim of the pupil.
 *
 * This is NOT game reality. It draws on the 2D overlay canvas, only when
 * a renderer fixture declares `promoWink`, and touches no sim state.
 */

const CYAN = 'rgba(0, 226, 255, 0.9)';

/**
 * Wink timeline within each period, all in seconds from period start.
 * The eye stares for most of the loop; the wink lands near the end so
 * looping captures read as: long stare … wink … back to the stare.
 */
export function winkStateAt(time, config) {
  const period = config.periodSeconds ?? 6;
  const close = config.closeSeconds ?? 0.22;
  const hold = config.holdSeconds ?? 0.18;
  const reopen = config.reopenSeconds ?? 0.28;
  const glint = config.glintSeconds ?? 0.6;
  const t = ((time % period) + period) % period;
  const start = period - (close + hold + reopen + glint) - 0.4;
  const tw = t - start;

  if (tw <= 0) return { lidT: 0, glintA: 0 };
  if (tw < close) {
    const u = tw / close;
    return { lidT: u * u * (3 - 2 * u), glintA: 0 }; // smoothstep down
  }
  if (tw < close + hold) return { lidT: 1, glintA: 0 };
  if (tw < close + hold + reopen) {
    const u = (tw - close - hold) / reopen;
    return { lidT: 1 - u * u * (3 - 2 * u), glintA: 0 };
  }
  if (tw < close + hold + reopen + glint) {
    const u = (tw - close - hold - reopen) / glint;
    // pop in fast, fade out slow
    const a = u < 0.25 ? u / 0.25 : 1 - (u - 0.25) / 0.75;
    return { lidT: 0, glintA: a };
  }
  return { lidT: 0, glintA: 0 };
}

/**
 * Lower edge of the upper lid at screen x. Eye-shaped arc with a slight
 * asymmetric tilt (one corner rides higher) and a droop that deepens as
 * the lid closes — the closed state reads as a sly, satisfied line.
 */
function lidEdgeY(x, cx, cy, r, lidT) {
  const u = Math.max(-1, Math.min(1, (x - cx) / (r * 1.05)));
  const arc = Math.sqrt(Math.max(0, 1 - u * u));
  const tilt = -u * 0.10;
  const openY = cy - r * 1.35;
  const closedY = cy + r * (0.12 + tilt);
  return openY + (closedY - openY + r * arc * 0.32 * lidT) * lidT;
}

/**
 * Draw the wink overlay.
 * @param ctx      2D overlay context
 * @param opts     { cx, cy, radius, time, config } — eye center and outer
 *                 accretion radius in overlay pixels; time in seconds.
 */
export function drawPromoWink(ctx, { cx, cy, radius, time, config, viewH = Infinity }) {
  const { lidT, glintA } = winkStateAt(time, config || {});
  const r = radius;

  if (lidT > 0.02) {
    // The lid: occlude everything above the lash edge inside the eye
    // bounds with near-void, then stroke the lash-arc on the edge.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2);
    ctx.clip();

    // Near-void fill with a feathered rim so the lid melts into the dark
    // fabric instead of reading as a flat balloon.
    const lidFill = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.3);
    lidFill.addColorStop(0, 'rgba(0, 0, 6, 0.97)');
    lidFill.addColorStop(0.72, 'rgba(0, 0, 6, 0.97)');
    lidFill.addColorStop(1, 'rgba(0, 0, 6, 0)');
    ctx.fillStyle = lidFill;
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.3, cy - r * 1.35);
    for (let x = cx - r * 1.3; x <= cx + r * 1.3; x += 6) {
      ctx.lineTo(x, lidEdgeY(x, cx, cy, r, lidT));
    }
    ctx.lineTo(cx + r * 1.3, cy - r * 1.35);
    ctx.closePath();
    ctx.fill();

    // lash-arc
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = Math.max(2, r * 0.012);
    ctx.shadowColor = 'rgba(0, 226, 255, 0.5)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    let first = true;
    for (let x = cx - r * 1.05; x <= cx + r * 1.05; x += 6) {
      const y = lidEdgeY(x, cx, cy, r, lidT);
      if (first) { ctx.moveTo(x, y); first = false; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // lashes at the outer corners, only when mostly closed
    if (lidT > 0.85) {
      ctx.lineWidth = Math.max(1.5, r * 0.008);
      for (const side of [-1, 1]) {
        for (const f of [0.68, 0.85, 1.0]) {
          const x = cx + side * r * 1.05 * f;
          const y = lidEdgeY(x, cx, cy, r, lidT);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + side * r * 0.07, y + r * 0.075);
          ctx.stroke();
        }
      }
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  if (glintA > 0.01) {
    // Catchlight: a four-point star on the pupil rim, up-right of center.
    const gx = cx + r * 0.28;
    const gy = cy - r * 0.22;
    const s = r * 0.08;
    ctx.save();
    ctx.strokeStyle = `rgba(0, 226, 255, ${(0.95 * glintA).toFixed(3)})`;
    ctx.lineWidth = Math.max(2, r * 0.012);
    ctx.shadowColor = `rgba(0, 226, 255, ${(0.9 * glintA).toFixed(3)})`;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(gx - s, gy); ctx.lineTo(gx + s, gy);
    ctx.moveTo(gx, gy - s); ctx.lineTo(gx, gy + s);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, r * 0.006);
    ctx.beginPath();
    ctx.moveTo(gx - s * 0.45, gy - s * 0.45); ctx.lineTo(gx + s * 0.45, gy + s * 0.45);
    ctx.moveTo(gx + s * 0.45, gy - s * 0.45); ctx.lineTo(gx - s * 0.45, gy + s * 0.45);
    ctx.stroke();
    ctx.restore();
  }

  if (config?.tagline) {
    ctx.save();
    ctx.font = '500 16px "SF Mono", Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(154, 180, 206, 0.72)';
    ctx.fillText(config.tagline, cx, Math.min(cy + r * 1.85, viewH - 36));
    ctx.restore();
  }
}

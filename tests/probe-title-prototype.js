/**
 * Probe the title-prototype page headlessly.
 * Collects console output, errors, WebGL info, Composer/pass stats, and
 * canvas samples so we can tell whether the LBH-native render pipeline is
 * actually producing visible pixels.
 *
 * Run: node tests/probe-title-prototype.js [--query foo=1&bar=2]
 *
 * The probe always appends ?probe=1 unless the caller explicitly provides
 * probe/readback. That makes title-prototype preserve the drawing buffer for
 * deterministic readPixels checks without changing normal runtime perf.
 */
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const { startServer, stopServer } = require("./helpers");

const SCREENSHOT_DIR = path.join(__dirname, "screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function run() {
  console.log("\n=== TITLE PROTOTYPE PROBE ===\n");

  // --query foo=1&bar=2  → appends ?foo=1&bar=2 to the URL.
  // Keep --bypass accepted as a harmless legacy passthrough for old notes.
  const queryParams = new URLSearchParams();
  const qIdx = process.argv.indexOf("--query");
  if (qIdx !== -1 && process.argv[qIdx + 1]) {
    const provided = new URLSearchParams(process.argv[qIdx + 1]);
    for (const [key, value] of provided.entries()) queryParams.set(key, value);
  }
  if (process.argv.includes("--bypass")) {
    queryParams.set("bypass", "1");
  }
  if (!queryParams.has("probe") && !queryParams.has("readback")) {
    queryParams.set("probe", "1");
  }
  const queryString = queryParams.toString();
  const urlPath = "title-prototype.html" + (queryString ? `?${queryString}` : "");
  console.log(`url path: ${urlPath}`);

  await startServer();

  let browser, page;
  let exitCode = 0;
  const consoleLines = [];
  const errors = [];

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    // Attach listeners BEFORE navigation so we catch all console output
    page.on("console", (msg) => {
      consoleLines.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on("pageerror", (err) => errors.push(err.message));

    const target = `http://localhost:8719/${urlPath}`;
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 10000 });

    // Wait for exposure fade + several render frames
    await new Promise((r) => setTimeout(r, 2500));

    // Screenshot
    const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 17);
    const shotPath = path.join(SCREENSHOT_DIR, `title-prototype-probe-${stamp}.png`);
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log(`screenshot → ${shotPath}`);

    const report = await page.evaluate(() => {
      const out = {
        title: document.title,
        canvas: null,
        gl: null,
        prototypeExposed: !!window.__TITLE_PROTOTYPE__,
        prototype: null,
        systems: null,
        passTunables: null,
        pixelSamples: [],
        composer: null,
        composerPassNames: null,
      };

      const canvas = document.getElementById("render-canvas");
      if (canvas) {
        out.canvas = {
          width: canvas.width,
          height: canvas.height,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight,
        };
        const gl =
          canvas.getContext("webgl2") || canvas.getContext("webgl") || null;
        if (gl) {
          out.gl = {
            version: gl.getParameter(gl.VERSION),
            renderer: gl.getParameter(gl.RENDERER),
            unmaskedRenderer: null,
          };
          const ext = gl.getExtension("WEBGL_debug_renderer_info");
          if (ext) {
            out.gl.unmaskedRenderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
          }
        }
      }

      if (window.__TITLE_PROTOTYPE__) {
        const p = window.__TITLE_PROTOTYPE__;
        try {
          const passList = p.composer?.passes ?? [];
          out.prototype = {
            totalTime: p.totalTime,
            probeMode: !!p.probeMode,
            camX: p.camX,
            camY: p.camY,
            mapId: p.map?.id ?? p.map?.name ?? "title",
          };
          out.systems = {
            wells: p.wellSystem?.wells?.length ?? null,
            planetoids: p.planetoidSystem?.planetoids?.length ?? null,
          };
          out.composer = p.composer ? {
            width: p.composer.width,
            height: p.composer.height,
            passCount: passList.length,
          } : null;
          out.composerPassNames = passList.map((pass) => pass.name || pass.constructor.name);
          out.passTunables = {
            bloom: p.passes?.bloomPass ? {
              threshold: p.passes.bloomPass.threshold,
              knee: p.passes.bloomPass.knee,
              strength: p.passes.bloomPass.strength,
              blurRadius: p.passes.bloomPass.blurRadius,
              scale: p.passes.bloomPass.scale,
              scratchA: p.passes.bloomPass.scratchA ? {
                w: p.passes.bloomPass.scratchA.w,
                h: p.passes.bloomPass.scratchA.h,
              } : null,
            } : null,
            ascii: p.passes?.asciiPass ? {
              viewMode: p.passes.asciiPass.getViewMode(),
            } : null,
          };
        } catch (e) {
          out.prototype = { error: e.message };
        }
      }

      // Sample the canvas via readPixels. The probe URL enables
      // preserveDrawingBuffer so this is a deterministic render signal.
      const canvas2 = document.getElementById("render-canvas");
      if (canvas2) {
        const gl =
          canvas2.getContext("webgl2") || canvas2.getContext("webgl") || null;
        if (gl) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.finish();
          const w = canvas2.width;
          const h = canvas2.height;
          const samples = [
            [w * 0.25, h * 0.25, "top-left"],
            [w * 0.5, h * 0.25, "top-center"],
            [w * 0.75, h * 0.25, "top-right"],
            [w * 0.5, h * 0.5, "center"],
            [w * 0.25, h * 0.75, "bot-left"],
            [w * 0.5, h * 0.75, "bot-center"],
          ];
          const buf = new Uint8Array(4);
          for (const [x, y, label] of samples) {
            const yGl = h - Math.floor(y);
            gl.readPixels(
              Math.floor(x),
              yGl,
              1,
              1,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              buf
            );
            out.pixelSamples.push({
              label,
              r: buf[0],
              g: buf[1],
              b: buf[2],
              a: buf[3],
            });
          }
        }
      }

      return out;
    });

    console.log("\n--- REPORT ---");
    console.log(JSON.stringify(report, null, 2));

    console.log("\n--- CONSOLE LOGS ---");
    if (consoleLines.length > 0) {
      for (const l of consoleLines) console.log("  " + l);
    } else {
      console.log("  (none captured)");
    }

    console.log("\n--- PAGE ERRORS ---");
    if (errors.length > 0) {
      for (const e of errors) console.log("  " + e);
    } else {
      console.log("  (none)");
    }

    // Sample puppeteer-screenshot pixel at center via Puppeteer's own
    // canvas extraction (reliable — bypasses readPixels preserveDrawingBuffer)
    const centerSample = await page.evaluate(() => {
      return new Promise((resolve) => {
        const c = document.getElementById("render-canvas");
        // Force a readback via toDataURL. The probe enables
        // preserveDrawingBuffer, and the two rAFs give the pipeline a fresh
        // frame before capture.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const dataUrl = c.toDataURL();
            // Decode dataUrl, check center pixel (tricky). Just return the
            // dataUrl length as a signal — if render is happening it'll be
            // substantial.
            resolve({
              dataUrlLength: dataUrl.length,
              prefix: dataUrl.substring(0, 80),
            });
          });
        });
      });
    });

    console.log("\n--- CANVAS toDataURL SIGNAL ---");
    console.log(JSON.stringify(centerSample, null, 2));

    const anyNonBlack = report.pixelSamples.some((s) => s.r > 2 || s.g > 2 || s.b > 2);
    const composerOk =
      report.prototypeExposed &&
      report.prototype &&
      !report.prototype.error &&
      Array.isArray(report.composerPassNames) &&
      report.composerPassNames.join(">") === "fluid-display>bloom>tonemap>color-grade>vignette>ascii>chromatic-aberration>scanlines";
    const dataUrlLooksRendered = centerSample.dataUrlLength > 10000;
    console.log(
      `\nverdict: readPixels non-black = ${anyNonBlack ? "YES" : "NO (all near-black)"}`
    );
    console.log(
      `verdict: composer chain = ${composerOk ? "YES" : "NO"}`
    );
    console.log(
      `verdict: canvas export = ${dataUrlLooksRendered ? "YES" : "NO"}`
    );
    if (errors.length > 0 || !anyNonBlack || !composerOk || !dataUrlLooksRendered) exitCode = 1;
  } catch (e) {
    console.error("probe error:", e);
    exitCode = 2;
  } finally {
    if (browser) await browser.close();
    await stopServer();
  }

  process.exit(exitCode);
}

run();

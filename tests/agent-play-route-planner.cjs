const { TestRunner, assert } = require("./helpers.cjs");
const {
  DEFAULT_WELL_MARGIN,
  planPortalApproach,
  routeHazards,
} = require("./agent-play-route.cjs");

function assertClearDetour(label, input) {
  const route = planPortalApproach({ ...input, velocity: input.player });
  assert(route.blocker, `${label}: expected the direct line to identify its well blocker`);
  assert(route.waypoint, `${label}: expected a clearance waypoint`);
  assert(routeHazards({ ...input, from: input.player, to: route.waypoint, velocity: input.player }).length === 0,
    `${label}: inbound leg crossed the dynamic clearance ring`);
  assert(routeHazards({ ...input, from: route.waypoint, to: route.target, velocity: input.player }).length === 0,
    `${label}: outbound leg crossed the dynamic clearance ring`);
  return route;
}

async function run() {
  const runner = new TestRunner("AgentPlayRoutePlanner");

  await runner.run("targets the public portal capture band rather than the center", () => {
    const player = { wx: 1, wy: 1 };
    const portal = { id: "portal-standard", type: "standard", wx: 2, wy: 1 };
    const plan = planPortalApproach({ player, portal, worldScale: 5 });
    const distance = Math.hypot(plan.target.wx - portal.wx, plan.target.wy - portal.wy);
    assert(distance > 0, "Expected a capture-band target rather than portal center");
    assert(distance < plan.captureRadius, "Capture-band target must remain inside the public capture radius");
    assert(plan.captureRadius === 0.08, "Standard portal must retain the public 0.08 capture radius");
  });

  await runner.run("detects a toroidal direct-leg kill-radius intersection with margin", () => {
    const from = { wx: 4.8, wy: 1 };
    const to = { wx: 0.2, wy: 1 };
    const wells = [{ id: "seam-well", wx: 0, wy: 1, killRadius: 0.04 }];
    const hazards = routeHazards({ from, to, wells, worldScale: 5 });
    assert(hazards.length === 1, "Expected the seam-crossing leg to see the public well");
    assert(hazards[0].clearance === 0.04 + DEFAULT_WELL_MARGIN, "Expected conservative kill-radius margin");
  });

  await runner.run("chooses a direct safe capture band or a deterministic clearance waypoint", () => {
    const player = { wx: 1, wy: 1 };
    const portal = { id: "portal-route", type: "standard", wx: 5, wy: 1 };
    const wells = [{ id: "route-well", name: "Nyx", wx: 3, wy: 1, killRadius: 0.28 }];
    const plan = planPortalApproach({ player, portal, wells, worldScale: 8 });
    if (plan.waypoint) {
      assert(plan.blocker?.wellId === "route-well", "Expected direct portal leg blocker attribution");
      assert(routeHazards({ from: player, to: plan.waypoint, wells, worldScale: 8 }).length === 0,
        "Clearance waypoint inbound leg must avoid the well margin");
      assert(routeHazards({ from: plan.waypoint, to: plan.target, wells, worldScale: 8 }).length === 0,
        "Clearance waypoint outbound leg must avoid the well margin");
    } else {
      assert(routeHazards({ from: player, to: plan.target, wells, worldScale: 8 }).length === 0,
        "A direct capture-band choice must avoid the well margin");
    }
  });

  await runner.run("keeps the Pandemonium portal leg clear under live-route drift", () => {
    const route = assertClearDetour("Pandemonium portal leg", {
      player: { wx: 4.7, wy: 2.72, vx: -0.18, vy: 0 },
      portal: { id: "portal-optional-1-1", wx: 2.72, wy: 2.72, type: "standard" },
      wells: [{ id: "well-1", name: "Pandemonium", wx: 3.7, wy: 2.72, killRadius: 0.06 }],
      worldScale: 5,
    });
    assert(route.driftMargin > 0, "Expected a velocity-derived clearance reserve");
  });

  await runner.run("keeps seam-side portal routing out of wrapped well clearance", () => {
    assertClearDetour("wrap-seam portal leg", {
      player: { wx: 0.12, wy: 2.5, vx: -0.2, vy: 0 },
      portal: { id: "portal-seam", wx: 4.62, wy: 2.5, type: "standard" },
      wells: [{ id: "well-seam", wx: 4.9, wy: 2.5, killRadius: 0.06 }],
      worldScale: 5,
    });
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((error) => {
  console.error("AgentPlayRoutePlanner fatal error:", error.stack || error.message);
  process.exit(1);
});

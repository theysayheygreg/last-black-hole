const assert = require("assert");
const fs = require("fs");
const path = require("path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

assert(!/\bshipDt\b/.test(mainSource), "main.js must not reference retired shipDt");
assert(mainSource.includes("slingshotSystem.applyEngagedForces(ship, dt, hullSlingMods)"));
assert(mainSource.includes("starSystem.applyToShip(ship, dt)"));
assert(mainSource.includes("planetoidSystem.applyToShip(ship, dt)"));

console.log("SlingshotDtStatic: 4/4 passed");

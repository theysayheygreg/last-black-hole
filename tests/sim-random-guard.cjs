const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const AUTHORITY_FILES = [
  path.join(ROOT, "scripts", "sim-runtime.cjs"),
  path.join(ROOT, "scripts", "coarse-flow-field.cjs"),
  path.join(ROOT, "scripts", "rng-stream.cjs"),
  path.join(ROOT, "scripts", "seeded-generation.cjs"),
  ...fs.readdirSync(path.join(ROOT, "scripts", "sim"))
    .filter((file) => file.endsWith(".cjs"))
    .map((file) => path.join(ROOT, "scripts", "sim", file)),
];

const offenders = [];
for (const file of AUTHORITY_FILES) {
  const source = fs.readFileSync(file, "utf8");
  if (/\bMath\s*\.\s*random\s*\(/.test(source)) offenders.push(path.relative(ROOT, file));
}

assert.deepStrictEqual(offenders, [], `bare Math.random entered sim authority: ${offenders.join(", ")}`);
console.log(`SimRandomGuard: ${AUTHORITY_FILES.length} authority files checked, 0 bare Math.random calls`);

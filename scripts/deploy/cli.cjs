function argValue(name, fallback, argv = process.argv) {
  const prefix = `${name}=`;
  const found = argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = argv.indexOf(name);
  if (index >= 0 && argv[index + 1]) return argv[index + 1];
  return fallback;
}

function hasFlag(name, argv = process.argv) {
  return argv.includes(name);
}

module.exports = { argValue, hasFlag };

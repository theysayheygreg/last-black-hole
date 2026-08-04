// Shared authority predicate for a schedule entry. A zero-count optional
// window is retained only as diagnostic history; it never becomes a route or
// an event-stream opening.
function canOpenPortalWindow(window) {
  if (window?.metadata?.finalExfil === true) return true;
  const countRange = window?.metadata?.effectiveCountRange;
  return Array.isArray(countRange) && Number(countRange[1]) > 0;
}

module.exports = { canOpenPortalWindow };

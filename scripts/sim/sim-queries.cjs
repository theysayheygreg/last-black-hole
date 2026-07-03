function positiveFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function positiveInteger(value, fallback = 1) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sourceIdForHit(hit) {
  const explicit = hit?.body?.data?.sourceId;
  if (explicit !== undefined && explicit !== null && String(explicit).trim()) {
    return String(explicit);
  }

  const rawId = String(hit?.id || "").replace(/#\d+$/, "");
  const prefixEnd = rawId.indexOf(":");
  return prefixEnd >= 0 ? rawId.slice(prefixEnd + 1) : rawId;
}

function collectRelevantBodies(mirror, origins, options = {}) {
  const radius = positiveFiniteNumber(options.radius, 0);
  const perOriginLimit = positiveInteger(options.perOriginLimit, 1);
  const category = options.category ? String(options.category) : null;
  const query = options.query || {};
  const centerDistanceOnly = options.centerDistanceOnly !== false;
  const selectedSourceIds = new Set();
  const selectedBodies = [];
  const stats = {
    mode: "ballpark",
    category,
    radius,
    perOriginLimit,
    originCount: Array.isArray(origins) ? origins.length : 0,
    queryCount: 0,
    candidateCount: 0,
    categoryRejects: 0,
    radiusRejects: 0,
    duplicateRejects: 0,
    missingSourceRejects: 0,
    selectedCount: 0,
  };

  if (!mirror || !Array.isArray(origins) || origins.length === 0) {
    return { bodies: selectedBodies, stats };
  }

  for (const origin of origins) {
    const wx = Number(origin?.wx);
    const wy = Number(origin?.wy);
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) continue;

    const hits = mirror.queryCircle({
      ...query,
      wx,
      wy,
      radius,
    });
    stats.queryCount += 1;
    stats.candidateCount += hits.length;

    // Preserve the old relevance contract: each player contributes at most the
    // nearest N candidates, and duplicate candidates are not backfilled.
    let consideredForOrigin = 0;
    for (const hit of hits) {
      if (category && hit.category !== category) {
        stats.categoryRejects += 1;
        continue;
      }
      if (centerDistanceOnly && hit.distance > radius) {
        stats.radiusRejects += 1;
        continue;
      }
      if (consideredForOrigin >= perOriginLimit) break;
      consideredForOrigin += 1;

      const sourceId = sourceIdForHit(hit);
      if (!sourceId) {
        stats.missingSourceRejects += 1;
        continue;
      }
      if (selectedSourceIds.has(sourceId)) {
        stats.duplicateRejects += 1;
        continue;
      }
      selectedSourceIds.add(sourceId);
      selectedBodies.push({ ...hit, sourceId });
    }
  }

  stats.selectedCount = selectedBodies.length;
  return { bodies: selectedBodies, stats };
}

function collectNearestBodies(mirror, origin, options = {}) {
  return collectRelevantBodies(mirror, [origin], {
    ...options,
    perOriginLimit: positiveInteger(options.limit, 1),
  });
}

module.exports = {
  collectNearestBodies,
  collectRelevantBodies,
  sourceIdForHit,
};

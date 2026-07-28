function recordJourneyStage(report, patch) {
  report.journey = { ...(report.journey || {}), ...patch };
  return report.journey;
}

module.exports = { recordJourneyStage };

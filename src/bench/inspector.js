export const NO_TUNABLE_CONTRACT = 'NO TUNABLE CONTRACT YET';

function publicIdentity(identity) {
  return Object.freeze({ family: identity.family, type: identity.type });
}

export async function createBenchInspectorViewModel(registry, identity) {
  const adapter = registry.resolve(identity);
  if (!adapter) {
    return Object.freeze({
      supported: false,
      status: NO_TUNABLE_CONTRACT,
      identity: publicIdentity(identity),
      adapterId: null,
      title: identity.type,
      rows: Object.freeze([]),
    });
  }

  const rows = [];
  for (const contract of adapter.contracts) {
    rows.push(Object.freeze({
      ...contract,
      value: await adapter.read({ identity: adapter.identity, propertyId: contract.id }),
    }));
  }
  return Object.freeze({
    supported: true,
    status: 'TUNABLE CONTRACT',
    identity: adapter.identity,
    adapterId: adapter.id,
    title: adapter.label,
    rows: Object.freeze(rows),
  });
}

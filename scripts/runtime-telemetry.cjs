function createRuntimeLogger(component, baseFields = {}) {
  const shared = { component, ...baseFields };

  function emit(level, event, fields = {}) {
    const payload = {
      ts: new Date().toISOString(),
      level,
      event,
      pid: process.pid,
      ...shared,
      ...fields,
    };
    const line = JSON.stringify(payload);
    if (level === 'error') {
      console.error(line);
      return;
    }
    if (level === 'warn') {
      console.warn(line);
      return;
    }
    console.log(line);
  }

  return {
    info(event, fields) {
      emit('info', event, fields);
    },
    warn(event, fields) {
      emit('warn', event, fields);
    },
    error(event, fields) {
      emit('error', event, fields);
    },
    child(extraFields = {}) {
      return createRuntimeLogger(component, { ...shared, ...extraFields });
    },
  };
}

module.exports = { createRuntimeLogger };

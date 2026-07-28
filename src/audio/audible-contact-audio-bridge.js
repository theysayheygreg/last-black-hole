const CATEGORY_PRIORITY = Object.freeze({
  EXFIL: 3,
  'EXFIL TONE': 3,
  VESSEL: 2,
  'VESSEL THRUST': 2,
  SWARM: 2,
  GLITCH: 1,
});

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function contactClass(contact = {}) {
  return String(contact.identity || contact.category || '').toUpperCase();
}

function compareContacts(a, b) {
  return (CATEGORY_PRIORITY[contactClass(b)] || 0) - (CATEGORY_PRIORITY[contactClass(a)] || 0)
    || finite(a.rangeMeters, Infinity) - finite(b.rangeMeters, Infinity)
    || String(a.id || '').localeCompare(String(b.id || ''));
}

function voiceFromContact(contact) {
  return Object.freeze({
    id: String(contact.id),
    category: contactClass(contact),
    bearingRadians: finite(contact.bearingRadians),
    rangeMeters: Math.max(0, finite(contact.rangeMeters)),
    emittedRadiusMeters: Math.max(0, finite(contact.emittedRadiusMeters)),
    live: contact.live !== false,
  });
}

/**
 * Presentation-only lifecycle bridge for authority-owned audible contacts.
 * It ranks already-published contacts, preserves their canonical spatial values,
 * and reports held-voice transitions. It never evaluates radius, perception,
 * discovery, or gameplay outcomes.
 */
export class AudibleContactAudioBridge {
  constructor({ maxVoices = 3 } = {}) {
    this.maxVoices = Math.max(0, Math.floor(finite(maxVoices, 3)));
    this.voices = new Map();
  }

  update(contacts = [], { nowSeconds = 0 } = {}) {
    const admitted = (Array.isArray(contacts) ? contacts : [])
      .filter((contact) => contact && contact.live !== false && contact.id != null)
      .sort(compareContacts)
      .slice(0, this.maxVoices)
      .map(voiceFromContact);
    const next = new Map(admitted.map((voice) => [voice.id, voice]));
    const entered = [];
    const updated = [];
    const expired = [];

    for (const [id, voice] of next) {
      if (this.voices.has(id)) updated.push(voice);
      else entered.push(voice);
    }
    for (const [id, voice] of this.voices) {
      if (!next.has(id)) expired.push({ ...voice, reason: 'contact-expired', nowSeconds: finite(nowSeconds) });
    }
    this.voices = next;
    return { active: admitted, entered, updated, expired, terminal: false };
  }

  terminal(reason = 'terminal', { nowSeconds = 0 } = {}) {
    const expired = [...this.voices.values()].map((voice) => ({
      ...voice,
      reason: String(reason || 'terminal'),
      nowSeconds: finite(nowSeconds),
    }));
    this.voices.clear();
    return { active: [], entered: [], updated: [], expired, terminal: true };
  }

  reset() { return this.terminal('reset'); }
}

export const AUDIBLE_CONTACT_AUDIO_PRIORITY = CATEGORY_PRIORITY;

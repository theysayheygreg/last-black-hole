#!/usr/bin/env node
/* Regenerates the hand-authored Mosaic contact-icon review package. */
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, '..', 'docs/project/reviews/assets/2026-08-04-mosaic-map-contact-icons');
const attrs = 'fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="square" stroke-linejoin="miter"';
const glyphs = {
  'well-spiral': `<path d="M8 2a6 6 0 1 0 5.4 8.6"/><path d="M10.8 10.8A4 4 0 1 1 10 4.6"/><path d="M8 6a2 2 0 1 0 1.8 2.8"/>`,
  'derelict-diamond': `<path d="M8 2 14 8 8 14 2 8Z"/><path d="M5 8h6M8 5v6"/>`,
  'stellar-star': `<path d="M8 1v14M1 8h14"/><path d="M5.5 5.5 10.5 10.5M10.5 5.5 5.5 10.5"/>`,
  'scavenger-skull': `<path d="M4 7a4 4 0 0 1 8 0v3l-1.5 1.5H5.5L4 10Z"/><path d="M6 8h1M9 8h1"/><path d="M7 11h2"/>`,
  'anomaly-burst': `<path d="M8 1v3M8 12v3M1 8h3M12 8h3"/><path d="M3 3l2 2m6 6 2 2m0-10-2 2m-6 6-2 2"/><circle cx="8" cy="8" r="2"/>`,
  'aperture-ring': `<circle cx="8" cy="8" r="5"/><circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2"/>`
};
for (const [name, body] of Object.entries(glyphs)) fs.writeFileSync(path.join(out, `${name}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" ${attrs}>${body}</svg>\n`);
const rows = [
  ['well', 'well-spiral', '#00E2FF', 'gravity / route'],
  ['derelict', 'derelict-diamond', '#FFB938', 'salvage / value'],
  ['stellar', 'stellar-star', '#FFB938', 'bright body / value'],
  ['scavenger', 'scavenger-skull', '#FF3336', 'lethal contact'],
  ['anomaly', 'anomaly-burst', '#B84CFF', 'data-core anomaly'],
  ['exit', 'aperture-ring', '#00E2FF', 'aperture / route']
];
const defs = Object.entries(glyphs).map(([id, body]) => `<g id="${id}" ${attrs}>${body}</g>`).join('');
const rowSvg = rows.map(([label,id,color,role], i) => { const y=152+i*78; return `<g transform="translate(76 ${y})"><rect x=".5" y=".5" width="43" height="43" fill="#000008" fill-opacity=".68" stroke="#00E2FF" stroke-opacity=".32"/><g transform="translate(14 14)" color="${color}"><use href="#${id}"/></g><text x="60" y="17" class="family">${label}</text><text x="60" y="34" class="meta">${id.replace('-', ' ')} · ${role} · 16px glyph / 44px cell</text><path d="M390 22H676" class="hair"/></g>` }).join('');
const specimen = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><title>Last Singularity map-select contact-family glyph specimen — revised</title><desc>Six hand-authored, pixel-snapped 16px contact glyphs for review and future binding.</desc><defs>${defs}<style>.heading{font-family:monospace;font-size:28px;font-weight:700;fill:#EAF7FF}.section,.meta{font-family:monospace;font-size:10px;fill:#9AB4CE;fill-opacity:.72}.family{font-family:monospace;font-size:15px;fill:#EAF7FF}.note{font-family:monospace;font-size:12px;fill:#EAF7FF}.hair{stroke:#00E2FF;stroke-opacity:.18;stroke-width:1}</style></defs><rect width="1280" height="720" fill="#000021"/><path d="M0 40.5H1280M0 44.5H1280M0 48.5H1280M0 52.5H1280" stroke="#FFF4DA" stroke-opacity=".025"/><rect x="64.5" y="42.5" width="720" height="635" fill="#00020A" fill-opacity=".78" stroke="#00E2FF" stroke-opacity=".32"/><path d="M61 57V39H79M770 39h18v18M61 663v18h18M770 681h18v-18" fill="none" stroke="#00E2FF" stroke-opacity=".75"/><text x="86" y="88" class="section">-- map-select contact family glyphs · revised --</text><text x="86" y="128" class="heading">CONTACT INDEX</text>${rowSvg}<rect x="824.5" y="42.5" width="392" height="635" fill="#000008" fill-opacity=".56" stroke="#00E2FF" stroke-opacity=".32"/><text x="847" y="88" class="section">-- construction receipt --</text><text x="847" y="128" class="heading">MONO GRID</text><g transform="translate(847 166)" stroke="#00E2FF" stroke-opacity=".22">${Array.from({length:17},(_,i)=>`<path d="M${i*10} 0V160M0 ${i*10}H160"/>`).join('')}</g><g transform="translate(919 238) scale(9)" color="#00E2FF"><use href="#well-spiral"/></g><text x="847" y="356" class="note">16 × 16 viewBox · 1px stroke</text><text x="847" y="380" class="note">integer coordinates; no crispEdges</text><text x="847" y="404" class="note">curves retain anti-aliasing</text><path d="M847 438.5H1194" class="hair"/><text x="847" y="470" class="section">-- path to reality --</text><text x="847" y="500" class="note">map-scales.data.json: 4 → 6 rows</text><text x="847" y="524" class="note">binding owner: Forge after ratification</text><text x="847" y="548" class="note">arrival: map rows resolve each family</text><text x="847" y="604" class="meta">UI guide §5 iconography · revised 2026-08-07</text><text x="847" y="620" class="meta">awaiting Greg review/tuning</text></svg>\n`;
fs.writeFileSync(path.join(out, 'map-contact-family-specimen.svg'), specimen);
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="16" viewBox="0 0 96 16"><title>Map contact family glyphs at true 16px</title><defs>${defs}</defs>${rows.map(([, id, color], i) => `<g transform="translate(${i * 16} 0)" color="${color}"><use href="#${id}"/></g>`).join('')}</svg>\n`;
fs.writeFileSync(path.join(out, 'map-contact-family-16px-sheet.svg'), sheet);

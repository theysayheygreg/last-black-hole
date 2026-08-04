import { UI_DECK_GEOMETRY } from './design-tokens.js';
import { measureActionFooter } from './action-footer-layout.js';

export function rect(x = 0, y = 0, w = 0, h = 0) {
  return { x: Number(x) || 0, y: Number(y) || 0, w: Number(w) || 0, h: Number(h) || 0 };
}

export function rectContains(container, child, padding = 0) {
  const pad = Math.max(0, Number(padding) || 0);
  return child.x >= container.x + pad
    && child.y >= container.y + pad
    && child.x + child.w <= container.x + container.w - pad
    && child.y + child.h <= container.y + container.h - pad;
}

export function rectsOverlap(a, b, separation = 0) {
  const gap = Math.max(0, Number(separation) || 0);
  return a.x < b.x + b.w + gap
    && a.x + a.w + gap > b.x
    && a.y < b.y + b.h + gap
    && a.y + a.h + gap > b.y;
}

export function sizeCompound({
  textWidth = 0,
  detailWidth = 0,
  artWidth = 0,
  valueWidth = 0,
  textHeight = 0,
  detailHeight = 0,
  artHeight = 0,
  valueHeight = 0,
  minWidth = 0,
  minHeight = 0,
  paddingX = UI_DECK_GEOMETRY.listRow.paddingX,
  paddingY = UI_DECK_GEOMETRY.listRow.paddingY,
  gap = UI_DECK_GEOMETRY.listRow.gap,
} = {}) {
  const widths = [textWidth, detailWidth, artWidth, valueWidth].map((value) => Math.max(0, Number(value) || 0));
  const occupied = widths.filter((value) => value > 0);
  const contentWidth = occupied.reduce((sum, value) => sum + value, 0)
    + Math.max(0, occupied.length - 1) * gap;
  const contentHeight = Math.max(textHeight, detailHeight, artHeight, valueHeight, 0);
  return {
    w: Math.max(minWidth, contentWidth + paddingX * 2),
    h: Math.max(minHeight, contentHeight + paddingY * 2),
    contentWidth,
    contentHeight,
  };
}

export function itemCompoundLayout({
  x = 0,
  y = 0,
  textWidth = 0,
  textHeight = 18,
  detailHeight = 0,
} = {}) {
  const iconSize = Math.max(UI_DECK_GEOMETRY.iconCell.minWidth, UI_DECK_GEOMETRY.iconCell.minHeight);
  const row = sizeCompound({
    textWidth,
    artWidth: iconSize,
    textHeight,
    detailHeight,
    artHeight: iconSize,
    minHeight: UI_DECK_GEOMETRY.listRow.minHeight,
    paddingY: UI_DECK_GEOMETRY.listRow.paddingY,
  });
  const rowRect = rect(x, y, row.w, row.h);
  const icon = rect(rowRect.x, rowRect.y + (rowRect.h - iconSize) / 2, iconSize, iconSize);
  return {
    row: rowRect,
    icon,
    text: {
      x: icon.x + icon.w + UI_DECK_GEOMETRY.listRow.gap,
      y: rowRect.y + rowRect.h / 2 + Number(textHeight || 18) / 2 - 1,
    },
    advance: rowRect.h + UI_DECK_GEOMETRY.separation,
  };
}

export function glyphBounds(container, size = UI_DECK_GEOMETRY.actionGlyph.minHeight) {
  const source = rect(container?.x, container?.y, container?.w, container?.h);
  const glyphSize = Math.max(UI_DECK_GEOMETRY.actionGlyph.minWidth, UI_DECK_GEOMETRY.actionGlyph.minHeight, Number(size) || 0);
  return rect(
    source.x,
    source.y + Math.max(0, (source.h - glyphSize) / 2),
    glyphSize,
    glyphSize,
  );
}

function measuredPanelFooter(panel, actions, gap = 10) {
  const x = panel.x + UI_DECK_GEOMETRY.panel.paddingX;
  const w = panel.w - UI_DECK_GEOMETRY.panel.paddingX * 2;
  const contentWidth = Math.max(1, w - UI_DECK_GEOMETRY.actionGlyph.paddingX * 2);
  const measured = measureActionFooter(actions, { gap, maxWidth: contentWidth });
  const h = measured.height;
  const y = panel.y + panel.h - UI_DECK_GEOMETRY.panel.paddingX - h;
  return {
    ...rect(x, y, w, h),
    drawX: x + UI_DECK_GEOMETRY.actionGlyph.paddingX,
    drawY: y + 6,
    contentWidth,
    rowCount: measured.rowCount,
  };
}

export function deckPanelLayout(width, height, kind = 'home', viewportWidth = width, {
  leftFooterActions = [],
  rightFooterActions = [],
  footerGap = 10,
} = {}) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const compact = viewportWidth < 984;
  const marginX = compact
    ? Math.max(UI_DECK_GEOMETRY.panel.paddingX, w * 0.025)
    : Math.max(UI_DECK_GEOMETRY.viewport.edgeX, Math.min(72, w * 0.05));
  const top = Math.max(kind === 'home' ? UI_DECK_GEOMETRY.viewport.edgeY : 46, h * (kind === 'home' ? 0.055 : 0.06));
  const bottom = h - Math.max(kind === 'home' ? UI_DECK_GEOMETRY.viewport.edgeY : 46, h * (kind === 'home' ? 0.05 : 0.055));
  const gap = compact ? UI_DECK_GEOMETRY.separation + 4 : UI_DECK_GEOMETRY.viewport.gap;
  const leftW = kind === 'home'
    ? (compact ? Math.max(196, w * 0.18) : Math.min(220, Math.max(190, w * 0.17)))
    : (compact ? Math.max(232, w * 0.22) : Math.min(300, Math.max(248, w * 0.23)));
  const rightW = kind === 'home'
    ? (compact ? Math.max(252, w * 0.24) : Math.min(324, Math.max(284, w * 0.245)))
    : (compact ? Math.max(258, w * 0.25) : Math.min(336, Math.max(292, w * 0.25)));
  const centerW = Math.max(320, w - marginX * 2 - leftW - rightW - gap * 2);
  const panelH = Math.max(1, bottom - top);
  const left = rect(marginX, top, leftW, panelH);
  const center = rect(left.x + left.w + gap, top, centerW, panelH);
  const right = rect(center.x + center.w + gap, top, rightW, panelH);
  return {
    compact, width: w, viewportWidth, marginX, top, bottom, gap, leftW, rightW, centerW, panelH,
    left, center, right,
    leftFooter: measuredPanelFooter(left, leftFooterActions, footerGap),
    rightFooter: measuredPanelFooter(right, rightFooterActions, footerGap),
  };
}

export function mapSelectSurfaceLayout(width, height, viewportWidth = width, entryCount = 6, footerActions = []) {
  const panels = deckPanelLayout(width, height, 'map', viewportWidth, { leftFooterActions: footerActions });
  const pad = UI_DECK_GEOMETRY.panel.paddingX;
  const count = Math.max(1, Math.floor(Number(entryCount) || 1));
  const footer = panels.leftFooter;
  const rowStartY = panels.left.y + 52;
  // Rows yield space to a two-line footer before they are allowed to grow.
  // Six locked/available destinations still retain their Deck minimum height.
  const rowBudget = (footer.y - rowStartY - UI_DECK_GEOMETRY.separation * count) / count;
  const rowH = Math.max(UI_DECK_GEOMETRY.listRow.minHeight, Math.min(72, rowBudget));
  const rows = Array.from({ length: count }, (_, index) => rect(
    panels.left.x + pad,
    rowStartY + index * (rowH + UI_DECK_GEOMETRY.separation),
    panels.left.w - pad * 2,
    rowH,
  ));
  // The command glyph is deliberately a separate support cue, so reserve its
  // full rail inside the terminal rather than making lower content compete
  // with it. The same accounting is used by result screens.
  const command = rect(
    panels.right.x + pad,
    panels.right.y + panels.right.h - UI_DECK_GEOMETRY.panel.paddingX
      - UI_DECK_GEOMETRY.button.minHeight - UI_DECK_GEOMETRY.button.gap - UI_DECK_GEOMETRY.actionGlyph.minHeight,
    panels.right.w - pad * 2,
    UI_DECK_GEOMETRY.button.minHeight,
  );
  const compactBrief = panels.right.h < 620;
  const statusHeight = UI_DECK_GEOMETRY.valueBlock.minHeight;
  const statusTop = panels.right.y + (compactBrief ? 58 : 86);
  const statusGap = UI_DECK_GEOMETRY.panel.gap;
  const statusWidth = Math.max(1, (panels.right.w - pad * 2 - statusGap) / 2);
  const authorityY = command.y - (compactBrief ? 94 : 96);
  const descriptionLineY = panels.right.y + (compactBrief ? 145 : 188);
  const descriptionLineHeight = compactBrief ? 12 : 13;
  const descriptionLines = 2;
  const contentsY = panels.right.y + (compactBrief ? 174 : 222);
  const contactY = panels.right.y + (compactBrief ? 194 : 252);
  const contactRowStep = compactBrief ? 20 : 39;
  const briefing = {
    compact: compactBrief,
    titleY: panels.right.y + (compactBrief ? 40 : 58),
    titleBounds: rect(panels.right.x + pad, panels.right.y + (compactBrief ? 18 : 30), panels.right.w - pad * 2, compactBrief ? 28 : 32),
    statusTop,
    statusHeight,
    signatureY: panels.right.y + (compactBrief ? 125 : 163),
    descriptionLineY,
    descriptionLineHeight,
    descriptionLines,
    contentsY,
    contactY,
    contactRowStep,
    contactDescription: !compactBrief,
    authorityY,
    confidenceLabelY: command.y - 56,
    confidenceValueY: command.y - 22,
    commandPrompt: rect(command.x, command.y + command.h + UI_DECK_GEOMETRY.button.gap, command.w, UI_DECK_GEOMETRY.actionGlyph.minHeight),
  };
  return {
    ...panels,
    pad,
    rows,
    // Three map actions wrap at Deck width. Keep their backing, glyphs, and
    // second line within the terminal rather than treating the footer as a
    // single 32px rail.
    footer,
    command,
    // drawStatusPill is center anchored. These are centers, not top-left
    // rectangles; keeping that contract explicit prevents the pills from
    // crossing into the title and signature rows.
    briefStatus: {
      scale: rect(panels.right.x + pad + statusWidth / 2, statusTop + statusHeight / 2, statusWidth, statusHeight),
      risk: rect(panels.right.x + pad + statusWidth + statusGap + statusWidth / 2, statusTop + statusHeight / 2, statusWidth, statusHeight),
    },
    briefing,
  };
}

export function profileSurfaceLayout(width, height, footerActions = []) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const panelW = Math.min(560, Math.max(500, w * 0.42));
  const panelH = Math.min(410, Math.max(382, h - 180));
  const panel = rect((w - panelW) / 2, Math.max(72, (h - panelH) * 0.44), panelW, panelH);
  const innerX = panel.x + UI_DECK_GEOMETRY.panel.paddingX;
  const rowW = panel.w - UI_DECK_GEOMETRY.panel.paddingX * 2;
  const footer = measuredPanelFooter(panel, footerActions, UI_DECK_GEOMETRY.panel.gap);
  // The former 48px title offset left unused air above the pilot rows. A
  // compact heading block recovers that space for wrapped action rails while
  // preserving the 58px minimum row and a full 16px heading-to-row gutter.
  const rowStartY = panel.y + 80;
  const rowGap = UI_DECK_GEOMETRY.panel.gap;
  const rowBudget = (footer.y - UI_DECK_GEOMETRY.separation - rowStartY - rowGap * 2) / 3;
  const rowH = Math.max(UI_DECK_GEOMETRY.listRow.minHeight, Math.min(74, rowBudget));
  const rows = Array.from({ length: 3 }, (_, index) => rect(
    innerX,
    rowStartY + index * (rowH + rowGap),
    rowW,
    rowH,
  ));
  return {
    panel,
    rows,
    heading: rect(innerX, panel.y + 24, rowW, UI_DECK_GEOMETRY.heading.minHeight),
    footer,
    nameOverlay: rect(panel.x + (panel.w - 440) / 2, footer.y - UI_DECK_GEOMETRY.separation - 76, 440, 76),
    deleteOverlay: rect(panel.x + (panel.w - 400) / 2, footer.y - UI_DECK_GEOMETRY.separation - 68, 400, 68),
  };
}

export function titleSurfaceLayout(width, height, layout = 'left') {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const sideAligned = layout !== 'center';
  const gutterX = Math.max(UI_DECK_GEOMETRY.viewport.edgeX, Math.min(120, Math.round(w * 0.075)));
  const gutterY = Math.max(UI_DECK_GEOMETRY.viewport.edgeY + 12, Math.min(96, Math.round(h * 0.085)));
  const panelW = sideAligned ? Math.min(560, Math.max(500, Math.round(w * 0.43))) : Math.min(900, Math.round(w * 0.74));
  const panelH = sideAligned ? 332 : 300;
  const panelX = layout === 'right' ? w - gutterX - panelW : layout === 'center' ? (w - panelW) / 2 : gutterX;
  const panelY = sideAligned ? gutterY + 70 : h / 2 - 154;
  const textInset = sideAligned ? 40 : 0;
  const align = layout === 'right' ? 'right' : layout === 'center' ? 'center' : 'left';
  const textX = align === 'right' ? panelX + panelW - textInset : align === 'left' ? panelX + textInset : w / 2;
  const textWidth = panelW - (sideAligned ? textInset * 2 : 96);
  const titleY = panelY + (sideAligned ? 88 : 86);
  const statusW = Math.min(430, textWidth);
  const commandW = Math.min(352, textWidth);
  const commandX = align === 'right' ? textX - commandW : align === 'left' ? textX : textX - commandW / 2;
  const versionW = 232;
  const versionX = align === 'right' ? textX - versionW : align === 'left' ? textX : textX - versionW / 2;
  return {
    layout, align, gutterX, gutterY, panelX, panelY, panelW, panelH, textX, textWidth, titleY,
    titleFontSize: sideAligned ? 50 : 58,
    statusW,
    commandRect: rect(commandX, titleY + 130, commandW, UI_DECK_GEOMETRY.button.minHeight),
    footerRect: rect(commandX, titleY + 130 + UI_DECK_GEOMETRY.button.minHeight + UI_DECK_GEOMETRY.button.gap, commandW, UI_DECK_GEOMETRY.actionGlyph.minHeight),
    versionRect: rect(versionX, h - gutterY - 24, versionW, 24),
  };
}

export function resultsSurfaceLayout(width, height) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const panelW = Math.min(880, Math.max(760, w - 48));
  const panelH = Math.min(600, Math.max(540, h - 36));
  const panel = rect((w - panelW) / 2, (h - panelH) / 2, panelW, panelH);
  const pad = UI_DECK_GEOMETRY.panel.paddingX + 6;
  const columnGap = UI_DECK_GEOMETRY.panel.gap + 10;
  const columnW = (panel.w - pad * 2 - columnGap) / 2;
  const leftX = panel.x + pad;
  const rightX = leftX + columnW + columnGap;
  const buttonW = Math.max(UI_DECK_GEOMETRY.button.minWidth, Math.min(320, panel.w - pad * 2));
  const buttonY = panel.y + panel.h - pad
    - UI_DECK_GEOMETRY.actionGlyph.minHeight - UI_DECK_GEOMETRY.button.gap - UI_DECK_GEOMETRY.button.minHeight;
  const button = rect((w - buttonW) / 2, buttonY, buttonW, UI_DECK_GEOMETRY.button.minHeight);
  return {
    panel,
    pad,
    columnGap,
    columnW,
    leftX,
    rightX,
    button,
    buttonPrompt: rect(button.x, button.y + button.h + UI_DECK_GEOMETRY.button.gap, button.w, UI_DECK_GEOMETRY.actionGlyph.minHeight),
    cargoRowH: UI_DECK_GEOMETRY.listRow.minHeight - 14,
    cargoGap: UI_DECK_GEOMETRY.separation,
    // Terminal rows may occupy this area; the CTA owns the rest of the panel.
    contentBottom: button.y - UI_DECK_GEOMETRY.panel.gap,
  };
}

export function hudSurfaceLayout(width, height) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const edge = 24;
  const gap = UI_DECK_GEOMETRY.viewport.gap;
  const compact = h < 650;
  const collapse = rect(edge, edge, 280, compact ? 64 : 76);
  const vitals = rect(edge, collapse.y + collapse.h + gap, 286, compact ? 140 : 188);
  const ecology = rect(edge, vitals.y + vitals.h + gap, 286, compact ? 60 : 70);
  const salvage = rect(edge, h - edge - (compact ? 64 : 70), 286, compact ? 64 : 70);
  const warnings = rect(edge, ecology.y + ecology.h + gap, 320,
    Math.max(0, salvage.y - gap - (ecology.y + ecology.h + gap)));
  const portals = rect(w - edge - 320, edge, 320, 90);
  const actions = rect(w - edge - 360, h - edge - (compact ? 220 : 260), 360, compact ? 220 : 260);
  const interaction = rect(
    Math.max(warnings.x + warnings.w + gap, Math.min((w - 380) / 2, actions.x - gap - 380)),
    actions.y - gap - 70,
    380,
    70,
  );
  const inventory = rect(warnings.x + warnings.w + gap, portals.y + portals.h + gap, 420,
    Math.max(320, h - (portals.y + portals.h + gap) - edge));
  const signature = rect(Math.max(edge, (w - 320) / 2), edge, 320, 24);
  return {
    edge, gap, collapse, vitals, ecology, salvage, warnings,
    portals, actions, interaction, inventory, signature,
  };
}

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  color,
  deckSurface,
  errorTile,
  fitText,
  gallery,
  holdTile,
  measureText,
  layouts,
  offlineValueTile,
  renderTile as renderWith,
  temperatureColor,
  tileImage,
  usageColor,
  usageLevel,
  usageTile,
} from '../src/render/index.ts';
import type { RenderOptions, TileSpec } from '../src/render/index.ts';

// Fidelity tests use the original design layout and Surface.
// The production default (deck layout on black) is covered in "layouts" below.
const DESIGN: RenderOptions = { layout: layouts.design, surface: color.surface };
const renderTile = (spec: TileSpec, options: RenderOptions = DESIGN): string => renderWith(spec, options);

/** Minimal well-formedness check: every opened tag is closed in order. */
function assertWellFormed(svg: string): void {
  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = m;
    if (!name) continue;
    if (selfClosing) continue;
    if (closing) assert.equal(stack.pop(), name, `unbalanced </${name}>`);
    else stack.push(name);
  }
  assert.deepEqual(stack, [], 'unclosed tags');
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;)/.test(svg), 'unescaped ampersand');
}

function texts(svg: string): string[] {
  return [...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((m) => (m[1] ?? '').replace(/<[^>]+>/g, ''));
}

describe('renderTile – structure', () => {
  const all = gallery.flatMap((s) => s.items);

  it('renders every gallery state as a well-formed 72x72 SVG at 144 px', () => {
    assert.ok(all.length >= 40);
    for (const item of all) {
      const svg = renderTile(item.spec);
      assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, item.id);
      assert.match(svg, /width="144" height="144" viewBox="0 0 72 72"/, item.id);
      assertWellFormed(svg);
    }
  });

  it('has unique gallery ids', () => {
    const ids = all.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('is deterministic', () => {
    for (const item of all) assert.equal(renderTile(item.spec), renderTile(item.spec));
  });

  it('centres all text on x=36', () => {
    for (const item of all) {
      for (const m of renderTile(item.spec).matchAll(/<text([^>]*)>/g)) {
        assert.match(m[1] ?? '', /x="36"[^>]*text-anchor="middle"|x="36".*text-anchor="middle"/, item.id);
      }
    }
  });

  it('every gallery state is well-formed with the default deck layout too', () => {
    for (const item of all) assertWellFormed(renderWith(item.spec));
  });

  it('gallery copy fits the deck layout without truncation', () => {
    for (const item of all) {
      // "hold…" is an intended ellipsis in the copy itself
      const cut = texts(renderWith(item.spec)).filter((t) => t.endsWith('…') && t !== 'hold…');
      assert.deepEqual(cut, [], item.id);
    }
  });

  it('produces a base64 SVG data URI', () => {
    const uri = tileImage({ template: 'icon', glyph: 'mic', name: 'Mic' });
    assert.match(uri, /^data:image\/svg\+xml;base64,/);
    const decoded = Buffer.from(uri.split(',')[1] ?? '', 'base64').toString('utf8');
    assert.ok(decoded.includes('Mic'));
  });
});

describe('Icon template', () => {
  it('neutral: Surface background, 7 % white outline, Raised badge, #B7BCCB glyph', () => {
    const svg = renderTile({ template: 'icon', glyph: 'mic', name: 'Mic', status: 'On', statusTone: 'ok' });
    assert.ok(svg.includes(`fill="${color.surface}"`));
    assert.ok(svg.includes('stroke="#fff" stroke-opacity="0.07"'));
    assert.ok(svg.includes(`<circle cx="36" cy="22" r="12" fill="${color.raised}"/>`));
    assert.ok(svg.includes(`stroke="${color.icon}" stroke-width="1.8"`));
    assert.deepEqual(texts(svg), ['Mic', 'On']);
    assert.ok(svg.includes(`y="51"`) && svg.includes(`y="62"`));
    assert.ok(svg.includes(`fill="${color.mint}">On`));
  });

  it('alert (muted): #331E24 background, alert outline .4, alert glyph, #FFC2C2 status', () => {
    const svg = renderTile({ template: 'icon', tone: 'alert', glyph: 'micOff', name: 'Mic', status: 'Muted' });
    assert.ok(svg.includes(`fill="${color.alertBg}"`));
    assert.ok(svg.includes(`stroke="${color.alert}" stroke-opacity="0.4"`));
    assert.ok(svg.includes(`stroke="${color.alert}" stroke-width="1.8"`));
    assert.ok(svg.includes('M-8 -8L8 8'), 'slash through the mic');
    assert.ok(svg.includes(`fill="${color.alertText}">Muted`));
  });

  it('on (Ember): gradient background, highlight line, dark ink text with .75 status', () => {
    const svg = renderTile({ template: 'icon', tone: 'on', glyph: 'pttActive', name: 'PTT', status: 'Talking' });
    assert.ok(svg.includes('<linearGradient id="em"'));
    assert.ok(svg.includes('fill="url(#em)"'));
    assert.ok(svg.includes('<path d="M12 .8H60"'));
    assert.ok(svg.includes(`fill="${color.emberInk}">PTT`));
    assert.ok(svg.includes(`fill="${color.emberInk}" fill-opacity="0.75">Talking`));
    assert.ok(!svg.includes('stroke-opacity="0.07"'), 'no outline on ember');
  });

  it('nav (Iris): tinted badge and #B7AEFF glyph', () => {
    const svg = renderTile({ template: 'icon', tone: 'nav', glyph: 'gamepad', name: 'Games', status: 'Page ›' });
    assert.ok(svg.includes(`fill="${color.iris}" fill-opacity="0.18"`));
    assert.ok(svg.includes(`stroke="${color.irisIcon}"`));
  });

  it('success: mint outline, badge and status', () => {
    const svg = renderTile({ template: 'icon', tone: 'success', glyph: 'check', name: 'Screenshot', status: 'Saved' });
    assert.ok(svg.includes(`stroke="${color.mint}" stroke-opacity="0.4"`));
    assert.ok(svg.includes(`fill="${color.mint}">Saved`));
  });

  it('dashed outline for proposals and offline', () => {
    assert.ok(renderTile({ template: 'icon', glyph: 'power', name: 'X', dashed: true }).includes('stroke-dasharray="3 3"'));
    assert.ok(renderTile({ template: 'icon', tone: 'offline', glyph: 'mic', name: 'X' }).includes('stroke-dasharray="3 3"'));
    assert.ok(!renderTile({ template: 'icon', glyph: 'mic', name: 'X' }).includes('stroke-dasharray'));
  });

  it('power glyph keeps the design transform and 2.4 stroke', () => {
    const svg = renderTile({ template: 'icon', glyph: 'power', name: 'Power' });
    assert.ok(svg.includes('transform="translate(36 22) scale(.75) translate(-12 -12)"'));
    assert.ok(svg.includes('stroke-width="2.4"'));
  });

  it('avatar: initial on Iris gradient, presence dot', () => {
    const home = renderTile({ template: 'icon', avatar: { initial: 'A', presence: 'home' }, name: 'Alex' });
    assert.ok(home.includes('fill="url(#av)"'));
    assert.ok(texts(home).includes('A'));
    assert.ok(home.includes(`<circle cx="44.5" cy="30.5" r="3.6" fill="${color.mint}"`));
    const away = renderTile({ template: 'icon', avatar: { initial: 'A', presence: 'away' }, name: 'Alex' });
    assert.ok(away.includes(`r="3.6" fill="${color.label}"`));
    const pic = renderTile({ template: 'icon', avatar: { initial: 'A', image: 'data:image/png;base64,AAAA' }, name: 'Alex' });
    assert.ok(pic.includes('xlink:href="data:image/png;base64,AAAA"'));
    assert.ok(pic.includes('clip-path="url(#ac)"'));
  });
});

describe('Value template and usage thresholds', () => {
  it('usageLevel: Mint <70, Ember 70–90, Alert >90', () => {
    assert.equal(usageLevel(0), 'ok');
    assert.equal(usageLevel(69.9), 'ok');
    assert.equal(usageLevel(70), 'warn');
    assert.equal(usageLevel(90), 'warn');
    assert.equal(usageLevel(90.1), 'alert');
    assert.equal(usageColor(34), color.mint);
    assert.equal(usageColor(78), color.ember);
    assert.equal(usageColor(94), color.alert);
  });

  it('bar widths match the design (34 % -> 19, 78 % -> 44, 94 % -> 53 of 56 px)', () => {
    const width = (p: number): string | undefined =>
      [...renderTile(usageTile({ percent: p, name: 'S' })).matchAll(/<rect x="8" y="36" width="(\d+)"/g)].map((m) => m[1])[1];
    assert.equal(width(34), '19');
    assert.equal(width(78), '44');
    assert.equal(width(94), '53');
  });

  it('tiny values keep a round bar end, zero draws only the track', () => {
    assert.ok(renderTile(usageTile({ percent: 1, name: 'S' })).includes(`width="4" height="4" rx="2" fill="${color.mint}"`));
    const zero = renderTile(usageTile({ percent: 0, name: 'S' }));
    assert.equal(zero.match(/y="36"/g)?.length, 1);
  });

  it('clamps out-of-range and non-finite input', () => {
    assert.ok(renderTile(usageTile({ percent: 140, name: 'S' })).includes('>100%<'));
    assert.ok(renderTile(usageTile({ percent: -5, name: 'S' })).includes('>0%<'));
    const nan = renderTile({ template: 'value', value: '?', name: 'X', bar: { fraction: Number.NaN, color: '#fff' } });
    assertWellFormed(nan);
  });

  it('78 %: Ember bar and status; 94 %: whole tile Alert', () => {
    const warn = renderTile(usageTile({ percent: 78, name: 'Week', status: 'warning' }));
    assert.ok(warn.includes(`fill="${color.ember}">warning`));
    assert.ok(warn.includes(`fill="${color.surface}"`));
    const alert = renderTile(usageTile({ percent: 94, name: 'Session', status: 'limit · in 40m' }));
    assert.ok(alert.includes(`fill="${color.alertBg}"`));
    assert.ok(alert.includes(`fill="${color.alert}" fill-opacity=".25"`), 'alert bar track');
    assert.ok(alert.includes(`fill="${color.alertText}">limit · in 40m`));
  });

  it('value uses Space Grotesk 22 px at y=30, unit as smaller tspan', () => {
    const svg = renderTile({ template: 'value', value: '18.9', unit: '°C', name: 'Temperature' });
    assert.match(svg, /<text x="36" y="30"[^>]*font-family="'Space Grotesk', sans-serif" font-weight="500" font-size="22"/);
    assert.ok(svg.includes('<tspan font-size="10" fill="#8A90A2">°C</tspan>'));
  });

  it('offline: dashed, "--", muted colours, empty track', () => {
    const svg = renderTile(offlineValueTile({ name: 'Temperature' }));
    assert.ok(svg.includes('stroke-opacity="0.18" stroke-dasharray="3 3"'));
    assert.deepEqual(texts(svg), ['--', 'Temperature', 'Offline']);
    assert.ok(svg.includes(`fill="${color.label}">--`));
  });

  it('temperature scale passes through the design colour at 18.9 °C', () => {
    assert.equal(temperatureColor(10), color.glacier);
    assert.equal(temperatureColor(35), color.alert);
    const c = temperatureColor(18.9);
    assert.match(c, /^#[0-9A-F]{6}$/);
    // within a few steps of #A9C7F5
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16));
    assert.ok(Math.abs((r ?? 0) - 0xa9) < 6 && Math.abs((g ?? 0) - 0xc7) < 6 && Math.abs((b ?? 0) - 0xf5) < 6, c);
  });
});

describe('Cover template', () => {
  it('gradient placeholder, scrim, text at y=55/65', () => {
    const svg = renderTile({ template: 'cover', glyph: 'bars', name: 'Track title', status: 'Artist' });
    assert.ok(svg.includes('<linearGradient id="cv"'));
    assert.ok(svg.includes('fill="url(#sc)"'));
    assert.ok(svg.includes('y="55"') && svg.includes('y="65"'));
    assert.ok(svg.includes(`r="10" fill="${color.ink}" fill-opacity=".55"`));
  });

  it('artwork image is clipped to the rounded tile; paused dims it and shows play', () => {
    const svg = renderTile({ template: 'cover', image: 'data:image/jpeg;base64,/9j/', glyph: 'play', paused: true, name: 'A' });
    assert.ok(svg.includes('xlink:href="data:image/jpeg;base64,/9j/"'));
    assert.ok(svg.includes('clip-path="url(#cr)"'));
    assert.ok(svg.includes(`fill="${color.ink}" fill-opacity=".55"/><rect`));
    assert.ok(svg.includes('M33.5 17.5l8 4.5-8 4.5z'));
    assert.ok(!svg.includes('id="cv"'));
  });

  it('pips: hidden for one player; current = wide pill, playing = ember', () => {
    assert.ok(!renderTile({ template: 'cover', name: 'A', pips: { lit: [true], current: 0 } }).includes('height="4"'));
    const svg = renderTile({ template: 'cover', name: 'A', pips: { lit: [false, true], current: 0 } });
    assert.ok(svg.includes('width="10" height="4" rx="2" fill="#fff" fill-opacity=".9"'));
    assert.ok(svg.includes(`width="4" height="4" rx="2" fill="${color.ember}"`));
  });
});

describe('Recurring tile states', () => {
  const power = { glyph: 'power', name: 'Power', idleStatus: 'hold 1 s', confirmName: 'Shut down?' } as const;

  it('hold: progress overlay width follows progress', () => {
    const svg = renderTile(holdTile({ phase: 'holding', progress: 0.6 }, power));
    assert.ok(svg.includes('<clipPath id="cp">'));
    assert.ok(svg.includes(`<rect width="43.2" height="72" fill="${color.alert}" fill-opacity=".3"/>`));
    assert.ok(svg.includes('<rect x="41.2" width="2" height="72"'));
    assert.deepEqual(texts(svg), ['Power', 'hold…']);
  });

  it('hold overlay is clamped to 0..1', () => {
    assert.ok(renderTile(holdTile({ phase: 'holding', progress: 3 }, power)).includes('<rect width="72" height="72" fill='));
    assert.ok(renderTile(holdTile({ phase: 'holding', progress: -1 }, power)).includes('<rect width="0" height="72"'));
  });

  it('confirm: solid alert badge, dark glyph, countdown in status', () => {
    const svg = renderTile(holdTile({ phase: 'confirm', secondsLeft: 3 }, power));
    assert.ok(svg.includes(`<circle cx="36" cy="22" r="12" fill="${color.alert}"/>`));
    assert.ok(svg.includes(`stroke="${color.surface}" stroke-width="2.4"`));
    assert.ok(svg.includes(`stroke="${color.alert}"/>`), 'full-opacity outline');
    assert.deepEqual(texts(svg), ['Shut down?', 'press · 3']);
  });

  it('error tile shows "!"', () => {
    const svg = renderTile(errorTile({ name: 'Session', status: 'Expired' }));
    assert.deepEqual(texts(svg), ['!', 'Session', 'Expired']);
    assert.ok(svg.includes(`fill="${color.alertBg}"`));
  });
});

describe('text handling', () => {
  it('escapes XML in names, statuses and values', () => {
    const spec: TileSpec = { template: 'value', value: '<1>', unit: '&', name: 'A & B', status: '"x" <y>' };
    const svg = renderTile(spec);
    assertWellFormed(svg);
    assert.ok(svg.includes('&lt;1&gt;') && svg.includes('A &amp; B') && svg.includes('&quot;x&quot; &lt;y&gt;'));
  });

  it('keeps design labels intact', () => {
    for (const s of ['Shut down?', 'Temperature', 'Main page', 'limit · in 40m', 'Track title', 'Close game']) {
      assert.equal(fitText(s, 64, 8.5, true), s);
    }
  });

  it('ellipsizes long text to fit the tile', () => {
    const long = 'A very long track title from the album';
    const fitted = fitText(long, 64, 8.5, true);
    assert.ok(fitted.endsWith('…'));
    assert.ok(measureText(fitted, 8.5, true) <= 64);
    const svg = renderTile({ template: 'cover', name: long, status: long });
    assert.ok(texts(svg).every((t) => t.endsWith('…')));
  });

  it('collapses whitespace', () => {
    assert.equal(fitText('  a \n  b ', 64, 8.5), 'a b');
  });
});

describe('layouts', () => {
  it('default is the deck layout on black; deck enlarges type for 72 px keys', () => {
    const spec: TileSpec = { template: 'icon', glyph: 'mic', name: 'Mic', status: 'On', statusTone: 'ok' };
    assert.equal(renderWith(spec), renderWith(spec, { layout: layouts.deck, surface: deckSurface }));
    assert.ok(renderWith(spec).includes(`<rect width="72" height="72" rx="12" fill="${deckSurface}"/>`));
    assert.notEqual(renderWith(spec), renderTile(spec));
    const deck = renderTile(spec, { layout: layouts.deck });
    assertWellFormed(deck);
    assert.ok(deck.includes('font-size="11"') && deck.includes('font-size="9.5"') && deck.includes('font-weight="600"'));
    assert.ok(deck.includes('<circle cx="36" cy="20" r="12"'));
  });

  it('deck keeps explicit value sizes (clock), shifts them, and moves the bar', () => {
    const svg = renderTile({ template: 'value', value: '16:22', valueSize: 26, valueY: 33, name: 'Saturday' }, { layout: layouts.deck });
    assert.match(svg, /y="31"[^>]*font-size="26"/);
    const bar = renderTile(usageTile({ percent: 50, name: 'S' }), { layout: layouts.deck });
    assert.ok(bar.includes('<rect x="8" y="33"'));
  });

  it('surface override replaces the Surface background only', () => {
    const svg = renderTile({ template: 'icon', glyph: 'mic', name: 'M' }, { surface: '#010203' });
    assert.ok(svg.includes('fill="#010203"'));
    assert.ok(!svg.includes(`fill="${color.surface}"`));
  });
});

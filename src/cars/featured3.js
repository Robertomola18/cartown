import * as THREE from 'three';
import { greenhouse, roundedPoly, smoothPath, plate, gap, line, rrect, crect, circle, ellipse, poly, both, archBand, glassPanel } from './v2draw.js';

const GLOSS_BLACK = '#0b0c0f';
const SATIN_BLACK = '#1a1b1f';
const CHROME = '#dfe3e8';

function starBadge(P, cx, cy, r, color = '#e8ecf1') {
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 2 + (k * Math.PI * 2) / 3;
    P.fill(poly([[cx + Math.cos(a) * r, cy + Math.sin(a) * r], [cx + Math.cos(a + 2.1) * r * 0.2, cy + Math.sin(a + 2.1) * r * 0.2], [cx + Math.cos(a - 2.1) * r * 0.2, cy + Math.sin(a - 2.1) * r * 0.2]]), color, { metal: 1 });
  }
  P.fill(circle(cx, cy, r * 0.14), color, { metal: 1 });
}

export const OMODA5 = {
  id: 'omoda5',
  v2: true,
  name: 'Omoda 5 MY25',
  brand: 'Omoda',
  featured: true,
  class: 'Compact Crossover',
  scale: 0.6,
  key: { cowl: 1.0, roofFront: 0.3, roofRear: -1.55, rearBase: -1.82 },
  body: {
    length: 4.4,
    width: 1.83,
    wheel: { radius: 0.362, width: 0.245, front: 1.35, rear: -1.35, archGap: 0.04 },
    roof: [[-2.2, 0.74], [-2.192, 0.94], [-2.17, 1.1], [-2.1, 1.23], [-1.95, 1.34], [-1.72, 1.45], [-1.4, 1.53], [-0.85, 1.58], [-0.2, 1.59], [0.18, 1.585], [0.3, 1.565], [0.7, 1.33], [1.0, 1.115], [1.32, 1.055], [1.65, 1.0], [1.95, 0.95], [2.12, 0.915], [2.18, 0.87], [2.2, 0.74]],
    belt: [[-2.2, 0.72], [-2.191, 0.92], [-2.16, 1.07], [-2.1, 1.13], [-1.82, 1.14], [-1.2, 1.12], [-0.2, 1.09], [0.3, 1.07], [1.0, 1.04], [1.4, 0.98], [1.95, 0.91], [2.12, 0.87], [2.18, 0.83], [2.2, 0.7]],
    sill: [[-2.2, 0.5], [-2.1, 0.36], [-1.9, 0.28], [-1.0, 0.22], [1.0, 0.22], [1.9, 0.26], [2.12, 0.3], [2.2, 0.42]],
    shoulder: [[-2.2, 0.74], [-1.95, 0.95], [0.3, 0.95], [1.1, 0.92], [2.2, 0.62]],
    wBody: [[-2.2, 0.87], [-1.4, 0.9], [0.3, 0.91], [1.4, 0.9], [2.2, 0.86]],
    wBelt: [[-2.2, 0.75], [-1.4, 0.82], [0.3, 0.83], [1.0, 0.82], [2.2, 0.77]],
    wRoof: [[-2.2, 0.54], [-1.5, 0.62], [-0.4, 0.66], [0.3, 0.65], [0.9, 0.6], [2.2, 0.52]],
    noseDepth: 0.4,
    noseExp: 3.4,
    tailDepth: 0.34,
    tailExp: 3.5,
    noseRake: { depth: 0.4, y0: 0.45, y1: 0.85, amount: 0.04 },
    tailRake: { depth: 0.34, y0: 0.65, y1: 1.25, amount: 0.07 },
    flare: 0.04,
    rLow: 0.1,
    roofEdge: 0.065,
    keyX: [1.0, 0.3, -1.55, -1.82],
    archTrim: true,
  },
  wheelDef: { style: 'star', rimRatio: 0.72, rimColor: '#141518', accent: null, caliper: null },
  colors: { paint: '#f4f4f1', roof: null, finish: 'pearl', rim: '#141518' },
  parts: { mirrors: 'white', mirrorScale: 1.05, roofRails: true, fin: true, spoiler: 'roof', spoilerColor: 'black' },
  stats: { hp: 145, kg: 1470, grip: 0.88, gears: 7, redline: 6000 },
  price: 28000,
  level: 3,
  blurb: 'The MY25 Omoda 5: squared body-colour grille, arrow-thin DRLs joined by a black bar, an X-pattern bumper and black star wheels.',
  extraParts(group, ctx) {
    const { fn, trimMat, chromeMat, sharedGeo, roundedBox } = ctx;
    const x = fn.half - 0.04;
    const finGeo = sharedGeo('omodaXFin', () => roundedBox(0.03, 0.32, 0.055, 0.012));
    for (const s of [1, -1]) {
      const fin = new THREE.Mesh(finGeo, trimMat());
      fin.position.set(x, 0.36, s * 0.58);
      fin.rotation.x = s * 0.55;
      group.add(fin);
    }
    const barGeo = sharedGeo('omodaBar', () => roundedBox(0.02, 0.022, 0.74, 0.008));
    const bar = new THREE.Mesh(barGeo, trimMat());
    bar.position.set(fn.half - 0.02, 0.84, 0);
    group.add(bar);
    const badge = new THREE.Mesh(sharedGeo('omodaBadge', () => roundedBox(0.01, 0.035, 0.17, 0.008)), chromeMat());
    badge.position.set(fn.half + 0.01, 0.84, 0);
    group.add(badge);
  },
  draw: {
    side(P, c) {
      const fn = c.fn;
      const g = greenhouse(c, { aBase: 0.98, aTop: 0.3, rBase: -1.8, rTop: -1.55, windows: [[0.98, -0.3], [-0.4, -1.8]], inset: 0.028, cornerR: 0.045 });
      P.fill(g.surround, GLOSS_BLACK);
      for (const w of g.windows) P.glass(w);
      gap(P, [[1.34, 0.34], [1.34, 0.72], [1.05, 1.06]]);
      gap(P, [[-0.36, 0.33], [-0.36, 1.08]]);
      gap(P, [[-1.78, 1.09], [-1.74, 0.92], [-1.6, 0.78], [-1.55, 0.4]]);
      P.fill(crect(0.5, 0.94, 0.19, 0.03, 0.014), '#d3d6d9', { metal: 0.5 });
      P.fill(crect(-0.62, 0.97, 0.19, 0.03, 0.014), '#d3d6d9', { metal: 0.5 });
      for (const a of fn.arches) P.fill(archBand(a.x, fn.wheelY, a.r - 0.012, 0.07, { sill: 0.21 }), SATIN_BLACK);
      P.fill(rrect(-1.1, 0.16, 2.2, 0.11, 0.04), SATIN_BLACK);
      P.stroke(line([[2.05, 0.9], [1.0, 0.95], [-0.4, 0.96], [-1.75, 0.97]]), 'rgba(255,255,255,0.32)', 0.01);
      P.text('OMODA', 1.55, 0.83, 0.042, '#b7bcc3', { metal: 0.8, font: 'Arial, sans-serif', weight: '700' });
    },
    front(P, c) {
      const span = c.frontSpan - 0.05;
      P.fill(rrect(-span, 0.21, span * 2, 0.13, 0.04), SATIN_BLACK);
      P.fill(roundedPoly([[-0.58, 0.51], [0.58, 0.51], [0.58, 0.81], [-0.58, 0.81]], 0.035), '#141619');
      for (let r = 0; r < 5; r++) {
        for (let k = 0; k < 9; k++) {
          P.fill(crect(-0.49 + k * 0.1225, 0.53 + r * 0.05, 0.103, 0.04, 0.007), '#f4f4f1', { metal: 0.15 });
        }
      }
      P.fill(crect(0, 0.84, 1.12, 0.045, 0.012), GLOSS_BLACK);
      P.text('OMODA', 0, 0.842, 0.034, '#e7eaee', { font: 'Arial, sans-serif', weight: '700', metal: 0.9 });
      both((s) => {
        const arrow = smoothPath([[s * 0.16, 0.9], [s * 0.4, 0.905], [s * 0.66, 0.925], [s * 0.87, 0.9], [s * 0.66, 0.885], [s * 0.4, 0.885]], true, 0.3);
        P.fill(arrow, GLOSS_BLACK);
        P.stroke(smoothPath([[s * 0.2, 0.896], [s * 0.42, 0.899], [s * 0.65, 0.912], [s * 0.83, 0.899]], false), '#ffffff', 0.012, { glow: '#ffffff' });
        P.fill(poly([[s * 0.62, 0.46], [s * 0.68, 0.46], [s * 0.94, 0.24], [s * 0.84, 0.24]]), '#1b1d21');
        P.fill(poly([[s * 0.58, 0.28], [s * 0.64, 0.28], [s * 0.86, 0.48], [s * 0.8, 0.48]]), '#1b1d21');
        P.fill(circle(s * 0.75, 0.58, 0.012), '#d8dbde');
      });
      plate(P, 0, 0.34, '25 OMA 51', { w: 0.5, h: 0.11 });
    },
    rear(P, c) {
      const span = c.rearSpan - 0.08;
      P.fill(crect(0, 1.13, span * 2, 0.055, 0.018), '#2a0306');
      P.fill(crect(0, 1.13, span * 2 - 0.02, 0.022, 0.008), '#e0161e', { glow: '#ff2020' });
      both((s) => {
        for (let k = 0; k < 3; k++) P.fill(crect(s * (0.52 + k * 0.1), 1.05, 0.055, 0.16, 0.014), '#b30e14', { glow: '#ff2020' });
        P.fill(crect(s * 0.68, 0.49, 0.12, 0.03, 0.012), '#d81b1b', { glow: '#ff2020' });
      });
      P.text('OMODA', 0, 1.0, 0.045, '#c9ced4', { font: 'Arial, sans-serif', weight: '700', metal: 0.8 });
      plate(P, 0, 0.66, '25 OMA 51', { w: 0.5, h: 0.11 });
      P.fill(rrect(-span, 0.26, span * 2, 0.19, 0.04), SATIN_BLACK);
      P.fill(rrect(-0.62, 1.22, 1.24, 0.07, 0.02), GLOSS_BLACK);
    },
    windshield(P, c, proj) {
      glassPanel(P, proj.length, c.fn.beltWidthAt(c.key.cowl) - 0.1, c.fn.roofWidthAt(c.key.roofFront) - 0.07);
    },
    backlight(P, c, proj) {
      const wb = c.fn.beltWidthAt(c.key.rearBase) - 0.13;
      glassPanel(P, proj.length, wb, wb - 0.06, { frit: 0.05 });
    },
    top(P) {
      for (const s of [1, -1]) P.fill(rrect(-1.58, s > 0 ? 0.55 : -0.61, 1.75, 0.06, 0.025), GLOSS_BLACK);
    },
  },
};

export const C30CDIAMG = {
  id: 'c30cdiamg',
  v2: true,
  name: 'Mercedes-AMG C 30 CDI SportCoupé',
  brand: 'Mercedes-AMG',
  featured: true,
  class: 'AMG Coupe',
  scale: 0.6,
  key: { cowl: 0.86, roofFront: 0.15, roofRear: -1.5, rearBase: -1.78 },
  body: {
    length: 4.343,
    width: 1.728,
    wheel: { radius: 0.335, width: 0.235, front: 1.357, rear: -1.358, archGap: 0.035 },
    roof: [[-2.1715, 0.72], [-2.165, 0.92], [-2.14, 1.08], [-2.08, 1.19], [-1.96, 1.27], [-1.78, 1.335], [-1.5, 1.385], [-1.1, 1.4], [-0.55, 1.401], [0.05, 1.385], [0.15, 1.365], [0.5, 1.23], [0.86, 1.08], [1.15, 1.015], [1.55, 0.98], [1.9, 0.94], [2.09, 0.91], [2.15, 0.87], [2.1715, 0.72]],
    belt: [[-2.1715, 0.7], [-2.16, 0.9], [-2.11, 1.05], [-1.78, 1.16], [-1.2, 1.12], [-0.2, 1.08], [0.86, 1.05], [1.1, 1.0], [1.55, 0.95], [2.0, 0.9], [2.1715, 0.7]],
    sill: [[-2.1715, 0.48], [-2.1, 0.34], [-1.9, 0.26], [-1.0, 0.2], [1.0, 0.2], [1.9, 0.24], [2.1, 0.3], [2.1715, 0.44]],
    shoulder: [[-2.1715, 0.72], [-1.8, 0.92], [0.1, 0.93], [1.1, 0.9], [2.1715, 0.6]],
    wBody: [[-2.1715, 0.86], [-1.4, 0.89], [0.2, 0.9], [1.4, 0.89], [2.1715, 0.86]],
    wBelt: [[-2.1715, 0.75], [-1.3, 0.8], [0.4, 0.81], [1.3, 0.79], [2.1715, 0.74]],
    wRoof: [[-2.1715, 0.54], [-1.4, 0.62], [-0.5, 0.65], [0.15, 0.63], [0.86, 0.58], [2.1715, 0.5]],
    hoodRidge: { profile: [[0.86, 0], [1.2, 0.025], [1.85, 0.035], [2.1, 0.015]], z: [0], w: 0.36 },
    fenderHump: { front: 0.02, rear: 0.045, spread: 1.7 },
    noseDepth: 0.34,
    noseExp: 3.6,
    tailDepth: 0.3,
    tailExp: 4,
    noseRake: { depth: 0.32, y0: 0.5, y1: 0.85, amount: 0.04 },
    tailRake: { depth: 0.3, y0: 0.65, y1: 1.1, amount: 0.05 },
    flare: 0.03,
    rLow: 0.09,
    roofEdge: 0.055,
    keyX: [0.86, 0.15, -1.5, -1.78],
  },
  wheelDef: { style: 'amg', rimRatio: 0.76, rimColor: '#b9bec5', accent: null, caliper: null },
  colors: { paint: '#a8aeb6', roof: null, finish: 'metallic', rim: '#b9bec5' },
  parts: { mirrors: 'paint', mirrorScale: 1.05, fin: true, spoiler: 'wing', spoilerColor: 'black' },
  stats: { hp: 231, kg: 1640, grip: 0.94, gears: 5, redline: 4500 },
  price: 42000,
  level: 7,
  blurb: 'The 2004 facelift SportCoupé: clear-lens lamps, silver AMG grille, split wing, diffuser, twin exhausts and staggered 17-inch AMG wheels.',
  extraParts(group, ctx) {
    const { fn, trimMat, chromeMat, sharedGeo, sharedMat, roundedBox } = ctx;
    const tipGeo = sharedGeo('amgExhaust', () => new THREE.CylinderGeometry(0.048, 0.048, 0.18, 16).rotateX(Math.PI / 2));
    const coreGeo = sharedGeo('amgExhaustCore', () => new THREE.CylinderGeometry(0.033, 0.033, 0.184, 12).rotateX(Math.PI / 2));
    const dark = sharedMat('amgExhaustDark', () => new THREE.MeshStandardMaterial({ color: 0x131417, metalness: 0.6, roughness: 0.35 }));
    for (const s of [1, -1]) {
      const tip = new THREE.Mesh(tipGeo, chromeMat());
      tip.position.set(-fn.half + 0.02, 0.4, s * 0.5);
      group.add(tip);
      const core = new THREE.Mesh(coreGeo, dark);
      core.position.copy(tip.position);
      core.position.x -= 0.002;
      group.add(core);
    }
    const splitter = new THREE.Mesh(sharedGeo('amgSplitter', () => roundedBox(0.12, 0.026, 1.1, 0.01)), trimMat());
    splitter.position.set(fn.half - 0.03, 0.24, 0);
    group.add(splitter);
  },
  draw: {
    side(P, c) {
      const g = greenhouse(c, { aBase: 0.85, aTop: 0.16, rBase: -1.76, rTop: -1.5, windows: [[0.85, -0.34], [-0.43, -1.76]], inset: 0.028, cornerR: 0.045 });
      P.fill(g.surround, GLOSS_BLACK);
      for (const w of g.windows) P.glass(w);
      gap(P, [[1.27, 0.33], [1.27, 0.68], [0.9, 1.06]]);
      gap(P, [[0.6, 0.34], [0.6, 1.06]]);
      gap(P, [[-1.74, 1.1], [-1.72, 0.92], [-1.6, 0.76], [-1.55, 0.38]]);
      P.fill(crect(0.72, 0.92, 0.18, 0.028, 0.012), CHROME, { metal: 1 });
      P.fill(rrect(-1.3, 0.18, 2.6, 0.1, 0.035), SATIN_BLACK);
      P.fill(crect(-1.2, 0.23, 1.9, 0.012, 0.006), '#5b6067', { metal: 0.7 });
      P.stroke(line([[2.0, 0.88], [1.0, 0.93], [-0.3, 0.94], [-1.7, 0.95]]), 'rgba(255,255,255,0.28)', 0.009);
      P.text('AMG', 1.28, 0.82, 0.042, '#c6ccd3', { metal: 1, font: 'Arial Black, Arial', weight: '900' });
      P.stroke(crect(-1.45, 0.95, 0.12, 0.1, 0.02), 'rgba(0,0,0,0.35)', 0.005);
    },
    front(P) {
      P.fill(roundedPoly([[-0.46, 0.79], [0.46, 0.79], [0.46, 0.49], [-0.46, 0.49]], 0.025), '#c9ced4', { metal: 1 });
      for (let i = 0; i < 4; i++) P.fill(crect(0, 0.54 + i * 0.062, 0.82, 0.018, 0.006), '#4b5058', { metal: 0.8 });
      P.fill(circle(0, 0.64, 0.096), '#e8ebef', { metal: 1 });
      P.fill(circle(0, 0.64, 0.082), '#14161a');
      starBadge(P, 0, 0.64, 0.078);
      both((s) => {
        P.fill(roundedPoly([[s * 0.56, 0.69], [s * 0.72, 0.7], [s * 0.87, 0.55], [s * 0.58, 0.54]], 0.04), GLOSS_BLACK);
        for (let i = 0; i < 3; i++) P.fill(crect(s * (0.65 + i * 0.06), 0.61, 0.028, 0.13, 0.012), '#2c3036', { metal: 0.5 });
        P.fill(roundedPoly([[s * 0.56, 0.45], [s * 0.88, 0.45], [s * 0.98, 0.26], [s * 0.5, 0.26]], 0.035), GLOSS_BLACK);
        for (let i = 0; i < 4; i++) P.fill(crect(s * (0.62 + i * 0.08), 0.35, 0.035, 0.15, 0.01), '#2a2e34');
        P.fill(crect(s * 0.76, 0.24, 0.36, 0.035, 0.014), '#191b1f');
      });
      plate(P, 0, 0.35, 'S 303 AMG', { w: 0.5, h: 0.11, bandText: 'D' });
    },
    frontUpper(P) {
      both((s) => {
        const L = ([x, y]) => [s * x, y];
        const outline = [[0.38, 0.84], [0.5, 0.9], [0.63, 0.98], [0.75, 1.05], [0.86, 1.08], [0.93, 1.04], [0.9, 0.96], [0.8, 0.88], [0.66, 0.83], [0.5, 0.81]];
        P.fill(smoothPath(outline.map(L), true, 0.4), '#0a0b0e');
        P.fill(smoothPath(outline.map(([x, y]) => L([0.65 + (x - 0.65) * 0.88, 0.94 + (y - 0.94) * 0.88])), true, 0.4), P.linear(0, 1.08, 0, 0.82, [[0, '#dfe7f0'], [0.5, '#96a2b0'], [1, '#46505d']]), { metal: 0.9 });
        for (const [x, y, r] of [[0.76, 0.99, 0.055], [0.62, 0.9, 0.045]]) {
          P.fill(ellipse(s * x, y, r, r * 0.85), '#303945', { metal: 0.9 });
          P.fill(circle(s * x, y, r * 0.55), '#c8d3de', { metal: 1 });
        }
        P.stroke(smoothPath([L([0.44, 0.86]), L([0.58, 0.92]), L([0.74, 1.0])], false), '#ffffff', 0.012, { glow: '#eaf2ff' });
      });
    },
    rear(P, c) {
      const span = c.rearSpan - 0.08;
      both((s) => {
        P.fill(roundedPoly([[s * 0.44, 1.06], [s * span, 1.08], [s * span, 0.96], [s * 0.46, 0.98]], 0.03), '#35060a');
        for (let i = 0; i < 5; i++) P.fill(crect(s * (0.58 + i * 0.09), 1.02, 0.035, 0.07, 0.01), '#e11a22', { glow: '#ff2020' });
        P.fill(circle(s * 0.78, 0.4, 0.055), '#15171b', { metal: 0.4 });
        P.fill(circle(s * 0.78, 0.4, 0.042), CHROME, { metal: 1 });
        P.fill(rrect(s * (span - 0.06), 1.08, 0.12, 0.075, 0.02), GLOSS_BLACK);
        P.fill(rrect(s * (span - 0.06), 1.07, 0.035, 0.18, 0.012), GLOSS_BLACK);
      });
      P.fill(circle(0, 1.02, 0.055), '#e8ebef', { metal: 1 });
      P.fill(circle(0, 1.02, 0.046), '#15171b');
      starBadge(P, 0, 1.02, 0.044);
      P.text('C 30 CDI', 0, 0.9, 0.04, '#c9ced4', { font: 'Arial, sans-serif', weight: '700', metal: 0.9 });
      P.text('AMG', 0.55, 0.9, 0.04, '#c9ced4', { font: 'Arial Black, Arial', weight: '900', metal: 1 });
      plate(P, 0, 0.62, 'S 303 AMG', { w: 0.5, h: 0.11, bandText: 'D' });
      P.fill(rrect(-span, 0.29, span * 2, 0.22, 0.045), GLOSS_BLACK);
      for (let i = -4; i <= 4; i++) P.fill(crect(i * 0.1, 0.35, 0.016, 0.12, 0.006), '#242830');
    },
    windshield(P, c, proj) {
      glassPanel(P, proj.length, c.fn.beltWidthAt(c.key.cowl) - 0.1, c.fn.roofWidthAt(c.key.roofFront) - 0.07);
    },
    backlight(P, c, proj) {
      const wb = c.fn.beltWidthAt(c.key.rearBase) - 0.12;
      glassPanel(P, proj.length, wb, wb - 0.05, { frit: 0.045 });
    },
    top(P) {
      for (const s of [1, -1]) P.stroke(line([[-1.78, s * 0.58], [-0.5, s * 0.64], [0.15, s * 0.58]]), 'rgba(255,255,255,0.14)', 0.008);
    },
  },
};

export const FEATURED_V3 = [OMODA5, C30CDIAMG];

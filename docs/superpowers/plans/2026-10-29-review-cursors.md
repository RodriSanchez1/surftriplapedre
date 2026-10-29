# Drawing cursors, rail icons and the free arrow: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/review/`, the pointer over the picture shows the drawing tool in use and its colour, every rail button uses an SVG icon from one set, and a new "flecha libre" draws a freehand line that ends in an arrowhead. Both arrows share one rail button with a Recta / Libre menu.

**Architecture:** Pure, tested logic in `src/lib/review/`: `draw.ts` gains the `freeArrow` tool and `arrowTail`, the new `icons.ts` holds the icon drawings and builds the cursor SVG from the page's colours, and the new `menu.ts` places the arrow menu. `ToolIcon.astro` renders an icon. `VideoReview.astro` gets the icons, the arrow button and the menu markup and styles. `page.ts` wires the arrow button, the menu (outside tap, Esc, ↑/↓) and the cursor.

**Tech Stack:** Astro 7, TypeScript, Vitest (node environment, no DOM), Playwright for the in-browser check.

**Spec:** `docs/superpowers/specs/2026-10-29-review-cursors-design.md`. Design: page "Análisis de video: cursores y flecha libre" of the canvas [Surftrip: UI de la app](https://claude.ai/artifact/Skns4rC61JnapAUv48tScm). Branch `feat/review-cursors`, worktree `.claude/worktrees/review-cursors`.

**Verification for every task:** `npm run check && npm test && npm run build` (Node 24: `nvm use`). Commits in English, imperative, short, ending with:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

(Subagents: use exactly this trailer, not your own model name.)

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/lib/review/draw.ts` | modify | `freeArrow` tool, `arrowTail`, painting the free arrow |
| `tests/draw.test.ts` | modify | `arrowTail` tests |
| `src/lib/review/icons.ts` | create | icon drawings (`ICONS`), cursor SVG and CSS value |
| `tests/icons.test.ts` | create | tests of `icons.ts` |
| `src/lib/review/menu.ts` | create | `placeMenu`: where the arrow menu opens |
| `tests/menu.test.ts` | create | tests of `menu.ts` |
| `src/lib/i18n.ts` | modify | arrow names (es, pt), tour copy without 📌 |
| `src/components/ToolIcon.astro` | create | renders one icon |
| `src/pages/design.astro` | modify | ToolIcon section: icons and cursors |
| `src/components/VideoReview.astro` | modify | icons in the rail, arrow button, arrow menu, styles |
| `src/lib/review/page.ts` | modify | arrow button and menu behaviour, cursor |

| Task | Model |
|---|---|
| 1 · Free arrow in the drawing | Sonnet |
| 2 · Icons and cursors | Sonnet |
| 3 · Menu placement | Sonnet |
| 4 · Copy | Haiku |
| 5 · ToolIcon and /design/ | Sonnet |
| 6 · Rail markup and styles | Sonnet |
| 7 · Wiring in page.ts | Sonnet |
| 8 · Browser check and screenshots | Opus |

---

## Task 1 · Free arrow in the drawing  ·  Sonnet

**Files:**
- Modify: `src/lib/review/draw.ts`
- Test: `tests/draw.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/draw.test.ts`, change the import line to:

```ts
import { arrowHead, arrowTail, captureSize, ShapeHistory, type Shape } from '../src/lib/review/draw';
```

and add this block right after the `describe('arrowHead', ...)` block:

```ts
describe('arrowTail', () => {
  it('skips the points too close to the tip', () => {
    expect(arrowTail([[0, 0], [50, 0], [95, 0], [99, 0], [100, 0]], 10)).toEqual([50, 0]);
  });
  it('returns the start of a stroke shorter than the distance', () => {
    expect(arrowTail([[0, 0], [3, 0], [5, 0]], 10)).toEqual([0, 0]);
  });
  it('works with two points', () => {
    expect(arrowTail([[0, 0], [100, 0]], 10)).toEqual([0, 0]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/draw.test.ts`
Expected: FAIL, `arrowTail` is not exported (it is `undefined` / "is not a function").

- [ ] **Step 3: Implement**

In `src/lib/review/draw.ts`:

a) Replace the header comment and the `Tool` type:

```ts
/**
 * Drawing on the paused frame: pen, straight arrow, free arrow and circle.
 * Shapes are kept in frame coordinates (0 to 1), so they survive a resize or fullscreen
 * and the capture draws them again at the video's own resolution.
 */

export type Tool = 'pen' | 'arrow' | 'freeArrow' | 'circle';
```

b) In `interface Shape`, replace the comment on `points` with:

```ts
  /** Pen and free arrow: every point. Arrow: tail and tip. Circle: two opposite corners of its box. */
```

c) Right after the `arrowHead` function, add:

```ts
/**
 * Where a free arrow's head takes its direction from: walking back from the tip, the first point at least
 * `minDistance` away from it (or the start of the stroke), so a shaky last pixel does not turn the head.
 */
export function arrowTail(points: Point[], minDistance: number): Point {
  const tip = points[points.length - 1];
  for (let i = points.length - 2; i >= 0; i--) {
    const p = points[i];
    if (Math.hypot(p[0] - tip[0], p[1] - tip[1]) >= minDistance) return p;
  }
  return points[0];
}
```

d) In `paint`, replace everything from `if (s.tool === 'pen') {` down to and including the next line that reads `} else if (s.tool === 'arrow') {` with:

```ts
    if (s.tool === 'pen' || s.tool === 'freeArrow') {
      const points = s.points.map(px);
      const [first, ...rest] = points;
      ctx.moveTo(...first);
      for (const p of rest) ctx.lineTo(...p);
      if (s.tool === 'freeArrow') {
        const tip = points[points.length - 1];
        const [a, b] = arrowHead(arrowTail(points, line * 5), tip, line * 5);
        ctx.moveTo(...a);
        ctx.lineTo(...tip);
        ctx.lineTo(...b);
      }
    } else if (s.tool === 'arrow') {
```

The body of the `arrow` branch and the circle `else` that follow stay as they are.

e) In `Sketch`, in `#move`, replace `if (s.tool === 'pen') s.points.push(p);` with:

```ts
    if (s.tool === 'pen' || s.tool === 'freeArrow') s.points.push(p);
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/draw.test.ts`
Expected: PASS.

- [ ] **Step 5: Full check and commit**

Run: `npm run check && npm test && npm run build`. Expected: no errors.

```bash
git add src/lib/review/draw.ts tests/draw.test.ts
git commit -m "Add the free arrow to the drawing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2 · Icons and cursors  ·  Sonnet

**Files:**
- Create: `src/lib/review/icons.ts`
- Test: `tests/icons.test.ts`

The drawings are the ones on the canvas page (components `RailIcon` and `Cursor`). The only change is that the cross arms start at 2.5 instead of 1, so the paper halo is not cut by the edge of the 32 px box.

- [ ] **Step 1: Write the failing test**

Create `tests/icons.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Tool } from '../src/lib/review/draw';
import { cursorFor, cursorSvg, hotspot, ICONS } from '../src/lib/review/icons';

const colors = { ink: '#111111', paper: '#fffaf0', accent: '#e4261c' };
const tools: Tool[] = ['pen', 'arrow', 'freeArrow', 'circle'];

describe('ICONS', () => {
  it('has a drawing for every rail button', () => {
    for (const name of ['pen', 'arrow', 'freeArrow', 'circle', 'undo', 'clear', 'pin'] as const) {
      expect(ICONS[name]).toMatch(/^<(path|circle) /);
    }
  });
});

describe('hotspot', () => {
  it('is the pencil tip for the pen and the middle of the cross for the rest', () => {
    expect(hotspot('pen')).toEqual([3, 29]);
    expect(hotspot('arrow')).toEqual([9, 9]);
    expect(hotspot('freeArrow')).toEqual([9, 9]);
    expect(hotspot('circle')).toEqual([9, 9]);
  });
});

describe('cursorSvg', () => {
  it('paints the active colour and the page colours', () => {
    for (const tool of tools) {
      const svg = cursorSvg(tool, colors);
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="32" height="32" viewBox="0 0 32 32">/);
      expect(svg).toContain('fill:#e4261c');
      expect(svg).toContain('#111111');
      expect(svg).toContain('#fffaf0');
    }
  });
  it('puts the tool in the badge of the cross', () => {
    expect(cursorSvg('circle', colors)).toContain('<circle cx="12" cy="12" r="6.5"');
    expect(cursorSvg('arrow', colors)).toContain('M6 18L18 6');
    expect(cursorSvg('freeArrow', colors)).toContain('M5 19c4 0 4-7 7-7');
  });
});

describe('cursorFor', () => {
  it('is a data URL with the hotspot and a crosshair fallback', () => {
    expect(cursorFor('pen', colors)).toMatch(/^url\("data:image\/svg\+xml,[^"#]+"\) 3 29, crosshair$/);
    for (const tool of ['arrow', 'freeArrow', 'circle'] as const) {
      expect(cursorFor(tool, colors)).toMatch(/^url\("data:image\/svg\+xml,[^"#]+"\) 9 9, crosshair$/);
    }
  });
  it('encodes the SVG so it decodes back whole', () => {
    const data = cursorFor('circle', colors).match(/^url\("data:image\/svg\+xml,([^"]+)"\)/)![1];
    expect(decodeURIComponent(data)).toBe(cursorSvg('circle', colors));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/icons.test.ts`
Expected: FAIL, cannot find module `../src/lib/review/icons`.

- [ ] **Step 3: Implement**

Create `src/lib/review/icons.ts`:

```ts
/**
 * The drawing rail's icons and the drawing cursors, as SVG markup.
 * Icons are drawn on a 24 grid with the stroke of the site's icons (2.2, round); their colour comes from CSS.
 * A cursor image cannot read CSS variables, so the cursors are built from colours the page passes in.
 */
import type { Tool } from './draw';

export type IconName = Tool | 'undo' | 'clear' | 'pin';

/** The inside of each icon's `<svg viewBox="0 0 24 24">`. */
export const ICONS: Record<IconName, string> = {
  pen: '<path d="M4 20l1.3-4.8L15.4 5.1a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.8 18.7zM13.4 7.1l3.5 3.5"/>',
  arrow: '<path d="M5 19L19 5M11 5h8v8"/>',
  freeArrow: '<path d="M4 19c4 0 4-7 8-7s4-4 7-7M13 5h6v6"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  undo: '<path d="M9 13L4 8l5-5M4 8h10a6 6 0 0 1 0 12h-4"/>',
  clear: '<path d="M14 4l6 6-9 9H7l-3-3a1.4 1.4 0 0 1 0-2zM9 9l6 6M14 19h6"/>',
  pin: '<path d="M9 3h6M10 3v6l-3 4h10l-3-4V3M12 13v8"/>',
};

/** The same drawings a little tighter, for the badge of the cross cursor. */
const BADGE: Record<Exclude<Tool, 'pen'>, string> = {
  arrow: '<path d="M6 18L18 6M11 6h7v7"/>',
  freeArrow: '<path d="M5 19c4 0 4-7 7-7s4-4 6-6M12 6h6v6"/>',
  circle: '<circle cx="12" cy="12" r="6.5"/>',
};

export interface CursorColors {
  ink: string;
  paper: string;
  /** The drawing colour in use. */
  accent: string;
}

/** Where the cursor draws in its 32 × 32 box: the pencil's tip, or the middle of the cross. */
export function hotspot(tool: Tool): [number, number] {
  return tool === 'pen' ? [3, 29] : [9, 9];
}

/**
 * The cursor of a tool. Pen: a pencil with a paper body, an ink cap and a cone in the active colour.
 * The rest: a thin ink cross with a paper halo and a badge in the active colour with the tool in ink.
 * Both with a hard ink shadow, like the site's cards. Colours go in `style` so CSS variables work too.
 */
export function cursorSvg(tool: Tool, { ink, paper, accent }: CursorColors): string {
  const body =
    tool === 'pen'
      ? `<g transform="translate(2 2) rotate(-45 3 29)"><path d="M3 29L10 25.5H28a2 2 0 0 1 2 2V30.5a2 2 0 0 1-2 2H10Z" style="fill:${ink};stroke:${ink}" stroke-width="2" stroke-linejoin="round"/></g>` +
        `<g transform="rotate(-45 3 29)" style="stroke:${ink}" stroke-width="2" stroke-linejoin="round">` +
        `<path d="M10 25.5H24V32.5H10Z" style="fill:${paper}"/>` +
        `<path d="M24 25.5H28a2 2 0 0 1 2 2V30.5a2 2 0 0 1-2 2H24Z" style="fill:${ink}"/>` +
        `<path d="M3 29L10 25.5V32.5Z" style="fill:${accent}"/></g>`
      : `<path d="M9 2.5v3.5M9 12v3.5M2.5 9h3.5M12 9h3.5" style="fill:none;stroke:${paper}" stroke-width="4.5" stroke-linecap="round"/>` +
        `<path d="M9 2.5v3.5M9 12v3.5M2.5 9h3.5M12 9h3.5" style="fill:none;stroke:${ink}" stroke-width="2" stroke-linecap="round"/>` +
        `<rect x="17" y="17" width="14" height="14" rx="3" style="fill:${ink}"/>` +
        `<rect x="15" y="15" width="14" height="14" rx="3" style="fill:${accent};stroke:${ink}" stroke-width="2"/>` +
        `<g transform="translate(15 15) scale(0.5833)" style="fill:none;stroke:${ink}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">${BADGE[tool]}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${body}</svg>`;
}

/** The CSS `cursor` of a tool: its SVG as a data URL with its hotspot, and the plain crosshair if the browser can't use it. */
export function cursorFor(tool: Tool, colors: CursorColors): string {
  const [x, y] = hotspot(tool);
  return `url("data:image/svg+xml,${encodeURIComponent(cursorSvg(tool, colors))}") ${x} ${y}, crosshair`;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/icons.test.ts`
Expected: PASS.

- [ ] **Step 5: Full check and commit**

Run: `npm run check && npm test && npm run build`. Expected: no errors.

```bash
git add src/lib/review/icons.ts tests/icons.test.ts
git commit -m "Add the drawing rail icons and cursors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3 · Menu placement  ·  Sonnet

**Files:**
- Create: `src/lib/review/menu.ts`
- Test: `tests/menu.test.ts`

The rail has `overflow-y: auto` on a laptop, so a menu inside it would be cut. The menu lives outside the rail, in the `.review` box, and `page.ts` places it with this function.

- [ ] **Step 1: Write the failing test**

Create `tests/menu.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { placeMenu } from '../src/lib/review/menu';

const menu = { width: 180, height: 100 };
const laptop = { left: 0, top: 0, width: 1280, height: 800 };
const phone = { left: 0, top: 0, width: 390, height: 844 };
const column = { left: 16, top: 60, width: 58, height: 400 };
const row = { left: 8, top: 500, width: 374, height: 58 };

describe('placeMenu', () => {
  it('opens to the right of a column rail, level with the button', () => {
    const button = { left: 23, top: 115, width: 44, height: 44 };
    expect(placeMenu(button, column, menu, laptop, 8)).toEqual({ left: 82, top: 115 });
  });
  it('stays inside the bounds at the bottom', () => {
    const button = { left: 23, top: 750, width: 44, height: 44 };
    expect(placeMenu(button, column, menu, laptop, 8)).toEqual({ left: 82, top: 700 });
  });
  it('opens above the button of a row rail', () => {
    const button = { left: 60, top: 507, width: 46, height: 44 };
    expect(placeMenu(button, row, menu, phone, 8)).toEqual({ left: 60, top: 399 });
  });
  it('opens below the button when there is no room above', () => {
    const button = { left: 60, top: 50, width: 46, height: 44 };
    expect(placeMenu(button, { ...row, top: 43 }, menu, phone, 8)).toEqual({ left: 60, top: 102 });
  });
  it('stays inside the bounds on the right', () => {
    const button = { left: 300, top: 507, width: 46, height: 44 };
    expect(placeMenu(button, row, menu, phone, 8)).toEqual({ left: 210, top: 399 });
  });
  it('is relative to the bounds', () => {
    const bounds = { left: 100, top: 50, width: 1280, height: 800 };
    const button = { left: 123, top: 165, width: 44, height: 44 };
    const rail = { left: 116, top: 110, width: 58, height: 400 };
    expect(placeMenu(button, rail, menu, bounds, 8)).toEqual({ left: 82, top: 115 });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/menu.test.ts`
Expected: FAIL, cannot find module `../src/lib/review/menu`.

- [ ] **Step 3: Implement**

Create `src/lib/review/menu.ts`:

```ts
/** Where a small menu opens next to the rail button that opened it. Pure, so it is tested without a page. */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The menu's top-left corner, relative to `bounds` (the box it is positioned in), `gap` pixels from what it opens from.
 * Rail in a column (laptop, phone on its side): to the right of the rail, level with the button.
 * Rail in a row (phone upright): above the button, or below it when there is no room above.
 * It never leaves the bounds.
 */
export function placeMenu(
  button: Box,
  rail: Box,
  menu: { width: number; height: number },
  bounds: Box,
  gap: number,
): { left: number; top: number } {
  const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max));
  const maxLeft = bounds.width - menu.width;
  const maxTop = bounds.height - menu.height;
  if (rail.height > rail.width) {
    return {
      left: clamp(rail.left + rail.width + gap - bounds.left, maxLeft),
      top: clamp(button.top - bounds.top, maxTop),
    };
  }
  const above = button.top - bounds.top - gap - menu.height;
  return {
    left: clamp(button.left - bounds.left, maxLeft),
    top: above >= 0 ? above : clamp(button.top + button.height + gap - bounds.top, maxTop),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/menu.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Full check and commit**

Run: `npm run check && npm test && npm run build`. Expected: no errors.

```bash
git add src/lib/review/menu.ts tests/menu.test.ts
git commit -m "Add the placement of the rail's arrow menu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4 · Copy  ·  Haiku

**Files:**
- Modify: `src/lib/i18n.ts`

- [ ] **Step 1: Spanish**

In the `es` object, right after the line `'review.arrow': 'Flecha',`, add:

```ts
  'review.arrowStraight': 'Flecha recta',
  'review.arrowFree': 'Flecha libre',
  'review.arrowStraightShort': 'Recta',
  'review.arrowFreeShort': 'Libre',
```

and replace the `'tour.draw.body'` line of `es` with:

```ts
  'tour.draw.body': 'Con el video en pausa elegí lápiz, flecha o círculo y el color. Con el pin, el dibujo queda aunque sigas reproduciendo.',
```

- [ ] **Step 2: Portuguese**

In the `pt` object, right after the line `'review.arrow': 'Seta',`, add:

```ts
  'review.arrowStraight': 'Seta reta',
  'review.arrowFree': 'Seta livre',
  'review.arrowStraightShort': 'Reta',
  'review.arrowFreeShort': 'Livre',
```

and replace the `'tour.draw.body'` line of `pt` with:

```ts
  'tour.draw.body': 'Com o vídeo pausado, escolha lápis, seta ou círculo e a cor. Com o alfinete, o desenho fica mesmo se você continuar reproduzindo.',
```

- [ ] **Step 3: Check and commit**

Run: `npm run check && npm test && npm run build`. Expected: no errors (`check` fails if `pt` misses a key).

```bash
git add src/lib/i18n.ts
git commit -m "Add the names of the two arrows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5 · ToolIcon and /design/  ·  Sonnet

**Files:**
- Create: `src/components/ToolIcon.astro`
- Modify: `src/pages/design.astro`

- [ ] **Step 1: The component**

Create `src/components/ToolIcon.astro`:

```astro
---
/**
 * One icon of the drawing rail (src/lib/review/icons.ts). Decorative: the button around it carries the name.
 * Its colour is the text colour; page.ts swaps the arrow button's drawing by replacing the svg's content.
 */
import { ICONS, type IconName } from '../lib/review/icons';

interface Props {
  name: IconName;
}

const { name } = Astro.props;
---

<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true" set:html={ICONS[name]}></svg>

<style>
  .tool-icon {
    width: 1.5rem;
    height: 1.5rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
```

- [ ] **Step 2: The /design/ section**

In `src/pages/design.astro`:

a) After `import TourOverlay from '../components/TourOverlay.astro';` add:

```ts
import ToolIcon from '../components/ToolIcon.astro';
import { cursorSvg, ICONS, type IconName } from '../lib/review/icons';
```

and, in the same frontmatter (after the imports), add:

```ts
const toolIcons = Object.keys(ICONS) as IconName[];
const cursorTools = ['pen', 'arrow', 'freeArrow', 'circle'] as const;
/** The cursors drawn with the tokens (the page builds them with the computed colours). */
const cursorColors = { ink: 'var(--c-ink)', paper: 'var(--c-paper)', accent: 'var(--c-yellow)' };
```

b) Right after `<TourOverlay lang="es" demo="capture" />` (still inside its `.wrap`), add:

```astro
    <h2 class="section-title">ToolIcon</h2>
    <p class="state">icons of the drawing rail on /review/ (src/lib/review/icons.ts)</p>
    <div class="row">
      {
        toolIcons.map((name) => (
          <figure class="icon-sample">
            <ToolIcon name={name} />
            <figcaption><code>{name}</code></figcaption>
          </figure>
        ))
      }
    </div>
    <p class="state">drawing cursors (32 px, shown at double size here): they take the colour in use (yellow here)</p>
    <div class="row cursor-samples">
      {
        cursorTools.map((tool) => (
          <figure class="icon-sample">
            <span class="cursor-sample" set:html={cursorSvg(tool, cursorColors)} />
            <figcaption><code>{tool}</code></figcaption>
          </figure>
        ))
      }
    </div>
```

c) In the page's `<style>`, after the `.review-frame.short { ... }` rule, add:

```css
  .icon-sample {
    margin: 0;
    display: grid;
    justify-items: center;
    gap: var(--s-1);
    padding: var(--s-2) var(--s-3);
    background: var(--c-paper);
    border: var(--border);
    border-radius: var(--radius);
  }
  .icon-sample code {
    font-size: 12px;
  }
  /* On the picture's own background, so the paper halo and the ink outline both show. */
  .cursor-samples .icon-sample {
    background: var(--c-ink);
    color: var(--c-white);
  }
  .cursor-sample :global(svg) {
    display: block;
    width: 64px;
    height: 64px;
  }
```

- [ ] **Step 3: Check and commit**

Run: `npm run check && npm test && npm run build`. Expected: no errors. Then `npm run dev` and open `http://localhost:4321/design/`: the ToolIcon section shows 7 icons and 4 cursors (yellow cone and badges on ink).

```bash
git add src/components/ToolIcon.astro src/pages/design.astro
git commit -m "Add the ToolIcon component and show icons and cursors on /design/

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6 · Rail markup and styles  ·  Sonnet

**Files:**
- Modify: `src/components/VideoReview.astro`

- [ ] **Step 1: Imports and the tools list**

In the frontmatter, after `import TourOverlay from './TourOverlay.astro';` add:

```ts
import ToolIcon from './ToolIcon.astro';
```

Delete the whole `const tools = [ ... ] as const;` block (pen, arrow and circle with their `icon` glyphs). The rail now writes its buttons out.

- [ ] **Step 2: The rail's buttons**

Replace the whole `<div class="tools"> ... </div>` (from `<div class="tools">` to the `</div>` right before `<div class="colors">`) with:

```astro
    <div class="tools">
      <button type="button" class="tool" data-action="tool" data-tool="pen" title={t(lang, 'review.pen')} aria-label={t(lang, 'review.pen')} aria-pressed="false">
        <ToolIcon name="pen" />
      </button>
      <button
        type="button"
        class="tool has-menu"
        data-action="arrow"
        data-tool="arrow"
        title={t(lang, 'review.arrowStraight')}
        aria-label={t(lang, 'review.arrowStraight')}
        aria-pressed={demo ? 'true' : 'false'}
        aria-haspopup="menu"
        aria-expanded="false"
        aria-controls="arrow-menu"
      >
        <ToolIcon name="arrow" />
      </button>
      <button type="button" class="tool" data-action="tool" data-tool="circle" title={t(lang, 'review.circle')} aria-label={t(lang, 'review.circle')} aria-pressed="false">
        <ToolIcon name="circle" />
      </button>
      <button type="button" class="tool" data-action="undo" title={t(lang, 'review.undo')} aria-label={t(lang, 'review.undo')}><ToolIcon name="undo" /></button>
      <button type="button" class="tool" data-action="clear" title={t(lang, 'review.clear')} aria-label={t(lang, 'review.clear')}><ToolIcon name="clear" /></button>
      <button type="button" class="tool" data-action="pin" title={t(lang, 'review.pin')} aria-label={t(lang, 'review.pin')} aria-pressed="false"><ToolIcon name="pin" /></button>
    </div>
```

- [ ] **Step 3: The menu**

Right after the rail's closing `</div>` (the line before `<div class="viewer" data-viewer>`), add:

```astro
  <div class="arrow-menu" id="arrow-menu" data-arrow-menu role="menu" aria-label={t(lang, 'review.arrow')} hidden>
    <button type="button" class="menu-item" role="menuitemradio" aria-checked="true" data-action="arrow-kind" data-kind="arrow" data-label={t(lang, 'review.arrowStraight')}>
      <ToolIcon name="arrow" /><span>{t(lang, 'review.arrowStraightShort')}</span>
    </button>
    <button type="button" class="menu-item" role="menuitemradio" aria-checked="false" data-action="arrow-kind" data-kind="freeArrow" data-label={t(lang, 'review.arrowFree')}>
      <ToolIcon name="freeArrow" /><span>{t(lang, 'review.arrowFreeShort')}</span>
    </button>
  </div>
```

- [ ] **Step 4: Styles**

In `<style>`, right after the rule `.tool[aria-pressed='true'] { background: var(--c-yellow); }`, add:

```css
  /* The arrow button opens a menu: a small ink corner says so. */
  .tool.has-menu {
    position: relative;
  }
  .tool.has-menu::after {
    content: '';
    position: absolute;
    right: 3px;
    bottom: 3px;
    width: 7px;
    height: 7px;
    background: var(--c-ink);
    clip-path: polygon(100% 0, 100% 100%, 0 100%);
  }
  /* Straight or free arrow. Outside the rail (which scrolls on a laptop); page.ts places it next to the button. */
  .arrow-menu {
    position: absolute;
    z-index: 25;
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    min-width: 11rem;
    padding: var(--s-1);
    background: var(--c-paper);
    border: var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  .arrow-menu[hidden] {
    display: none;
  }
  .menu-item {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    min-height: var(--hit);
    padding: 0 var(--s-3);
    font: 14px/1 var(--font-head);
    color: var(--c-ink);
    text-align: left;
    background: var(--c-white);
    border: 2px solid var(--c-ink);
    border-radius: 6px;
    cursor: pointer;
  }
  .menu-item span {
    flex: 1;
  }
  .menu-item[aria-checked='true'] {
    background: var(--c-yellow);
  }
  .menu-item[aria-checked='true']::after {
    content: '✓';
  }
```

Leave `canvas { cursor: crosshair; }` as it is: it is the fallback, and `page.ts` sets the real cursor inline.

- [ ] **Step 5: Check and commit**

Run: `npm run check && npm test && npm run build`. Expected: no errors. In `npm run dev`, `/design/` shows the review demo's rail with SVG icons and the ◢ corner on the arrow (pressed, yellow).

```bash
git add src/components/VideoReview.astro
git commit -m "Draw the review rail with SVG icons and add the arrow menu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 7 · Wiring in page.ts  ·  Sonnet

**Files:**
- Modify: `src/lib/review/page.ts`

No unit test: `page.ts` is DOM glue (the tests run without a DOM). The logic it uses is tested in tasks 1 to 3; Task 8 checks it in the browser.

- [ ] **Step 1: Imports and the canvas**

After `import { Sketch, type Tool } from './draw';` add:

```ts
import { cursorFor, ICONS } from './icons';
import { placeMenu } from './menu';
```

Replace `const sketch = new Sketch($<HTMLCanvasElement>('[data-sketch]'));` with:

```ts
  const sketchCanvas = $<HTMLCanvasElement>('[data-sketch]');
  const sketch = new Sketch(sketchCanvas);
```

- [ ] **Step 2: Arrow menu, cursor and tool**

In the `// --- Drawing ---` section, replace the whole `function setTool(tool: Tool | null) { ... }` with:

```ts
  const rail = $('.rail');
  const arrowButton = $('[data-action="arrow"]');
  const arrowMenu = $('[data-arrow-menu]');
  /** The arrow the arrow button turns on: the last one picked in its menu (straight at first). */
  let lastArrow: Tool = 'arrow';
  const isArrow = (tool: Tool | null) => tool === 'arrow' || tool === 'freeArrow';

  function setTool(tool: Tool | null) {
    sketch.tool = sketch.tool === tool ? null : tool;
    root.dataset.tool = sketch.tool ?? '';
    for (const b of root.querySelectorAll<HTMLElement>('[data-tool]')) {
      b.setAttribute('aria-pressed', String(b.dataset.tool === sketch.tool));
    }
    setArrowMenu(false);
    paintCursor();
    if (sketch.tool) {
      video.pause();
      ensureOpened();
    }
  }

  /** The page's colours for the cursor: an SVG cursor cannot read CSS variables. */
  function cursorColors() {
    const css = getComputedStyle(root);
    return { ink: css.getPropertyValue('--c-ink').trim(), paper: css.getPropertyValue('--c-paper').trim(), accent: sketch.color };
  }

  /** Over the picture, the pointer shows the tool in use and its colour; without a tool, the CSS cursors. */
  function paintCursor() {
    sketchCanvas.style.cursor = sketch.tool ? cursorFor(sketch.tool, cursorColors()) : '';
  }

  /** Opens the straight / free menu next to the arrow button (to the side of a column rail, above a row). */
  function setArrowMenu(open: boolean) {
    if (arrowMenu.hidden === !open) return;
    arrowMenu.hidden = !open;
    arrowButton.setAttribute('aria-expanded', String(open));
    if (!open) return;
    const gap = parseFloat(getComputedStyle(root).getPropertyValue('--s-2')) || 8;
    const place = placeMenu(
      arrowButton.getBoundingClientRect(),
      rail.getBoundingClientRect(),
      { width: arrowMenu.offsetWidth, height: arrowMenu.offsetHeight },
      root.getBoundingClientRect(),
      gap,
    );
    arrowMenu.style.left = `${place.left}px`;
    arrowMenu.style.top = `${place.top}px`;
  }

  /** The arrow button shows, names and turns on the arrow picked in the menu. */
  function setArrow(kind: Tool) {
    lastArrow = kind;
    const item = arrowMenu.querySelector<HTMLElement>(`[data-kind="${kind}"]`)!;
    arrowButton.dataset.tool = kind;
    arrowButton.title = item.dataset.label!;
    arrowButton.setAttribute('aria-label', item.dataset.label!);
    arrowButton.querySelector('svg')!.innerHTML = ICONS[kind];
    for (const i of arrowMenu.querySelectorAll<HTMLElement>('[data-kind]')) i.setAttribute('aria-checked', String(i === item));
  }
```

- [ ] **Step 3: The cursor follows the colour**

In `function setColor(color: string)`, add `paintCursor();` as its last line (after the `for` loop).

- [ ] **Step 4: Actions**

In the `actions` object, right after the line `tool: (b) => setTool(b.dataset.tool as Tool),`, add:

```ts
    // Off: turns on the last arrow. On: opens the straight / free menu, with the focus on the arrow in use.
    arrow: () => {
      if (!isArrow(sketch.tool)) return setTool(lastArrow);
      const open = arrowMenu.hidden;
      setArrowMenu(open);
      if (open) arrowMenu.querySelector<HTMLElement>('[aria-checked="true"]')!.focus();
    },
    'arrow-kind': (b) => {
      const kind = b.dataset.kind as Tool;
      const fromKeyboard = b.matches(':focus-visible');
      setArrow(kind);
      setArrowMenu(false);
      if (sketch.tool !== kind) setTool(kind);
      if (fromKeyboard) arrowButton.focus();
    },
```

- [ ] **Step 5: A tap outside closes the menu**

In `document.addEventListener('pointerdown', (e) => { ... })`, right after `const target = e.target as Element;`, add:

```ts
    if (!arrowMenu.hidden && !target.closest('[data-arrow-menu], [data-action="arrow"]')) {
      setArrowMenu(false);
      swallowNextTap();
    }
```

After that listener, add:

```ts
  // The menu is placed for the layout it opened in.
  window.addEventListener('resize', () => setArrowMenu(false));
```

- [ ] **Step 6: Keyboard**

In `document.addEventListener('keydown', (e) => { ... })`, right after `const target = e.target as HTMLElement;`, add:

```ts
    // Escape puts away the arrow menu first and gives the focus back to its button.
    if (e.key === 'Escape' && !arrowMenu.hidden) {
      setArrowMenu(false);
      arrowButton.focus();
      return;
    }
    // In the arrow menu, ↑ and ↓ go between the two arrows, and Enter or Space press the button; no shortcut runs.
    if (target.closest('[data-arrow-menu]')) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = [...arrowMenu.querySelectorAll<HTMLElement>('[data-kind]')];
        const i = items.indexOf(target.closest<HTMLElement>('[data-kind]')!);
        items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
      }
      return;
    }
```

- [ ] **Step 7: Check and commit**

Run: `npm run check && npm test && npm run build`. Expected: no errors.

```bash
git add src/lib/review/page.ts
git commit -m "Wire the arrow menu and the drawing cursor on the review page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 8 · Browser check and screenshots  ·  Opus

No commit unless a fix is needed. The Google login covers `/review/`, so the script sets `data-signed-in="true"` (what a real sign-in does), and it marks the tour as seen so the tour does not open.

- [ ] **Step 1: A test clip**

Headless Chromium has no H.264, so use VP9:

```bash
SCRATCH=/tmp/claude-1000/-home-rodri-Repos-Linux-surftriplapedre/<session>/scratchpad
ffmpeg -y -f lavfi -i testsrc=duration=4:size=640x360:rate=30 -c:v libvpx-vp9 "$SCRATCH/clip.webm"
```

(`<session>` is this session's scratchpad folder; use the real path.)

- [ ] **Step 2: The check script**

Write `$SCRATCH/cursor-check.mjs` (not committed):

```js
// Checks the arrow menu, the cursors and the free arrow on /review/: node cursor-check.mjs <base-url> <out-folder> <clip>
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const [base, out, clip] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const sizes = {
  laptop: { width: 1280, height: 800 },
  short: { width: 1280, height: 640 },
  phone: { width: 390, height: 844 },
  landscape: { width: 844, height: 390 },
};
const browser = await chromium.launch();
for (const [name, viewport] of Object.entries(sizes)) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() =>
    localStorage.setItem('surftrip-review-tour', JSON.stringify({ intro: true, tools: true, upload: true })),
  );
  const page = await context.newPage();
  const errors = [];
  const seen = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/review/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => (document.querySelector('[data-review]').dataset.signedIn = 'true'));
  await page.setInputFiles('[data-files]', clip);
  await page.waitForSelector('[data-review][data-view="ready"]');

  const arrow = page.locator('[data-action="arrow"]');
  const menu = page.locator('[data-arrow-menu]');
  const cursor = () => page.$eval('[data-sketch]', (c) => c.style.cursor);

  // First tap: the straight arrow, with its cursor.
  await arrow.click();
  seen.push(`pressed: ${await arrow.getAttribute('aria-pressed')}, menu: ${await menu.isVisible()}`);
  seen.push(`cursor: ${(await cursor()).slice(0, 26)}… ${(await cursor()).slice(-16)}`);

  // Second tap: the menu, next to the button.
  await arrow.click();
  const a = await arrow.boundingBox();
  const m = await menu.boundingBox();
  seen.push(`menu open: ${await menu.isVisible()}, ${m.y + m.height <= a.y ? 'above' : m.x >= a.x + a.width ? 'right' : 'OTHER'}`);
  await page.screenshot({ path: `${out}/${name}-menu.png` });

  // Libre: the button changes, the menu closes.
  await page.click('[data-kind="freeArrow"]');
  seen.push(`picked: ${await arrow.getAttribute('data-tool')} "${await arrow.getAttribute('aria-label')}", menu: ${await menu.isVisible()}`);

  // A free arrow, drawn with the mouse.
  const box = await page.locator('[data-sketch]').boundingBox();
  const at = (x, y) => [box.x + box.width * x, box.y + box.height * y];
  await page.mouse.move(...at(0.2, 0.7));
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(...at(0.2 + i * 0.025, 0.7 - Math.sin(i / 3) * 0.25), { steps: 2 });
  await page.mouse.up();
  await page.screenshot({ path: `${out}/${name}-free-arrow.png` });

  // Red: the cursor's colour follows.
  await page.click('[data-action="color"]');
  seen.push(`red in cursor: ${(await cursor()).includes('%23e4261c')}`);

  // Keyboard: Enter on the active arrow opens the menu on the checked item, ↓ moves, Esc closes on the button.
  await arrow.focus();
  await page.keyboard.press('Enter');
  const focused = () => page.evaluate(() => document.activeElement?.dataset.kind ?? document.activeElement?.dataset.action);
  seen.push(`keyboard open: ${await menu.isVisible()} on ${await focused()}`);
  await page.keyboard.press('ArrowDown');
  seen.push(`↓ on ${await focused()}`);
  await page.keyboard.press('Escape');
  seen.push(`esc: menu ${await menu.isVisible()}, focus ${await focused()}, tool still ${await arrow.getAttribute('aria-pressed')}`);

  // Pen: pencil cursor; no tool: the CSS cursor again.
  await page.click('[data-tool="pen"]');
  seen.push(`pen cursor hotspot: ${(await cursor()).endsWith('3 29, crosshair')}`);
  await page.keyboard.press('Escape');
  seen.push(`no tool, inline cursor: "${await cursor()}"`);

  console.log(`\n${name}\n  ${seen.join('\n  ')}${errors.length ? `\n  ERRORS: ${errors.join(' | ')}` : ''}`);
  await context.close();
}
await browser.close();
```

- [ ] **Step 3: Run it**

```bash
npm run dev &   # http://localhost:4321
node "$SCRATCH/cursor-check.mjs" http://localhost:4321 "$SCRATCH/cursors" "$SCRATCH/clip.webm"
```

Expected per viewport:
- `pressed: true, menu: false`
- `cursor: url("data:image/svg+xml,… 9 9, crosshair`
- `menu open: true`, with `right` on laptop, short and landscape, and `above` on phone
- `picked: freeArrow "Flecha libre", menu: false`
- `red in cursor: true`
- `keyboard open: true on freeArrow`, then `↓ on arrow`, then `esc: menu false, focus arrow, tool still true`
- `pen cursor hotspot: true`
- `no tool, inline cursor: ""`
- no ERRORS

Look at every `*-menu.png` (menu next to the button, not cut, over the picture on the phone) and `*-free-arrow.png` (a curved line ending in a head that points along the end of the stroke).

- [ ] **Step 4: The cursor on screen**

Headless screenshots do not include the mouse pointer. Open `http://localhost:4321/review/` in a desktop browser (run `localStorage.setItem('surftrip-review-tour', '{"intro":true,"tools":true,"upload":true}')` and set `data-signed-in="true"` on `[data-review]` in the console, or sign in), load a clip and check by eye: pencil and cross cursors in the three colours, over dark water and over foam.

- [ ] **Step 5: Screenshots of the pages**

```bash
npm run shots -- http://localhost:4321 "$SCRATCH/shots" /design/ /review/ /pt/review/
```

Look at them: the rail icons and the ◢ corner on `/design/` (the demo) at 390 px and 1280 px, and the ToolIcon section (7 icons, 4 cursors). `/pt/review/` only shows the login, which is expected.

- [ ] **Step 6: Close**

`verification-before-completion` → `requesting-code-review` → `finishing-a-development-branch`. Ask the owner before pushing or opening the PR. Tell them that PR #17 also changes the rail, so whichever merges second rebases.

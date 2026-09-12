/**
 * Progressive enhancement for the homepage.
 *
 * All content and navigation already exist in the HTML. This module only adds
 * decorative canvas particles, a shared background transition and desktop
 * wheel paging. Touch, keyboard and short/overflow layouts remain native.
 */

import { WheelNotchTracker, clampPage } from "./home-paging";

const root = document.documentElement;
const body = document.body;
const stage = document.querySelector<HTMLElement>("[data-motion-stage]");
const canvas = document.querySelector<HTMLCanvasElement>(
  "[data-motion-canvas]",
);
const background = document.querySelector<HTMLElement>(
  "[data-motion-background]",
);
const scenes = [
  ...document.querySelectorAll<HTMLElement>("[data-motion-scene]"),
];
const logos = [...document.querySelectorAll<HTMLElement>("[data-motion-logo]")];
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const coarse = matchMedia("(pointer: coarse)");
const fine = matchMedia("(hover: hover) and (pointer: fine)");
const header = document.querySelector<HTMLElement>(".site-header");
const nav = document.querySelector<HTMLElement>("#site-navigation");

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
};
const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

type Box = { left: number; right: number; top: number; bottom: number };

/* ------------------------------------------------------------------ */
/* Particle palette (precomputed strings, no per-frame colour parsing) */
/* ------------------------------------------------------------------ */

const PALETTE_STEPS = 24;
const palette: string[] = [];
for (let step = 0; step <= PALETTE_STEPS; step += 1) {
  const amount = step / PALETTE_STEPS;
  const red = Math.round(255 + (18 - 255) * amount);
  const green = Math.round(255 + (82 - 255) * amount);
  const blue = Math.round(255 + (132 - 255) * amount);
  palette.push(`rgb(${red},${green},${blue})`);
}
const UNDERLINE_COLOR = "rgb(251, 57, 77)";

/* Idle motion is bucketed so no per-particle trigonometry is required. */
const DRIFT_OMEGA = [9, 10.5, 12, 13.5].map((period) => (Math.PI * 2) / period);
const SPIN_SPEEDS = [0, -0.12, 0.07, 0.12, -0.06];

let particleCount = 0;
let particleX = new Float32Array(0);
let particleY = new Float32Array(0);
let particleSeed = new Float32Array(0);
let particleRadius = new Float32Array(0);
let particleUnderline = new Uint8Array(0);
let particlePhaseCos = new Float32Array(0);
let particlePhaseSin = new Float32Array(0);
let particleDriftBucket = new Uint8Array(0);
let particleAmplitude = new Float32Array(0);
let particleSpinBucket = new Uint8Array(0);

const driftCos = new Float64Array(DRIFT_OMEGA.length);
const driftSin = new Float64Array(DRIFT_OMEGA.length);
const spinCos = new Float64Array(SPIN_SPEEDS.length);
const spinSin = new Float64Array(SPIN_SPEEDS.length);

let context: CanvasRenderingContext2D | null = null;
try {
  context = canvas?.getContext("2d") ?? null;
} catch {
  /* The static brand logo remains available. */
}

const logo = new Image();
let frame = 0;
let running = false;
let oversized = false;
let live = false;
let mobileSample = false;

/* Cached document-space layout. Never read layout inside the draw loop. */
let anchors: number[] = [];
let stageTop = 0;
let stageBottom = 0;
let heroBox: Box | null = null;
let closingBox: Box | null = null;
let textBoxes: Box[] = [];
let sceneFades: number[] = [];
let paperOpacity = -1;
let lastClip = "";
let pointerX = 0;
let pointerY = 0;

function stopLoop() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  running = false;
}

function canRender() {
  if (!stage || !canvas || !context || particleCount === 0) {
    if (canvas) canvas.hidden = true;
    return false;
  }
  if (reduced.matches || oversized || document.hidden) {
    canvas.hidden = true;
    return false;
  }
  const top = stageTop - scrollY;
  const bottom = stageBottom - scrollY;
  const visible = bottom > 0 && top < innerHeight;
  canvas.hidden = !visible;
  return visible;
}

function schedule() {
  if (!canRender()) {
    stopLoop();
    return;
  }
  if (!running) {
    running = true;
    frame = requestAnimationFrame(tick);
  }
}

function tick(now: number) {
  frame = 0;
  if (!canRender()) {
    running = false;
    return;
  }
  if (draw(now)) frame = requestAnimationFrame(tick);
  else running = false;
}

function boxOf(element: Element | null): Box | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    right: rect.right,
    top: rect.top + scrollY,
    bottom: rect.bottom + scrollY,
  };
}

function measureLayout() {
  anchors = scenes.map((scene) => scene.getBoundingClientRect().top + scrollY);
  const stageRect = stage?.getBoundingClientRect();
  stageTop = stageRect ? stageRect.top + scrollY : 0;
  stageBottom = stageRect ? stageRect.bottom + scrollY : innerHeight;
  heroBox = boxOf(logos[0] ?? null);
  closingBox = boxOf(logos[1] ?? null);
  textBoxes = scenes
    .map((scene) =>
      boxOf(scene.querySelector<HTMLElement>(".motion-scene-content")),
    )
    .filter((box): box is Box => box !== null);
  if (sceneFades.length !== scenes.length) sceneFades = scenes.map(() => -1);
}

function paperAt(y: number) {
  const first = anchors[0];
  const middle = anchors[1];
  const last = anchors[2];
  if (first === undefined || middle === undefined || last === undefined)
    return 0;
  if (y <= first) return 0;
  if (y < middle)
    return smooth(((y - first) / Math.max(1, middle - first) - 0.5) / 0.3);
  if (y < last)
    return 1 - smooth(((y - middle) / Math.max(1, last - middle) - 0.5) / 0.3);
  return 0;
}

function updateBackground(force = false) {
  const next = paperAt(scrollY);
  if (!force && Math.abs(next - paperOpacity) < 0.002) return;
  paperOpacity = next;
  if (background) background.style.opacity = String(next);
}

function updateSceneFades(force = false) {
  for (const [index, scene] of scenes.entries()) {
    const anchor = anchors[index];
    if (anchor === undefined) continue;
    const distance = Math.abs(scrollY - anchor) / Math.max(1, innerHeight);
    const fade = Math.round((1 - smooth((distance - 0.25) / 0.5)) * 100) / 100;
    if (!force && Math.abs(fade - (sceneFades[index] ?? -1)) < 0.01) continue;
    sceneFades[index] = fade;
    scene.style.setProperty("--scene-fade", String(fade));
  }
}

function updateCanvasClip() {
  if (!canvas) return;
  if (stageBottom - scrollY <= 0 || stageTop - scrollY >= innerHeight) {
    if (lastClip === "inset(100% 0 0 0)") return;
    lastClip = "inset(100% 0 0 0)";
    canvas.style.clipPath = lastClip;
    return;
  }
  const top = Math.max(0, stageTop - scrollY);
  const bottom = Math.max(0, innerHeight - (stageBottom - scrollY));
  const clip = `inset(${top.toFixed(1)}px 0 ${bottom.toFixed(1)}px 0)`;
  if (clip === lastClip) return;
  lastClip = clip;
  canvas.style.clipPath = clip;
}

function updateCanvasSize() {
  if (!canvas || !context) return;
  const ratio = Math.min(
    devicePixelRatio || 1,
    innerWidth < 700 || coarse.matches ? 1.5 : 2,
  );
  const width = Math.round(innerWidth * ratio);
  const height = Math.round(innerHeight * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
}

function clearParticles() {
  particleCount = 0;
  sceneFades = [];
  applyLive(true);
  schedule();
}

function sampleLogo() {
  if (!context || !logo.naturalWidth) return;
  try {
    const sample = document.createElement("canvas");
    mobileSample = innerWidth < 700 || coarse.matches;
    sample.width = mobileSample ? 420 : 640;
    sample.height = Math.round(
      (sample.width * logo.naturalHeight) / logo.naturalWidth,
    );
    const sampleContext = sample.getContext("2d");
    if (!sampleContext) return;
    sampleContext.drawImage(logo, 0, 0, sample.width, sample.height);
    const pixels = sampleContext.getImageData(
      0,
      0,
      sample.width,
      sample.height,
    ).data;
    const xs: number[] = [];
    const ys: number[] = [];
    const seeds: number[] = [];
    const radii: number[] = [];
    const underlines: number[] = [];
    const phaseCos: number[] = [];
    const phaseSin: number[] = [];
    const drift: number[] = [];
    const amplitudes: number[] = [];
    const spins: number[] = [];
    const baseRadius = mobileSample ? 1.1 : 1.6;
    let index = 0;
    for (let y = 0; y < sample.height; y += 3) {
      for (let x = 0; x < sample.width; x += 3) {
        const offset = (y * sample.width + x) * 4;
        // The source mark has an opaque white background. Only the red
        // underline is coloured; the rest of the mark stays white.
        if (
          pixels[offset + 3] < 80 ||
          pixels[offset] + pixels[offset + 1] + pixels[offset + 2] >= 700
        )
          continue;
        const random = Math.sin(index * 127.1 + 311.7) * 43758.5453;
        const seed = random - Math.floor(random);
        const phase = seed * Math.PI * 2;
        const underline =
          x / sample.width < 0.16 && y / sample.height > 0.8 ? 1 : 0;
        xs.push(x / sample.width - 0.5);
        ys.push((y - sample.height / 2) / sample.width);
        seeds.push(seed);
        radii.push(baseRadius + seed * 0.4);
        underlines.push(underline);
        phaseCos.push(Math.cos(phase));
        phaseSin.push(Math.sin(phase));
        drift.push(
          Math.min(
            DRIFT_OMEGA.length - 1,
            Math.floor(seed * DRIFT_OMEGA.length),
          ),
        );
        amplitudes.push(6 + seed * 6);
        // The brand underline stays crisp; only a subset of white points spin.
        spins.push(
          underline || seed < 0.42
            ? 0
            : 1 + (Math.floor(seed * 71) % (SPIN_SPEEDS.length - 1)),
        );
        index += 1;
      }
    }
    particleCount = xs.length;
    particleX = Float32Array.from(xs);
    particleY = Float32Array.from(ys);
    particleSeed = Float32Array.from(seeds);
    particleRadius = Float32Array.from(radii);
    particleUnderline = Uint8Array.from(underlines);
    particlePhaseCos = Float32Array.from(phaseCos);
    particlePhaseSin = Float32Array.from(phaseSin);
    particleDriftBucket = Uint8Array.from(drift);
    particleAmplitude = Float32Array.from(amplitudes);
    particleSpinBucket = Uint8Array.from(spins);
    sceneFades = scenes.map(() => -1);
    applyLive(true);
    schedule();
  } catch {
    clearParticles();
  }
}

function applyLive(force = false) {
  const next = particleCount > 0 && !reduced.matches && !oversized;
  if (!force && next === live) return;
  live = next;
  root.classList.toggle("motion-live", live);
  if (canvas) canvas.hidden = !live;
  if (live) {
    updateBackground(true);
    updateSceneFades(true);
  } else {
    paperOpacity = -1;
    sceneFades = scenes.map(() => -1);
    if (background) background.style.opacity = "";
    for (const scene of scenes) scene.style.removeProperty("--scene-fade");
    lastClip = "";
    if (canvas) canvas.style.clipPath = "";
  }
  schedule();
}

function draw(now: number): boolean {
  if (!context || !stage) return false;
  const width = innerWidth;
  const height = innerHeight;
  updateBackground();
  updateSceneFades();
  updateCanvasClip();

  const first = anchors[0] ?? 0;
  const last = anchors[2] ?? first + height * 2;
  const progress = clamp((scrollY - first) / Math.max(1, last - first));
  const spread =
    smooth((progress - 0.1) / 0.32) * (1 - smooth((progress - 0.65) / 0.3));
  const finish = smooth((progress - 0.75) / 0.2);
  const exitOpacity =
    1 - smooth(Math.max(0, scrollY - last) / Math.min(180, height * 0.2));
  const paper = paperOpacity < 0 ? paperAt(scrollY) : paperOpacity;
  const blend = smooth((paper - 0.4) / 0.2);
  const fill = palette[Math.round(blend * PALETTE_STEPS)] ?? "rgb(255,255,255)";

  let centerX: number;
  let centerY: number;
  let size: number;
  if (heroBox && closingBox) {
    centerX = lerp(
      (heroBox.left + heroBox.right) / 2,
      (closingBox.left + closingBox.right) / 2,
      finish,
    );
    const heroCenterY = (heroBox.top + heroBox.bottom) / 2 - (anchors[0] ?? 0);
    const closingCenterY =
      (closingBox.top + closingBox.bottom) / 2 - (anchors[2] ?? 0);
    centerY =
      lerp(heroCenterY, closingCenterY, finish) - Math.max(0, scrollY - last);
    size = lerp(
      heroBox.right - heroBox.left,
      closingBox.right - closingBox.left,
      finish,
    );
  } else {
    centerX = width * 0.5;
    centerY = height * 0.36;
    size = width * (mobileSample ? 0.92 : 0.59);
  }

  const time = now / 1000;
  const heroWeight = 1 - smooth(progress / 0.3);
  centerY += Math.sin(time * ((Math.PI * 2) / 7)) * 3 * heroWeight;
  if (fine.matches) {
    centerX += pointerX * 5 * heroWeight;
    centerY += pointerY * 5 * heroWeight;
  }

  for (let i = 0; i < DRIFT_OMEGA.length; i += 1) {
    const angle = time * (DRIFT_OMEGA[i] ?? 0);
    driftCos[i] = Math.cos(angle);
    driftSin[i] = Math.sin(angle);
  }
  for (let i = 0; i < SPIN_SPEEDS.length; i += 1) {
    const angle = time * (SPIN_SPEEDS[i] ?? 0);
    spinCos[i] = Math.cos(angle);
    spinSin[i] = Math.sin(angle);
  }
  const spreadAngle = progress * 2.7;
  const spreadCos = Math.cos(spreadAngle);
  const spreadSin = Math.sin(spreadAngle);

  context.clearRect(0, 0, width, height);
  // Clear the final image once, then leave fully transparent particles idle.
  if (exitOpacity === 0) return false;
  context.globalAlpha = exitOpacity;
  let lastFill = "";
  for (let i = 0; i < particleCount; i += 1) {
    const seed = particleSeed[i] ?? 0;
    const phaseCos = particlePhaseCos[i] ?? 0;
    const phaseSin = particlePhaseSin[i] ?? 0;
    let x = centerX + (particleX[i] ?? 0) * size;
    let y = centerY + (particleY[i] ?? 0) * size;
    if (spread > 0) {
      const distance = spread * (width * 0.4 + seed * height * 0.22);
      const cosA = spreadCos * phaseCos - spreadSin * phaseSin;
      const sinA = spreadSin * phaseCos + spreadCos * phaseSin;
      x += cosA * distance;
      y += sinA * distance;
    }
    if (spread > 0.01) {
      const bucket = particleDriftBucket[i] ?? 0;
      const dc = driftCos[bucket] ?? 0;
      const ds = driftSin[bucket] ?? 0;
      const amplitude = particleAmplitude[i] ?? 0;
      x += (ds * phaseCos + dc * phaseSin) * amplitude * spread;
      y += (dc * phaseCos - ds * phaseSin) * amplitude * spread;
    }
    if (x < -4 || x > width + 4 || y < -4 || y > height + 4) continue;
    let blocked = false;
    for (const box of textBoxes) {
      if (
        x > box.left - 12 &&
        x < box.right + 12 &&
        y > box.top - scrollY - 12 &&
        y < box.bottom - scrollY + 12
      ) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    const spinBucket = particleSpinBucket[i] ?? 0;
    const spinC = spinCos[spinBucket] ?? 1;
    const spinS = spinSin[spinBucket] ?? 0;
    const scatteredCos = spinC * phaseCos - spinS * phaseSin;
    const scatteredSin = spinS * phaseCos + spinC * phaseSin;
    const rotationCos = particleUnderline[i]
      ? 1
      : lerp(1, scatteredCos, spread);
    const rotationSin = particleUnderline[i]
      ? 0
      : lerp(0, scatteredSin, spread);
    const radius = particleRadius[i] ?? 1;
    const color = particleUnderline[i] ? UNDERLINE_COLOR : fill;
    if (color !== lastFill) {
      context.fillStyle = color;
      lastFill = color;
    }
    // Tiny independent paths avoid the expensive tessellation of one large
    // compound path while preserving the original triangular particles.
    context.beginPath();
    context.moveTo(x + radius * rotationSin, y - radius * rotationCos);
    context.lineTo(
      x + radius * rotationCos - radius * rotationSin,
      y + radius * rotationSin + radius * rotationCos,
    );
    context.lineTo(
      x - radius * rotationCos - radius * rotationSin,
      y - radius * rotationSin + radius * rotationCos,
    );
    context.closePath();
    context.fill();
  }
  context.globalAlpha = 1;
  // Scroll and layout listeners schedule the next paint for static scenes.
  return spread > 0 || heroWeight > 0;
}

/* ------------------------------------------------------------------ */
/* Desktop wheel paging.                                              */
/* ------------------------------------------------------------------ */

const WHEEL_ANIMATION_MS = 520;
let wheelTarget = 0;
let wheelAnimationFrame = 0;
const wheelTracker = new WheelNotchTracker();

function cancelWheelAnimation() {
  if (wheelAnimationFrame) cancelAnimationFrame(wheelAnimationFrame);
  wheelAnimationFrame = 0;
}

function pageTargets() {
  return [
    ...anchors,
    Math.max(0, document.documentElement.scrollHeight - innerHeight),
  ];
}

function animateToPage(page: number) {
  const targets = pageTargets();
  const target = targets[clampPage(page, targets.length)] ?? 0;
  const from = scrollY;
  const started = performance.now();
  cancelWheelAnimation();
  const step = (now: number) => {
    const amount = clamp((now - started) / WHEEL_ANIMATION_MS);
    const eased = 1 - (1 - amount) ** 4;
    scrollTo({ top: from + (target - from) * eased, behavior: "instant" });
    if (amount < 1) wheelAnimationFrame = requestAnimationFrame(step);
    else {
      wheelAnimationFrame = 0;
    }
  };
  wheelAnimationFrame = requestAnimationFrame(step);
}

function onWheel(event: WheelEvent) {
  if (
    event.ctrlKey ||
    event.metaKey ||
    Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
    reduced.matches ||
    oversized ||
    !fine.matches ||
    !stage ||
    nav?.classList.contains("is-open") ||
    isNativeScrollableTarget(event.target)
  ) {
    return;
  }
  const now = performance.now();
  const direction = wheelTracker.consume(event, innerHeight, now);
  if (!direction) {
    event.preventDefault();
    return;
  }
  const targets = pageTargets();
  if (!targets.length) return;
  if (!wheelAnimationFrame) {
    const nearest = targets.reduce(
      (best, value, index) =>
        Math.abs(value - scrollY) < Math.abs(targets[best] - scrollY)
          ? index
          : best,
      0,
    );
    wheelTarget = nearest;
  }
  wheelTarget = clampPage(wheelTarget + direction, targets.length);
  animateToPage(wheelTarget);
  event.preventDefault();
}

function isNativeScrollableTarget(target: EventTarget | null) {
  let element = target instanceof Element ? target : null;
  while (element && element !== document.documentElement) {
    if (element.matches("input, textarea, select, [contenteditable='true']"))
      return true;
    const style = getComputedStyle(element);
    const scrollable = /(auto|scroll|overlay)/.test(style.overflowY);
    if (scrollable && element.scrollHeight > element.clientHeight + 1)
      return true;
    element = element.parentElement;
  }
  return false;
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType !== "touch") cancelWheelAnimation();
}

function onKeyboardInput() {
  cancelWheelAnimation();
}

function onFocusIn() {
  cancelWheelAnimation();
}

function updateLayout() {
  // Measure the natural layout; overflowing scenes grow and fall back.
  root.classList.remove("motion-overflow");
  const viewport = Math.min(
    innerHeight,
    window.visualViewport?.height ?? innerHeight,
  );
  const largeText = parseFloat(getComputedStyle(root).fontSize) > 20;
  oversized =
    viewport < 550 ||
    largeText ||
    scenes.some((scene) => scene.scrollHeight > viewport + 2);
  root.classList.toggle("motion-overflow", oversized);
  root.classList.toggle("motion-reduced", reduced.matches);
  const headerSpace = Math.max(96, (header?.offsetHeight ?? 80) + 32);
  // Expanded menus are overlays; their height must not resize every scene.
  if (!nav?.classList.contains("is-open"))
    root.style.setProperty("--motion-header-space", `${headerSpace}px`);
  updateCanvasSize();
  measureLayout();
  if (
    logo.naturalWidth &&
    mobileSample !== (innerWidth < 700 || coarse.matches)
  )
    sampleLogo();
  applyLive();
  schedule();
}

if (stage && scenes.length === 3) {
  body.classList.add("motion-js");
  const observer = new ResizeObserver(updateLayout);
  scenes.forEach((scene) => observer.observe(scene));
  if (header) observer.observe(header);
  if (nav)
    new MutationObserver(() => {
      if (nav.classList.contains("is-open")) cancelWheelAnimation();
      root.classList.toggle(
        "motion-menu-open",
        nav.classList.contains("is-open"),
      );
      updateLayout();
    }).observe(nav, { attributes: true, attributeFilter: ["class"] });

  addEventListener("scroll", schedule, { passive: true });
  addEventListener("wheel", onWheel, { passive: false });
  addEventListener("touchstart", cancelWheelAnimation, { passive: true });
  addEventListener("touchend", cancelWheelAnimation, { passive: true });
  addEventListener("touchcancel", cancelWheelAnimation, { passive: true });
  addEventListener("pointerdown", onPointerDown, { passive: true });
  addEventListener(
    "pointermove",
    (event) => {
      if (!fine.matches || event.pointerType === "touch") return;
      pointerX = Math.max(
        -1,
        Math.min(1, (event.clientX / innerWidth - 0.5) * 2),
      );
      pointerY = Math.max(
        -1,
        Math.min(1, (event.clientY / innerHeight - 0.5) * 2),
      );
    },
    { passive: true },
  );
  addEventListener(
    "pointerleave",
    () => {
      pointerX = 0;
      pointerY = 0;
    },
    { passive: true },
  );
  document.addEventListener("keydown", onKeyboardInput);
  document.addEventListener("focusin", onFocusIn);
  addEventListener("popstate", onKeyboardInput);
  addEventListener("hashchange", onKeyboardInput);
  addEventListener(
    "resize",
    () => {
      cancelWheelAnimation();
      updateLayout();
    },
    { passive: true },
  );
  window.visualViewport?.addEventListener(
    "resize",
    () => {
      cancelWheelAnimation();
      updateLayout();
    },
    { passive: true },
  );
  reduced.addEventListener("change", () => {
    cancelWheelAnimation();
    updateLayout();
  });
  document.addEventListener("visibilitychange", () => {
    cancelWheelAnimation();
    schedule();
  });
  addEventListener("pagehide", () => {
    cancelWheelAnimation();
    stopLoop();
  });
  addEventListener("pageshow", () => {
    cancelWheelAnimation();
    updateLayout();
  });
  document.fonts?.ready
    .then(() => {
      measureLayout();
      schedule();
    })
    .catch(() => {
      /* Font metrics are not required. */
    });
  logo.onload = sampleLogo;
  logo.onerror = clearParticles;
  updateLayout();
  if (context) logo.src = "/brand/empact-logo-blue.png";
}

/** Progressive enhancement: all content and navigation already exist in HTML. */
const root = document.documentElement;
const stage = document.querySelector<HTMLElement>("[data-motion-stage]");
const canvas = document.querySelector<HTMLCanvasElement>(
  "[data-motion-canvas]",
);
const scenes = [
  ...document.querySelectorAll<HTMLElement>("[data-motion-scene]"),
];
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const coarse = matchMedia("(pointer: coarse)");
const header = document.querySelector<HTMLElement>(".site-header");
const nav = document.querySelector<HTMLElement>("#site-navigation");
const preview = document.querySelector<HTMLElement>(".preview-bar");
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
};

type Particle = { x: number; y: number; seed: number; underline: boolean };
let context: CanvasRenderingContext2D | null = null;
try {
  context = canvas?.getContext("2d") ?? null;
} catch {
  /* Static logo remains available. */
}
let points: Particle[] = [];
let frame = 0;
let oversized = false;
let hidden = document.hidden;
let mobileSample = false;
const logo = new Image();

function stopFrame() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
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
    const ctx = sample.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(logo, 0, 0, sample.width, sample.height);
    const pixels = ctx.getImageData(0, 0, sample.width, sample.height).data;
    points = [];
    for (let y = 0; y < sample.height; y += 3) {
      for (let x = 0; x < sample.width; x += 3) {
        const offset = (y * sample.width + x) * 4;
        // The original main logo has an opaque white background.
        if (
          pixels[offset + 3] < 80 ||
          pixels[offset] + pixels[offset + 1] + pixels[offset + 2] >= 700
        )
          continue;
        const index = points.length;
        const random = Math.sin(index * 127.1 + 311.7) * 43758.5453;
        // The red underline is the only coloured part of the assembled mark.
        // Its lower-left spatial region is stable across the source asset;
        // the decorative flower in the upper-right remains white.
        const underline = x / sample.width < 0.16 && y / sample.height > 0.8;
        points.push({
          x: x / sample.width - 0.5,
          y: (y - sample.height / 2) / sample.width,
          seed: random - Math.floor(random),
          underline,
        });
      }
    }
    root.classList.toggle("motion-canvas-ready", points.length > 0);
    schedule();
  } catch {
    points = [];
    root.classList.remove("motion-canvas-ready");
    schedule();
  }
}

function updateCanvasSize() {
  if (!canvas || !context) return;
  const ratio = Math.min(
    devicePixelRatio || 1,
    innerWidth < 700 || coarse.matches ? 1.5 : 2,
  );
  const width = Math.round(innerWidth * ratio),
    height = Math.round(innerHeight * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
}

function canRender() {
  if (!stage || !canvas || !context) return false;
  const bounds = stage.getBoundingClientRect();
  const enabled =
    points.length > 0 &&
    !reduced.matches &&
    !oversized &&
    !hidden &&
    bounds.bottom > 0 &&
    bounds.top < innerHeight;
  canvas.hidden = !enabled;
  // A fixed canvas must never paint over the footer below its stage.
  canvas.style.clipPath = `inset(${Math.max(0, bounds.top)}px 0 ${Math.max(0, innerHeight - bounds.bottom)}px 0)`;
  return enabled;
}

function draw() {
  frame = 0;
  if (!canRender() || !context || !stage) return;
  const width = innerWidth,
    height = innerHeight;
  const start = scenes[0].getBoundingClientRect().top + scrollY;
  const end = scenes[2].getBoundingClientRect().top + scrollY;
  const progress = clamp((scrollY - start) / Math.max(1, end - start));
  const spread =
    smooth((progress - 0.1) / 0.32) * (1 - smooth((progress - 0.65) / 0.3));
  const finish = smooth((progress - 0.75) / 0.2);
  const exitOpacity =
    1 - smooth(Math.max(0, scrollY - end) / Math.min(180, height * 0.2));
  const mobile = width < 700;
  const centerX = width * ((mobile ? 0.5 : 0.62) * (1 - finish) + 0.5 * finish);
  const centerY =
    height * ((mobile ? 0.32 : 0.36) * (1 - finish) + 0.32 * finish);
  const size =
    width *
    ((mobile ? 0.92 : 0.59) * (1 - finish) + (mobile ? 0.72 : 0.43) * finish);
  const headerBottom = header?.getBoundingClientRect().bottom ?? 96;
  // Apply header clearance before letting the closing logo leave with its scene.
  const safeCenterY =
    Math.max(centerY, headerBottom + 12 + size * 0.19) -
    Math.max(0, scrollY - end);
  const textBounds = scenes.map((scene) =>
    scene.querySelector(".motion-scene-content")!.getBoundingClientRect(),
  );
  const pathway = scenes[1].getBoundingClientRect();
  const edge = 72;
  context.clearRect(0, 0, width, height);
  for (const point of points) {
    const distance = spread * (width * 0.4 + point.seed * height * 0.22);
    const angle = point.seed * Math.PI * 2 + progress * 2.7;
    const x = centerX + point.x * size + Math.cos(angle) * distance;
    const y = safeCenterY + point.y * size + Math.sin(angle) * distance;
    if (
      textBounds.some(
        (box) =>
          x > box.left - 12 &&
          x < box.right + 12 &&
          y > box.top - 12 &&
          y < box.bottom + 12,
      )
    )
      continue;
    const pathwayTop = pathway.top;
    const pathwayBottom = pathway.bottom;
    const paperWeight =
      smooth((y - pathwayTop + edge) / (edge * 2)) *
      (1 - smooth((y - pathwayBottom + edge) / (edge * 2)));
    const blue = [18, 82, 132];
    const white = [255, 255, 255];
    const foreground = point.underline
      ? [251, 57, 77]
      : [
          white[0] * (1 - paperWeight) + blue[0] * paperWeight,
          white[1] * (1 - paperWeight) + blue[1] * paperWeight,
          white[2] * (1 - paperWeight) + blue[2] * paperWeight,
        ];
    context.fillStyle = `rgb(${foreground.map((value) => Math.round(value)).join(",")})`;
    context.globalAlpha = (0.9 + point.seed * 0.1) * exitOpacity;
    const radius = (mobile ? 1.1 : 1.6) + point.seed * 0.4;
    context.beginPath();
    context.moveTo(x, y - radius);
    context.lineTo(x + radius, y + radius);
    context.lineTo(x - radius, y + radius);
    context.closePath();
    context.fill();
  }
  context.globalAlpha = 1;
}

function schedule() {
  if (!canRender()) {
    stopFrame();
    return;
  }
  if (!frame) frame = requestAnimationFrame(draw);
}

function updateLayout() {
  // Measure the normal layout; fallback logos in flex flow inflate scrollHeight.
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
  root.classList.toggle("motion-snap-ready", !oversized);
  root.classList.toggle("motion-reduced", reduced.matches);
  const bannerSpace = preview?.offsetHeight ?? 0;
  root.style.setProperty("--motion-banner-space", `${bannerSpace}px`);
  const headerSpace = Math.max(
    96,
    (header?.offsetHeight ?? 80) + bannerSpace + 32,
  );
  // Expanded menus are overlays; their height must not resize every scene.
  if (!nav?.classList.contains("is-open"))
    root.style.setProperty("--motion-header-space", `${headerSpace}px`);
  updateCanvasSize();
  if (
    logo.naturalWidth &&
    mobileSample !== (innerWidth < 700 || coarse.matches)
  )
    sampleLogo();
  schedule();
}

type WheelState = {
  start: number;
  direction: number;
  total: number;
  idle: number;
  animation: number;
  cooldown: number;
};
let wheelState: WheelState | null = null;
let savedScrollStyles: { snap: string; behavior: string } | null = null;
function clearWheelGesture() {
  if (wheelState?.idle) clearTimeout(wheelState.idle);
  wheelState = null;
}
function restoreScrollStyles() {
  if (!savedScrollStyles) return;
  root.style.scrollSnapType = savedScrollStyles.snap;
  root.style.scrollBehavior = savedScrollStyles.behavior;
  savedScrollStyles = null;
}
function cancelWheelTransition() {
  if (wheelState?.animation) cancelAnimationFrame(wheelState.animation);
  clearWheelGesture();
  restoreScrollStyles();
}
function startWheelTransition(start: number, direction: number) {
  if (start + direction < 0 || start + direction >= scenes.length) {
    clearWheelGesture();
    restoreScrollStyles();
    return;
  }
  const target =
    scenes[start + direction].getBoundingClientRect().top + scrollY;
  const from = scrollY;
  const duration = 800;
  const started = performance.now();
  if (wheelState?.idle) clearTimeout(wheelState.idle);
  savedScrollStyles = {
    snap: root.style.scrollSnapType,
    behavior: root.style.scrollBehavior,
  };
  root.style.scrollSnapType = "none";
  root.style.scrollBehavior = "auto";
  const animate = (now: number) => {
    if (!wheelState) return;
    const t = clamp((now - started) / duration);
    scrollTo({ top: from + (target - from) * smooth(t), behavior: "instant" });
    if (t < 1) wheelState.animation = requestAnimationFrame(animate);
    else {
      scrollTo({ top: target, behavior: "instant" });
      if (wheelState?.idle) clearTimeout(wheelState.idle);
      restoreScrollStyles();
      wheelState = {
        start: start + direction,
        direction,
        total: 0,
        idle: 0,
        animation: 0,
        cooldown: performance.now() + 180,
      };
    }
  };
  wheelState = {
    start,
    direction,
    total: 0,
    idle: 0,
    animation: requestAnimationFrame(animate),
    cooldown: 0,
  };
}
function noteWheel(event: WheelEvent) {
  if (
    event.ctrlKey ||
    Math.abs(event.deltaY) <= Math.abs(event.deltaX) ||
    oversized ||
    reduced.matches ||
    nav?.classList.contains("is-open")
  )
    return cancelWheelTransition();
  const direction = Math.sign(event.deltaY);
  if (!stage) return;
  if (wheelState?.animation) {
    event.preventDefault();
    if (wheelState.direction !== direction) cancelWheelTransition();
    else return;
  }
  const first = scenes[0].getBoundingClientRect().top + scrollY;
  const last = scenes[2].getBoundingClientRect().top + scrollY;
  if (scrollY < first - 3 || scrollY > last + 3) return;
  const stops = scenes.map(
    (scene) => scene.getBoundingClientRect().top + scrollY,
  );
  const nearest = stops.reduce(
    (best, stop, index) =>
      Math.abs(stop - scrollY) < Math.abs(stops[best] - scrollY) ? index : best,
    0,
  );
  const state = wheelState ?? {
    start: nearest,
    direction,
    total: 0,
    idle: 0,
    animation: 0,
    cooldown: 0,
  };
  if (state.cooldown > performance.now() && state.direction === direction) {
    event.preventDefault();
    return;
  }
  if (state.direction !== direction) state.total = 0;
  state.start = nearest;
  state.direction = direction;
  // Wheel devices may report pixels, text lines, or whole pages.
  const deltaScale =
    event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
  state.total += Math.abs(event.deltaY) * deltaScale;
  wheelState = state;
  if (
    state.start + state.direction < 0 ||
    state.start + state.direction >= scenes.length
  ) {
    clearWheelGesture();
    return;
  }
  event.preventDefault();
  if (state.idle) clearTimeout(state.idle);
  state.idle = window.setTimeout(clearWheelGesture, 140);
  if (state.total >= 30) startWheelTransition(state.start, state.direction);
}

if (stage && scenes.length === 3) {
  document.body.classList.add("motion-js");
  const observer = new ResizeObserver(updateLayout);
  scenes.forEach((scene) => observer.observe(scene));
  if (header) observer.observe(header);
  if (preview) observer.observe(preview);
  if (nav)
    new MutationObserver(() => {
      if (nav.classList.contains("is-open")) cancelWheelTransition();
      root.classList.toggle(
        "motion-menu-open",
        nav.classList.contains("is-open"),
      );
    }).observe(nav, { attributes: true, attributeFilter: ["class"] });
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("wheel", noteWheel, { passive: false });
  document.addEventListener("keydown", cancelWheelTransition);
  document.addEventListener("focusin", cancelWheelTransition);
  document.addEventListener("pointerdown", cancelWheelTransition);
  addEventListener(
    "resize",
    () => {
      cancelWheelTransition();
      updateLayout();
    },
    { passive: true },
  );
  window.visualViewport?.addEventListener(
    "resize",
    () => {
      cancelWheelTransition();
      updateLayout();
    },
    {
      passive: true,
    },
  );
  reduced.addEventListener("change", () => {
    cancelWheelTransition();
    updateLayout();
  });
  document.addEventListener("visibilitychange", () => {
    hidden = document.hidden;
    cancelWheelTransition();
    schedule();
  });
  addEventListener("pagehide", () => {
    hidden = true;
    cancelWheelTransition();
    stopFrame();
  });
  addEventListener("pageshow", () => {
    hidden = document.hidden;
    updateLayout();
  });
  logo.onload = sampleLogo;
  logo.onerror = () => {
    points = [];
    root.classList.remove("motion-canvas-ready");
    schedule();
  };
  updateLayout();
  if (context) logo.src = "/brand/empact-logo-blue.png";
}

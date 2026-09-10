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

type Particle = { x: number; y: number; seed: number; accent: number };
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
        points.push({
          x: x / sample.width - 0.5,
          y: (y - sample.height / 2) / sample.width,
          seed: random - Math.floor(random),
          accent: index % 10,
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
  const centerX = width * ((mobile ? 0.5 : 0.66) * (1 - finish) + 0.5 * finish);
  const centerY =
    height * ((mobile ? 0.31 : 0.33) * (1 - finish) + 0.32 * finish) -
    Math.max(0, scrollY - end);
  const size =
    width *
    ((mobile ? 0.88 : 0.49) * (1 - finish) + (mobile ? 0.72 : 0.43) * finish);
  const paper = progress < 0.25 || progress > 0.75;
  const textBounds = scenes.map((scene) =>
    scene.querySelector(".motion-scene-content")!.getBoundingClientRect(),
  );
  context.clearRect(0, 0, width, height);
  for (const point of points) {
    const distance = spread * (width * 0.4 + point.seed * height * 0.22);
    const angle = point.seed * Math.PI * 2 + progress * 2.7;
    const x = centerX + point.x * size + Math.cos(angle) * distance;
    const y = centerY + point.y * size + Math.sin(angle) * distance;
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
    context.fillStyle =
      point.accent === 8
        ? "#FB394D"
        : point.accent === 9
          ? "#2CB3B9"
          : paper
            ? "#F3F0E7"
            : "#125284";
    context.globalAlpha = (0.7 + point.seed * 0.3) * exitOpacity;
    const radius = (mobile ? 0.7 : 1) + point.seed * 0.5;
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

// Some browsers ignore scroll-snap-stop for a wheel event with a large delta.
// Correct only the completed wheel gesture; links, touch and keyboard stay native.
let wheelGesture: { start: number; direction: number } | null = null;
// Passive wheel events may arrive after the compositor has moved scrollY.
let observedScrollY = scrollY;
function clearWheelGesture() {
  wheelGesture = null;
}
function noteWheel(event: WheelEvent) {
  if (
    event.ctrlKey ||
    Math.abs(event.deltaY) <= Math.abs(event.deltaX) ||
    oversized ||
    reduced.matches ||
    nav?.classList.contains("is-open")
  )
    return clearWheelGesture();
  if (wheelGesture?.direction !== Math.sign(event.deltaY)) clearWheelGesture();
  if (wheelGesture || !stage) return;
  const first = scenes[0].getBoundingClientRect().top + scrollY;
  const last = scenes[2].getBoundingClientRect().top + scrollY;
  if (observedScrollY < first - 3 || observedScrollY > last + 3) return;
  const stops = scenes.map(
    (scene) => scene.getBoundingClientRect().top + scrollY,
  );
  const nearest = stops.reduce(
    (best, stop, index) =>
      Math.abs(stop - observedScrollY) < Math.abs(stops[best] - observedScrollY)
        ? index
        : best,
    0,
  );
  wheelGesture = { start: nearest, direction: Math.sign(event.deltaY) };
}
function settleWheel() {
  const gesture = wheelGesture;
  clearWheelGesture();
  if (
    !gesture ||
    oversized ||
    reduced.matches ||
    nav?.classList.contains("is-open")
  )
    return;
  const next = gesture.start + gesture.direction;
  // Allow normal departure from the three scenes into the directory and footer.
  if (next < 0 || next >= scenes.length) return;
  const target = scenes[next].getBoundingClientRect().top + scrollY;
  if ((scrollY - target) * gesture.direction > 3)
    scrollTo({ top: target, behavior: "smooth" });
}

if (stage && scenes.length === 3) {
  document.body.classList.add("motion-js");
  const observer = new ResizeObserver(updateLayout);
  scenes.forEach((scene) => observer.observe(scene));
  if (header) observer.observe(header);
  if (preview) observer.observe(preview);
  if (nav)
    new MutationObserver(() => {
      root.classList.toggle(
        "motion-menu-open",
        nav.classList.contains("is-open"),
      );
    }).observe(nav, { attributes: true, attributeFilter: ["class"] });
  addEventListener(
    "scroll",
    () => {
      schedule();
      observedScrollY = scrollY;
    },
    { passive: true },
  );
  addEventListener("wheel", noteWheel, { passive: true });
  document.addEventListener("scrollend", settleWheel);
  document.addEventListener("keydown", clearWheelGesture);
  document.addEventListener("focusin", clearWheelGesture);
  document.addEventListener("pointerdown", clearWheelGesture);
  addEventListener("resize", updateLayout, { passive: true });
  window.visualViewport?.addEventListener("resize", updateLayout, {
    passive: true,
  });
  reduced.addEventListener("change", updateLayout);
  document.addEventListener("visibilitychange", () => {
    hidden = document.hidden;
    schedule();
  });
  addEventListener("pagehide", () => {
    hidden = true;
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

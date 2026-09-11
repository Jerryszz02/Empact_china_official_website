export type WheelSample = {
  deltaY: number;
  deltaMode?: number;
};

/** Convert line/page wheel events to a stable pixel scale. */
export function normalizeWheelDelta(sample: WheelSample, pageSize: number) {
  const multiplier =
    sample.deltaMode === 1 ? 16 : sample.deltaMode === 2 ? pageSize : 1;
  return sample.deltaY * multiplier;
}

/** Mouse wheels generally report a whole notch; trackpads report many small samples. */
export function isWheelNotch(delta: number) {
  return Math.abs(delta) >= 45;
}

/**
 * Turns a wheel stream into page directions. Pixel-mode streams are treated
 * as one gesture after the first page, including late, larger inertia samples;
 * line/page mode events represent explicit notches and remain countable.
 */
export class WheelNotchTracker {
  private direction = 0;
  private lastAt = 0;
  private remainder = 0;
  private locked = false;
  private trackpad = false;
  private lastMagnitude = 0;

  consume(sample: WheelSample, pageSize: number, now: number) {
    const delta = normalizeWheelDelta(sample, pageSize);
    const nextDirection = Math.sign(delta);
    if (!nextDirection) return 0;
    const quiet = now - this.lastAt > 180;
    if (nextDirection !== this.direction || quiet) {
      this.remainder = 0;
      this.locked = false;
      this.trackpad = false;
      this.lastMagnitude = 0;
    }
    this.direction = nextDirection;
    this.lastAt = now;
    if ((sample.deltaMode ?? 0) !== 0) return nextDirection;
    const magnitude = Math.abs(delta);
    // A wheel normally repeats the same discrete value. Changing pixel
    // magnitudes indicate a trackpad gesture, even when its first samples are large.
    if (
      magnitude < 80 ||
      (this.lastMagnitude > 0 && magnitude !== this.lastMagnitude)
    )
      this.trackpad = true;
    this.lastMagnitude = magnitude;
    if (this.locked && this.trackpad) return 0;
    this.remainder += delta;
    if (!isWheelNotch(this.remainder)) return 0;
    this.remainder = 0;
    this.locked = true;
    return nextDirection;
  }
}

export function clampPage(page: number, pageCount: number) {
  return Math.max(0, Math.min(pageCount - 1, page));
}

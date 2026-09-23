/** One opening sequence; early navigation smoothly hands over to scrolling. */
export type HomeIntroFrame = {
  gather: number;
  solid: number;
  dock: number;
  reveal: number;
  copy: number;
  phase: "gathering" | "forming" | "docking" | "ready";
};

const smooth = (value: number) => {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
};
const finalFrame: HomeIntroFrame = {
  gather: 1,
  solid: 1,
  dock: 1,
  reveal: 1,
  copy: 1,
  phase: "ready",
};

export class HomeIntro {
  private started: number | null = null;
  private handoff: { started: number; from: HomeIntroFrame } | null = null;
  private complete = false;

  finish() {
    this.complete = true;
  }

  handOver(now: number) {
    if (this.complete || this.handoff) return;
    this.handoff = { started: now, from: this.read(now) };
  }

  read(now: number): HomeIntroFrame {
    if (this.complete) return finalFrame;
    this.started ??= now;
    if (this.handoff) {
      const amount = smooth((now - this.handoff.started) / 280);
      if (amount === 1) {
        this.finish();
        return finalFrame;
      }
      const from = this.handoff.from;
      const end = (value: number) => value + (1 - value) * amount;
      return {
        gather: end(from.gather),
        solid: end(from.solid),
        dock: end(from.dock),
        reveal: end(from.reveal),
        copy: end(from.copy),
        phase: "docking",
      };
    }
    const elapsed = now - this.started;
    if (elapsed >= 4600) {
      this.finish();
      return finalFrame;
    }
    return {
      gather: smooth((elapsed - 300) / 1900),
      solid: smooth((elapsed - 2400) / 800),
      dock: smooth((elapsed - 3400) / 1000),
      reveal: smooth((elapsed - 3800) / 800),
      copy: smooth((elapsed - 2100) / 800),
      phase:
        elapsed < 2200 ? "gathering" : elapsed < 3400 ? "forming" : "docking",
    };
  }
}

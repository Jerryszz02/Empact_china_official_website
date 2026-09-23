import { test } from "node:test";
import assert from "node:assert/strict";
import { HomeIntro } from "../apps/site/src/lib/home-intro.js";

test("logo gathers and becomes solid before docking and showing photos", () => {
  const intro = new HomeIntro();
  const first = intro.read(100);
  assert.equal(first.gather, 0);
  assert.equal(first.reveal, 0);
  const formed = intro.read(2500);
  assert.equal(formed.gather, 1);
  assert.equal(formed.dock, 0);
  assert.equal(formed.reveal, 0);
  const solid = intro.read(3400);
  assert.equal(solid.solid, 1);
  assert.equal(solid.dock, 0);
  const moving = intro.read(4100);
  assert.ok(moving.dock > 0 && moving.dock < 1);
  assert.ok(moving.reveal > 0 && moving.reveal < 1);
  const ready = intro.read(4800);
  assert.equal(ready.phase, "ready");
  assert.equal(ready.dock, 1);
  assert.equal(ready.reveal, 1);
});

test("early scrolling hands over from the current frame without restarting", () => {
  const intro = new HomeIntro();
  intro.read(0);
  const before = intro.read(700);
  intro.handOver(700);
  const firstHandoff = intro.read(700);
  assert.equal(firstHandoff.gather, before.gather);
  assert.equal(firstHandoff.solid, before.solid);
  assert.equal(firstHandoff.dock, before.dock);
  const midway = intro.read(850);
  assert.ok(midway.dock > 0 && midway.dock < 1);
  // Continued wheel / touch events must not keep postponing completion.
  intro.handOver(850);
  assert.equal(intro.read(981).phase, "ready");
  assert.equal(intro.read(6000).gather, 1);
});

test("reduced motion and fallback can finish before assets arrive", () => {
  const intro = new HomeIntro();
  intro.finish();
  assert.equal(intro.read(0).phase, "ready");
  assert.equal(intro.read(3000).reveal, 1);
  intro.handOver(3100);
  assert.equal(intro.read(3101).phase, "ready");
});

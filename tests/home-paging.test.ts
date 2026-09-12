import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WheelNotchTracker,
  normalizeWheelDelta,
} from "../apps/site/src/lib/home-paging.js";

test("wheel normalization handles line and page delta modes", () => {
  assert.equal(normalizeWheelDelta({ deltaY: 3, deltaMode: 1 }, 800), 48);
  assert.equal(normalizeWheelDelta({ deltaY: 1, deltaMode: 2 }, 800), 800);
});

test("line-mode notches remain countable during one animation", () => {
  const tracker = new WheelNotchTracker();
  assert.equal(tracker.consume({ deltaY: 3, deltaMode: 1 }, 800, 0), 1);
  assert.equal(tracker.consume({ deltaY: 3, deltaMode: 1 }, 800, 60), 1);
});

test("a long decaying pixel gesture advances only once", () => {
  const tracker = new WheelNotchTracker();
  const stream = [18, 18, 18, 18, 18, 18, 18, 18, 18, 96, 84, 72, 60, 48, 36];
  const pages = stream.reduce(
    (count, delta, index) =>
      count +
      (tracker.consume({ deltaY: delta, deltaMode: 0 }, 800, index * 50)
        ? 1
        : 0),
    0,
  );
  assert.equal(pages, 1);
});

test("large decaying pixel samples do not race to the footer", () => {
  const tracker = new WheelNotchTracker();
  const results = [120, 112, 100, 90, 80, 72, 50, 20].map((deltaY, i) =>
    tracker.consume({ deltaY }, 800, i * 40),
  );
  assert.deepEqual(results, [1, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(tracker.consume({ deltaY: -100 }, 800, 350), -1);
  assert.equal(tracker.consume({ deltaY: 100 }, 800, 600), 1);
});

test("repeated discrete pixel notches advance separately", () => {
  const tracker = new WheelNotchTracker();
  assert.equal(tracker.consume({ deltaY: 100 }, 800, 0), 1);
  assert.equal(tracker.consume({ deltaY: 100 }, 800, 50), 1);
});

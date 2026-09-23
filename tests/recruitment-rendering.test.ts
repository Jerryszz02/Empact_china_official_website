import { test } from "node:test";
import assert from "node:assert/strict";
import { exampleRecruitment } from "@empact/content/recruitment";
import { visibleRecruitmentJobs } from "../apps/site/src/lib/recruitment.js";

test("public careers pages never turn examples or closed jobs into opportunities", () => {
  const job = exampleRecruitment.jobs[0];
  const jobs = [
    { ...job, id: "example", isExample: true },
    { ...job, id: "closed", isExample: false, status: "closed" as const },
    { ...job, id: "live", isExample: false, status: "open" as const },
  ];
  assert.deepEqual(
    visibleRecruitmentJobs({ mode: "production", recruitment: { jobs } }).map(
      (item) => item.id,
    ),
    ["live"],
  );
  assert.deepEqual(visibleRecruitmentJobs({ mode: "production" }), []);
  assert.deepEqual(
    visibleRecruitmentJobs({ mode: "preview", recruitment: { jobs: [] } }),
    [],
  );
  assert.equal(visibleRecruitmentJobs({ mode: "production" }, true).length, 3);
});

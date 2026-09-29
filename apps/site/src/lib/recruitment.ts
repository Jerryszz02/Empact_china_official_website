import type { Snapshot, RecruitmentJob } from "@empact/content/schema";

/** Keep legacy examples private and leave missing recruitment content empty. */
export function visibleRecruitmentJobs(
  snapshot: Pick<Snapshot, "mode" | "recruitment">,
  preview = snapshot.mode === "preview",
): RecruitmentJob[] {
  const recruitment = snapshot.recruitment;
  return (recruitment?.jobs ?? []).filter(
    (job) => job.status === "open" && (preview || !job.isExample),
  );
}

export function recruitmentLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export const jobTypeLabel = {
  "full-time": "全职",
  internship: "实习",
} as const;

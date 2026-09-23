import { bindFormSubmission } from "./form-submission";

const form = document.querySelector<HTMLFormElement>("[data-application-form]");
if (form) {
  const job = form.querySelector<HTMLSelectElement>('[name="jobId"]')!;
  const notice = form.querySelector<HTMLElement>("[data-job-notice]")!;
  const resume = form.querySelector<HTMLInputElement>('[name="resumeUrl"]')!;
  const portfolio = form.querySelector<HTMLInputElement>(
    '[name="portfolioUrl"]',
  )!;
  const requested = new URLSearchParams(location.search).get("job");
  if (
    requested &&
    Array.from(job.options).some((option) => option.value === requested)
  )
    job.value = requested;

  function updateJob() {
    const example = job.selectedOptions[0]?.dataset.example === "true";
    refreshButton();
    notice.textContent = example
      ? "这是用于页面预览的示例岗位，暂不接受申请。"
      : "";
  }

  function validateLinks() {
    const hasLink = Boolean(resume.value.trim() || portfolio.value.trim());
    resume.setCustomValidity(hasLink ? "" : "请至少填写一个简历或作品链接。");
    for (const input of [resume, portfolio]) {
      if (input.value.trim())
        input.setCustomValidity(
          /^https?:\/\//i.test(input.value.trim())
            ? ""
            : "请填写以 http:// 或 https:// 开头的链接。",
        );
      else if (input === portfolio || hasLink) input.setCustomValidity("");
    }
  }
  resume.addEventListener("input", validateLinks);
  portfolio.addEventListener("input", validateLinks);
  validateLinks();
  const refreshButton = bindFormSubmission(
    form,
    (fields) => {
      const value = (name: string) => String(fields.get(name) ?? "").trim();
      return {
        kind: "recruitment",
        jobId: value("jobId"),
        name: value("name"),
        email: value("email"),
        contact: value("contact"),
        experience: value("experience"),
        availability: value("availability"),
        resumeUrl: value("resumeUrl"),
        portfolioUrl: value("portfolioUrl"),
        consent: fields.get("consent") === "on",
        website: value("website"),
        idempotencyKey: value("idempotencyKey"),
      };
    },
    () =>
      form.dataset.deliveryEnabled === "true" &&
      Boolean(job.value) &&
      job.selectedOptions[0]?.dataset.example !== "true",
  );
  updateJob();
  if (requested && !job.value)
    notice.textContent =
      "这个岗位可能已更新或结束招聘，请重新选择一个开放岗位。";
  job.addEventListener("change", updateJob);
}

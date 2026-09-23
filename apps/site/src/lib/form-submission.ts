/** Shared transport and retry behavior for consultation and recruitment forms. */
export function bindFormSubmission(
  form: HTMLFormElement,
  payload: (fields: FormData) => Record<string, unknown>,
  isEligible?: () => boolean,
) {
  const status = form.querySelector<HTMLElement>("[data-form-status]")!;
  const button = form.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  )!;
  const key = form.querySelector<HTMLInputElement>('[name="idempotencyKey"]')!;
  let submitting = false;
  let submitted = false;
  const refreshButton = () => {
    button.disabled = submitting || submitted || !(isEligible?.() ?? true);
  };
  key.value = crypto.randomUUID();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (
      button.disabled ||
      submitting ||
      submitted ||
      (isEligible && !isEligible()) ||
      !form.reportValidity()
    )
      return;
    submitting = true;
    button.disabled = true;
    status.className = "form-status";
    status.textContent = "正在发送…";
    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload(new FormData(form))),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "暂时无法发送，请稍后再试。");
      submitted = true;
      form.dataset.submitted = "true";
      status.textContent = data.message || "信息已送达。";
      status.className = "form-status success";
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "暂时无法发送，请稍后再试。";
      status.className = "form-status error";
    } finally {
      submitting = false;
      refreshButton();
    }
  });
  return refreshButton;
}

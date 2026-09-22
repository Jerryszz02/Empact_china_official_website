const form = document.querySelector<HTMLFormElement>("[data-contact-form]");
if (form) initializeForm(form);

function initializeForm(form: HTMLFormElement) {
  const status = form.querySelector<HTMLElement>("[data-form-status]")!;
  const segment = form.querySelector<HTMLSelectElement>('[name="segment"]')!;
  const business = form.querySelector<HTMLSelectElement>('[name="business"]')!;
  const button = form.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  )!;
  const key = form.querySelector<HTMLInputElement>('[name="idempotencyKey"]')!;
  const options = Array.from(business.options).filter(
    (option) => option.dataset.segment,
  );
  function showBusinesses(selected = "") {
    business.replaceChildren(
      new Option(segment.value ? "请选择子业务" : "请先选择业务范围", ""),
    );
    business.disabled = !segment.value;
    if (!segment.value) return;
    for (const option of options.filter(
      (option) => option.dataset.segment === segment.value,
    ))
      business.add(option.cloneNode(true) as HTMLOptionElement);
    business.add(new Option("其他／暂不确定", "other"));
    business.value = segment.value === "other" ? "other" : selected;
  }
  segment.addEventListener("change", () => showBusinesses());
  const requested = new URLSearchParams(location.search).get("business");
  const requestedOption = options.find((option) => option.value === requested);
  if (requestedOption) segment.value = requestedOption.dataset.segment!;
  else if (
    requested &&
    Array.from(segment.options).some((option) => option.value === requested)
  )
    segment.value = requested;
  showBusinesses(requestedOption?.value ?? "");
  key.value = crypto.randomUUID();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button.disabled || !form.reportValidity()) return;
    button.disabled = true;
    status.className = "form-status";
    status.textContent = "正在发送…";
    const fields = new FormData(form);
    const value = (name: string) => String(fields.get(name) ?? "").trim();
    const payload = {
      segment: value("segment"),
      business: value("business"),
      businessTitle: business.selectedOptions[0]?.textContent?.trim() ?? "",
      name: value("name"),
      organization: value("organization"),
      role: value("role"),
      contact: value("contact"),
      message: value("message"),
      goal: value("goal"),
      location: value("location"),
      timeline: value("timeline"),
      participants: value("participants"),
      budget: value("budget"),
      referenceUrl: value("referenceUrl"),
      consent: fields.get("consent") === "on",
      website: value("website"),
      idempotencyKey: value("idempotencyKey"),
    };
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "暂时无法发送，请稍后再试。");
      status.textContent = data.message || "咨询已送达。";
      status.className = "form-status success";
    } catch (error) {
      button.disabled = false;
      status.textContent =
        error instanceof Error ? error.message : "暂时无法发送，请稍后再试。";
      status.className = "form-status error";
    }
  });
}

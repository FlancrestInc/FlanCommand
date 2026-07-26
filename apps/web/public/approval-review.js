const params = new URLSearchParams(location.search);
const id = params.get("id");
const token = params.get("token");
const status = document.getElementById("status");
const details = document.getElementById("details");
const actions = document.getElementById("actions");
const setError = (message) => {
  status.textContent = message;
  status.className = "error";
};

async function load() {
  if (!id || !token) return setError("This approval link is incomplete.");
  const response = await fetch(
    `/api/approvals/${encodeURIComponent(id)}/review?token=${encodeURIComponent(token)}`,
  );
  const data = await response.json();
  if (!response.ok)
    return setError(data.error?.message || "This approval link is no longer valid.");
  document.getElementById("title").textContent =
    data.approval.description || "Hermes needs approval";
  status.textContent = `Action: ${data.approval.action}. Review it before deciding.`;
  details.textContent = JSON.stringify(
    {
      action: data.approval.action,
      ...(data.approval.details || {}),
      evaluation: data.approval.evaluation,
      actionHash: data.approval.actionHash,
    },
    null,
    2,
  );
  details.hidden = false;
  actions.hidden = data.approval.decision !== "pending";
  if (data.approval.decision !== "pending")
    status.textContent = `Already ${data.approval.decision}.`;
}

async function decide(decision) {
  for (const button of actions.querySelectorAll("button")) button.disabled = true;
  const response = await fetch(`/api/approvals/${encodeURIComponent(id)}/review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, decision }),
  });
  const data = await response.json();
  if (!response.ok) return setError(data.error?.message || "The decision could not be saved.");
  actions.hidden = true;
  status.textContent = `Action ${data.decision}. You can close this page.`;
}

document.getElementById("approve").addEventListener("click", () => void decide("approve"));
document.getElementById("deny").addEventListener("click", () => void decide("deny"));
void load().catch(() => setError("The approval service is unavailable."));

import { bindMarkdownActions, renderMarkdown } from "./markdown.js";
import {
  activityDetail,
  activityLabel,
  activitySummaryLabel,
  formatApiError,
  formatDuration,
  formatMessageTimestamp,
  jobActions,
  jobStatusLabel,
  runtimeMonitorLabel,
  shouldSeparateAssistantMessage,
  sortNewest,
} from "./command-center.js";
import { recoveryForSendFailure } from "./chat-recovery.js";
import { filterFiles, previewKind } from "./file-library.js";
import { buildUnifiedDiff } from "./unified-diff.js";

if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
}

const state = {
  sessions: [],
  folders: [],
  activeId: null,
  running: false,
  abort: null,
  theme: ["xp", "cga", "amber", "green", "win98css", "xpcss", "win7css", "classiccss"].includes(
    localStorage.getItem("flan-theme"),
  )
    ? localStorage.getItem("flan-theme")
    : "xp",
  chatBackground: ["bliss", "clouds", "autumn", "3d-pipes", "azul", "none"].includes(
    localStorage.getItem("flan-chat-background"),
  )
    ? localStorage.getItem("flan-chat-background")
    : localStorage.getItem("flan-chat-background") === "custom" &&
        localStorage.getItem("flan-custom-wallpaper")
      ? "custom"
      : "bliss",
  events: [],
  activityExpanded: false,
  activitySummary: null,
  startedAt: null,
  elapsedSeconds: null,
  elapsedCompleted: false,
  elapsedTimer: null,
  draft: localStorage.getItem("flan-draft") || "",
  commands: [],
  projects: [],
  approvals: [],
  modelOptions: [],
  defaultModelId: "",
  contextUsage: { totalTokens: 0, contextWindow: 0 },
  toolStartedAt: null,
  toolElapsedSeconds: null,
  toolElapsedCompleted: false,
  toolElapsedTimer: null,
  files: [],
  artifacts: [],
  credentials: [],
  credentialHealth: [],
  pendingAttachments: [],
  uploadToComposer: false,
  jobs: [],
  notifications: [],
  audit: [],
  settings: null,
  notificationIds: new Set(),
  notificationsLoaded: false,
  projectEditingId: null,
  pendingCredentialJobId: null,
  capabilities: {},
  workspacePath: "",
  editFilePath: "",
  editOriginal: "",
  editProposal: null,
  terminal: null,
  terminalStreamAbort: null,
  terminalReconnectTimer: null,
  terminalReconnectAttempts: 0,
  terminalSize: "",
  drawerKind: null,
  sideDrawerKind: null,
  sideDrawerTrigger: null,
  pendingText: "",
  recovering: false,
  memory: null,
  filesystemPicker: {
    open: false,
    path: "/",
    entries: [],
    selectedIndex: 0,
    tokenStart: 0,
    tokenEnd: 0,
    requestId: 0,
  },
};
let commandPickerSelection = null;
const themeNames = {
  xp: "System 6",
  cga: "BOOTSTRA.386 CGA",
  amber: "BOOTSTRA.386 Amber",
  green: "BOOTSTRA.386 Green",
  win98css: "Windows 98 (98.css)",
  xpcss: "Windows XP (XP.css)",
  win7css: "Windows 7 (7.css)",
  classiccss: "Classic Mac (classic.css)",
};
const themeSendIcons = {
  xp: "↵",
  cga: "↵",
  amber: "↵",
  green: "↵",
  win98css: "➜",
  xpcss: "➜",
  win7css: "➜",
  classiccss: "↵",
};
const themeOrder = ["xp", "cga", "amber", "green", "win98css", "xpcss", "win7css", "classiccss"];
const $ = (id) => document.getElementById(id);
document.documentElement.dataset.theme = state.theme;
document.documentElement.dataset.chatBackground = state.chatBackground;
if (localStorage.getItem("flan-custom-wallpaper"))
  document.documentElement.style.setProperty(
    "--custom-wallpaper",
    `url("${localStorage.getItem("flan-custom-wallpaper")}")`,
  );
$("composer-input").value = state.draft;
function sideDrawerElements(kind) {
  return kind === "conversations"
    ? { panel: $("sidebar"), trigger: $("conversations-tab"), close: $("close-conversations") }
    : { panel: $("detail-panel"), trigger: $("details-tab"), close: $("close-details") };
}
function closeSideDrawer({ restoreFocus = true } = {}) {
  const kind =
    state.sideDrawerKind ||
    ($("sidebar").classList.contains("open")
      ? "conversations"
      : $("detail-panel").classList.contains("open")
        ? "details"
        : null);
  if (!kind) return;
  const elements = sideDrawerElements(kind);
  elements.panel.classList.remove("open");
  elements.trigger.setAttribute("aria-expanded", "false");
  $("side-drawer-backdrop").hidden = true;
  const trigger = state.sideDrawerTrigger || elements.trigger;
  state.sideDrawerKind = null;
  state.sideDrawerTrigger = null;
  if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
}
function openSideDrawer(kind, trigger = sideDrawerElements(kind).trigger) {
  if (state.sideDrawerKind === kind) {
    closeSideDrawer();
    return;
  }
  if (state.sideDrawerKind) closeSideDrawer({ restoreFocus: false });
  const other = sideDrawerElements(kind === "conversations" ? "details" : "conversations");
  other.panel.classList.remove("open");
  other.trigger.setAttribute("aria-expanded", "false");
  const elements = sideDrawerElements(kind);
  elements.panel.classList.add("open");
  elements.trigger.setAttribute("aria-expanded", "true");
  $("side-drawer-backdrop").hidden = false;
  state.sideDrawerKind = kind;
  state.sideDrawerTrigger = trigger;
  elements.close.focus({ preventScroll: true });
}
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char],
  );
function renderText(value) {
  return renderMarkdown(value);
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 3200);
}
function setConnection(text, good = true) {
  $("connection").innerHTML =
    `<i style="background:${good ? "var(--accent)" : "var(--warm)"}"></i> ${text}`;
}
function renderSessions() {
  const projectOptions = (selectedId) =>
    '<option value="">No project</option>' +
    state.projects
      .map(
        (project) =>
          `<option value="${escapeHtml(project.id)}" ${project.id === selectedId ? "selected" : ""}>${escapeHtml(project.name)}</option>`,
      )
      .join("");
  $("session-list").innerHTML =
    state.sessions
      .map(
        (session) =>
          `<div class="session-entry" data-session-entry="${escapeHtml(session.id)}"><button class="session-item ${session.id === state.activeId ? "active" : ""}" data-session="${escapeHtml(session.id)}"><strong>${session.isPinned ? "◆ " : ""}${escapeHtml(session.title || "Untitled conversation")}</strong><small>${session.status === "running" ? "Working now" : "Ready to continue"}</small></button><button class="session-menu-toggle" type="button" data-session-menu-toggle="${escapeHtml(session.id)}" aria-label="Conversation actions for ${escapeHtml(session.title || "Untitled conversation")}" aria-expanded="false">…</button><div class="session-menu" data-session-menu="${escapeHtml(session.id)}" role="menu" hidden><button type="button" data-session-action="archive" data-session-id="${escapeHtml(session.id)}">Archive</button><button type="button" data-session-action="pin" data-session-id="${escapeHtml(session.id)}">${session.isPinned ? "Unpin" : "Pin"}</button><button type="button" data-session-action="rename" data-session-id="${escapeHtml(session.id)}">Rename</button><label>Project<select data-session-project="${escapeHtml(session.id)}" aria-label="Add conversation to a project">${projectOptions(session.projectId)}</select></label></div></div>`,
      )
      .join("") ||
    `<p style="color:var(--faint);font-size:11px;padding:10px">No conversations found.</p>`;
  document
    .querySelectorAll("[data-session]")
    .forEach((button) =>
      button.addEventListener("click", () => openSession(button.dataset.session)),
    );
  document.querySelectorAll("[data-session-menu-toggle]").forEach((button) =>
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const menu = document.querySelector(
        `[data-session-menu="${CSS.escape(button.dataset.sessionMenuToggle)}"]`,
      );
      document.querySelectorAll("[data-session-menu]").forEach((item) => {
        item.hidden = item !== menu;
      });
      document
        .querySelectorAll("[data-session-menu-toggle]")
        .forEach((item) => item.setAttribute("aria-expanded", String(item === button)));
    }),
  );
  document
    .querySelectorAll("[data-session-action]")
    .forEach((button) => button.addEventListener("click", () => void handleSessionAction(button)));
  document.querySelectorAll("[data-session-project]").forEach((select) =>
    select.addEventListener("change", () => {
      void updateSessionOrganization(select.dataset.sessionProject, {
        projectId: select.value || null,
      });
    }),
  );
}
async function handleSessionAction(button) {
  const id = button.dataset.sessionId;
  const session = state.sessions.find((item) => item.id === id);
  if (!id || !session) return;
  if (button.dataset.sessionAction === "archive") {
    if (!window.confirm("Archive this conversation?")) return;
    await updateSessionOrganization(id, { archived: true });
  }
  if (button.dataset.sessionAction === "pin")
    await updateSessionOrganization(id, { isPinned: !session.isPinned });
  if (button.dataset.sessionAction === "rename") {
    const title = window.prompt("Conversation name:", session.title || "");
    if (title !== null) await updateSessionOrganization(id, { customTitle: title });
  }
}
function renderConversationApprovals(sessionId) {
  const messages = $("messages");
  if (!messages || !sessionId) return;
  messages.querySelectorAll(".inline-approval").forEach((item) => item.remove());
  const approvals = state.approvals.filter((item) => item.sessionId === sessionId);
  if (!approvals.length) return;
  const renderApproval = (approval) => {
    const pending = approval.decision === "pending";
    return `<article class="inline-approval ${pending ? "pending" : "decided"}" data-inline-approval="${escapeHtml(approval.id)}" tabindex="-1" aria-label="Approval request: ${escapeHtml(approval.description)}"><div class="inline-approval-head"><strong>${pending ? "Approval required" : `Approval ${escapeHtml(approval.decision)}`}</strong><span>${escapeHtml(approval.evaluation?.risk || "Review")}</span></div><p>${escapeHtml(approval.description)}</p><time datetime="${escapeHtml(approval.createdAt)}">${escapeHtml(formatMessageTimestamp(approval.createdAt))}</time>${pending ? `<div class="inline-approval-actions"><button class="primary-button" type="button" data-inline-approve="${escapeHtml(approval.id)}" accesskey="a" title="Approve this action (keyboard: A)">Approve <kbd>A</kbd></button><button type="button" data-inline-deny="${escapeHtml(approval.id)}" accesskey="d" title="Deny this action (keyboard: D)">Deny <kbd>D</kbd></button></div><small>Tab to an option, then press Enter · or press A/D</small>` : ""}</article>`;
  };
  const decided = approvals
    .filter((approval) => approval.decision !== "pending")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  for (const approval of decided) {
    const anchor = approval.anchorMessageId
      ? messages.querySelector(`[data-message-id="${CSS.escape(approval.anchorMessageId)}"]`)
      : null;
    const target = anchor || messages.lastElementChild;
    if (target) target.insertAdjacentHTML("afterend", renderApproval(approval));
    else messages.insertAdjacentHTML("beforeend", renderApproval(approval));
  }
  approvals
    .filter((approval) => approval.decision === "pending")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .forEach((approval) => messages.insertAdjacentHTML("beforeend", renderApproval(approval)));
  messages
    .querySelectorAll("[data-inline-approve]")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => void decideInlineApproval(button.dataset.inlineApprove, "approve"),
      ),
    );
  messages
    .querySelectorAll("[data-inline-deny]")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => void decideInlineApproval(button.dataset.inlineDeny, "deny"),
      ),
    );
}
async function decideInlineApproval(id, decision) {
  const card = document.querySelector(`[data-inline-approval="${CSS.escape(id)}"]`);
  const buttons = card?.querySelectorAll("button");
  buttons?.forEach((button) => (button.disabled = true));
  const reason =
    decision === "deny" ? window.prompt("Why deny this action?", "Not approved.") : undefined;
  if (decision === "deny" && reason === null) {
    buttons?.forEach((button) => (button.disabled = false));
    return;
  }
  try {
    await api(`/approvals/${encodeURIComponent(id)}/${decision}`, {
      method: "POST",
      ...(reason ? { body: JSON.stringify({ reason }) } : {}),
    });
    await loadApprovals();
    await loadJobs();
    toast(decision === "approve" ? "Action approved." : "Action denied.");
  } catch (error) {
    buttons?.forEach((button) => (button.disabled = false));
    toast(error.message);
  }
}
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  if (event.key !== "a" && event.key !== "d") return;
  const approval = sortNewest(state.approvals).find(
    (item) => item.sessionId === state.activeId && item.decision === "pending",
  );
  if (!approval) return;
  event.preventDefault();
  document
    .querySelector(
      `[data-inline-${event.key === "a" ? "approve" : "deny"}="${CSS.escape(approval.id)}"]`,
    )
    ?.click();
});
function renderSessionLoading() {
  $("session-list").innerHTML = Array.from(
    { length: 3 },
    () => '<div class="session-skeleton" aria-hidden="true"><span></span><i></i></div>',
  ).join("");
}
function renderChatMessage(message) {
  const canRetry =
    message.role === "assistant" &&
    message.status === "failed" &&
    message.turnId &&
    ["observed", "source-inferred"].includes(state.capabilities.retry?.status);
  const at = message.at || new Date().toISOString();
  const label = message.role === "user" ? "You" : `Hermes · ${message.status || "complete"}`;
  return `<article class="message ${message.role}" data-message-id="${escapeHtml(message.id || "")}"><div class="bubble">${renderText(message.text)}${message.attachments?.length ? `<div class="message-attachments">Attached: ${message.attachments.map((name) => escapeHtml(name)).join(", ")}</div>` : ""}</div><span class="message-meta">${label}<time datetime="${escapeHtml(at)}">${escapeHtml(formatMessageTimestamp(at))}</time>${canRetry ? `<button class="retry-button" type="button" data-retry-turn="${escapeHtml(message.turnId)}">Retry turn</button>` : ""}</span></article>`;
}
function renderSession(session) {
  const changingSession = state.activeId !== session.id;
  state.activeId = session.id;
  if (changingSession) {
    state.startedAt = null;
    state.elapsedSeconds = null;
    state.elapsedCompleted = false;
    state.toolStartedAt = null;
    state.toolElapsedSeconds = null;
    state.toolElapsedCompleted = false;
    renderRunMonitors();
  }
  localStorage.setItem("flan-active-session", session.id);
  $("session-title").textContent = session.title || "Untitled conversation";
  $("session-meta").textContent =
    `${session.status === "running" ? "Working now" : "Ready"} · ${session.source || "Hermes"}`;
  $("source-value").textContent = session.source || "Hermes";
  $("session-id").textContent = session.id;
  $("model-select").value = session.modelId || state.defaultModelId || "";
  const selectedModel = state.modelOptions.find(
    (model) => model.id === (session.modelId || state.defaultModelId),
  );
  if (!state.contextUsage.contextWindow && selectedModel?.contextWindow) {
    state.contextUsage = { ...state.contextUsage, contextWindow: selectedModel.contextWindow };
  }
  $("project-select").value = session.projectId || "";
  renderConversationPermission(session);
  $("folder-select").value = session.folderId || "";
  $("messages").innerHTML = (session.messages || []).map(renderChatMessage).join("");
  bindMarkdownActions($("messages"));
  bindRetryActions($("messages"));
  renderConversationApprovals(session.id);
  $("welcome").style.display = session.messages?.length ? "none" : "block";
  $("message-scroll").scrollTop = $("message-scroll").scrollHeight;
  renderSessions();
}
function bindRetryActions(container) {
  container.querySelectorAll("[data-retry-turn]").forEach((button) =>
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const retry = await api(`/sessions/${encodeURIComponent(state.activeId)}/retry`, {
          method: "POST",
          body: JSON.stringify({ turnId: button.dataset.retryTurn }),
        });
        await openSession(state.activeId);
        if (retry.text) await send(retry.text);
      } catch (error) {
        button.disabled = false;
        toast(error.message);
      }
    }),
  );
}
async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  const data = response.status === 204 ? undefined : await response.json();
  if (!response.ok) throw new Error(formatApiError(data?.error));
  return data;
}
async function load() {
  try {
    await loadSessions();
    setConnection("connected");
    await loadFolders();
    await loadModels();
    await loadSettings();
    await loadCapabilities();
    await loadProjects();
    await loadCredentials();
    await loadWorkspace();
    await loadApprovals();
    await loadFiles();
    await loadArtifacts();
    await loadJobs();
    await loadNotifications();
    if (!state.sessions.length) await createSession();
    else {
      const preferredId = localStorage.getItem("flan-active-session");
      const preferred = state.sessions.find((session) => session.id === preferredId);
      await openSession(preferred?.id || state.sessions[0].id);
    }
  } catch (error) {
    setConnection("offline", false);
    toast(error.message);
  }
}
function applySettings(settings) {
  state.settings = settings;
  state.theme = settings.theme;
  state.chatBackground =
    localStorage.getItem("flan-chat-background") === "custom" &&
    localStorage.getItem("flan-custom-wallpaper")
      ? "custom"
      : settings.chatBackground || "bliss";
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.chatBackground = state.chatBackground;
  localStorage.setItem("flan-theme", state.theme);
  localStorage.setItem("flan-chat-background", state.chatBackground);
  $("theme-toggle").setAttribute("aria-label", `Switch theme. Current: ${themeNames[state.theme]}`);
  $("send-icon").textContent = themeSendIcons[state.theme] || "↑";
  document.body.classList.toggle("compact-activity", settings.compactActivity);
}
async function loadSettings() {
  try {
    applySettings(await api("/settings"));
  } catch {
    state.settings = null;
  }
}
function renderSettings() {
  if (!state.settings) return;
  $("settings-model").value = state.settings.defaultModel || "";
  $("settings-reasoning").value = state.settings.reasoningEffort;
  $("settings-response-limit").value = state.settings.responseLimit;
  $("settings-retention").value = state.settings.retentionDays;
  $("settings-notifications").checked = state.settings.notifications;
  $("settings-compact").checked = state.settings.compactActivity;
  $("settings-theme").value = state.settings.theme;
  $("settings-chat-background").value = state.settings.chatBackground || "bliss";
  if (state.chatBackground === "custom") $("settings-chat-background").value = "custom";
  $("settings-chat-background-preview").textContent =
    state.chatBackground === "custom"
      ? "Using the custom wallpaper saved in this browser."
      : "Custom wallpaper stays in this browser.";
}
async function saveSettings() {
  const saved = await api("/settings", {
    method: "POST",
    body: JSON.stringify({
      defaultModel: $("settings-model").value,
      reasoningEffort: $("settings-reasoning").value,
      responseLimit: Number($("settings-response-limit").value),
      retentionDays: Number($("settings-retention").value),
      notifications: $("settings-notifications").checked,
      compactActivity: $("settings-compact").checked,
      theme: $("settings-theme").value,
      chatBackground:
        $("settings-chat-background").value === "custom"
          ? "bliss"
          : $("settings-chat-background").value,
    }),
  });
  applySettings(saved);
  $("settings-backdrop").hidden = true;
  toast("Settings saved.");
}
async function openSettings() {
  if (!state.settings) await loadSettings();
  renderSettings();
  $("settings-backdrop").hidden = false;
  $("settings-close").focus();
}
async function loadCapabilities() {
  try {
    const data = await api("/capabilities");
    state.capabilities = data.capabilities || {};
  } catch {
    state.capabilities = {};
  }
}
async function loadSessions() {
  renderSessionLoading();
  const params = new URLSearchParams();
  const query = $("search").value.trim();
  const folderId = $("folder-select").value;
  if (query) params.set("q", query);
  if (folderId) params.set("folderId", folderId);
  try {
    const data = await api(`/sessions${params.size ? `?${params}` : ""}`);
    state.sessions = data.sessions || [];
    renderSessions();
  } catch (error) {
    state.sessions = [];
    renderSessions();
    throw error;
  }
}
async function loadFolders() {
  try {
    const data = await api("/folders");
    state.folders = data.folders || [];
    $("folder-select").innerHTML =
      '<option value="">All folders</option>' +
      state.folders
        .map(
          (folder) =>
            `<option value="${escapeHtml(folder.id)}">${escapeHtml(folder.name)}</option>`,
        )
        .join("");
  } catch {
    $("folder-select").innerHTML = '<option value="">Folders unavailable</option>';
  }
}
async function loadJobs() {
  try {
    const data = await api("/jobs");
    state.jobs = data.jobs || [];
    const active = state.jobs.filter((job) =>
      ["queued", "running", "waiting_for_approval", "waiting_for_credential", "paused"].includes(
        job.status,
      ),
    );
    $("job-count").textContent = String(active.length);
  } catch {
    $("job-count").textContent = "—";
  }
}
async function loadNotifications() {
  try {
    const data = await api("/notifications");
    state.notifications = data.notifications || [];
    const unread = state.notifications.filter((item) => !item.read);
    $("notification-count").textContent = String(unread.length);
    if (state.settings?.notifications && "Notification" in window) {
      if (state.notificationsLoaded && Notification.permission === "granted")
        for (const item of unread.filter((item) => !state.notificationIds.has(item.id)))
          new Notification(item.title, { body: item.body, tag: item.id });
      for (const item of state.notifications) state.notificationIds.add(item.id);
    }
    state.notificationsLoaded = true;
  } catch {
    $("notification-count").textContent = "—";
  }
}
function formatDrawerValue(value) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "string") return escapeHtml(value);
  try {
    return escapeHtml(JSON.stringify(value, null, 2));
  } catch {
    return escapeHtml(String(value));
  }
}
function openDrawer(kind) {
  state.drawerKind = kind;
  const titles = {
    approvals: "Approvals",
    jobs: "Background jobs",
    notifications: "Notifications",
    memory: "Hermes memory",
  };
  $("drawer-title").textContent = titles[kind] || "Updates";
  $("drawer-backdrop").hidden = false;
  renderDrawer();
  $("drawer-close").focus();
}
function closeDrawer() {
  state.drawerKind = null;
  $("drawer-backdrop").hidden = true;
}
function renderDrawer() {
  const content = $("drawer-content");
  if (!content || !state.drawerKind) return;
  if (state.drawerKind === "approvals") renderApprovalDrawer(content);
  if (state.drawerKind === "jobs") renderJobDrawer(content);
  if (state.drawerKind === "notifications") renderNotificationDrawer(content);
  if (state.drawerKind === "memory") renderMemoryDrawer(content);
}
function boundaryExpansionAction(approval) {
  const target = approval.details?.path
    ? { kind: "path", value: approval.details.path, label: "path" }
    : approval.details?.host
      ? { kind: "host", value: approval.details.host, label: "host" }
      : undefined;
  if (!target || !approval.projectId) return "";
  return `<button data-expand-boundary="${escapeHtml(approval.id)}" data-boundary-kind="${target.kind}" data-boundary-value="${escapeHtml(target.value)}" data-boundary-project="${escapeHtml(approval.projectId)}">Add ${target.label} to project</button>`;
}
function renderApprovalDrawer(content) {
  const approvals = sortNewest(state.approvals).filter((item) => item.decision === "pending");
  content.innerHTML = approvals.length
    ? approvals
        .map(
          (approval) =>
            `<article class="drawer-card approval-card"><div class="drawer-card-head"><span class="risk risk-${escapeHtml(approval.evaluation?.risk || "unknown")}">${escapeHtml(approval.evaluation?.risk || "Review")}</span><time>${escapeHtml(new Date(approval.createdAt).toLocaleString())}</time></div><h3>${escapeHtml(approval.description)}</h3><dl><div><dt>Action</dt><dd>${escapeHtml(approval.action?.category || approval.action || "—")}</dd></div><div><dt>Project</dt><dd>${escapeHtml(approval.projectId || "Global")}</dd></div><div><dt>Exact action hash</dt><dd class="mono">${escapeHtml(approval.actionHash || "—")}</dd></div></dl><details><summary>Policy decision</summary><pre>${formatDrawerValue(approval.evaluation)}</pre></details><div class="drawer-actions"><button class="primary-button" data-approve-drawer="${escapeHtml(approval.id)}">Approve</button><button data-deny-drawer="${escapeHtml(approval.id)}">Deny</button>${boundaryExpansionAction(approval)}</div></article>`,
        )
        .join("")
    : '<div class="drawer-empty"><span>✓</span><h3>Nothing waiting</h3><p>Approval-required work will appear here.</p></div>';
  content
    .querySelectorAll("[data-approve-drawer]")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => void decideDrawerApproval(button.dataset.approveDrawer, "approve"),
      ),
    );
  content
    .querySelectorAll("[data-deny-drawer]")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => void decideDrawerApproval(button.dataset.denyDrawer, "deny"),
      ),
    );
  content
    .querySelectorAll("[data-expand-boundary]")
    .forEach((button) => button.addEventListener("click", () => void expandBoundary(button)));
}
async function expandBoundary(button) {
  button.disabled = true;
  const projectId = button.dataset.boundaryProject;
  const kind = button.dataset.boundaryKind;
  const value = button.dataset.boundaryValue;
  if (!projectId || !value || (kind !== "path" && kind !== "host")) return;
  try {
    await api(`/projects/${encodeURIComponent(projectId)}/boundary`, {
      method: "POST",
      body: JSON.stringify({ [kind]: value, approvalId: button.dataset.expandBoundary }),
    });
    await loadProjects();
    await loadApprovals();
    renderDrawer();
    toast("Project boundary expanded. Review the original action separately.");
  } catch (error) {
    button.disabled = false;
    toast(error.message);
  }
}
async function decideDrawerApproval(id, decision) {
  const reason =
    decision === "deny" ? window.prompt("Why deny this action?", "Not approved.") : undefined;
  if (decision === "deny" && reason === null) return;
  try {
    await api(`/approvals/${encodeURIComponent(id)}/${decision}`, {
      method: "POST",
      ...(reason ? { body: JSON.stringify({ reason }) } : {}),
    });
    await loadApprovals();
    renderDrawer();
    toast(decision === "approve" ? "Action approved." : "Action denied.");
  } catch (error) {
    toast(error.message);
  }
}
function renderJobDrawer(content) {
  const jobs = sortNewest(state.jobs);
  content.innerHTML = jobs.length
    ? jobs
        .map(
          (job) =>
            `<article class="drawer-card job-card"><div class="drawer-card-head"><span class="job-status job-${escapeHtml(job.status)}">${escapeHtml(jobStatusLabel(job.status))}</span><time>${escapeHtml(new Date(job.updatedAt || job.createdAt).toLocaleString())}</time></div><h3>${escapeHtml(job.title)}</h3><p>${job.sessionId ? `Session ${escapeHtml(job.sessionId)}` : "No session attached"}</p>${typeof job.progress === "number" ? `<div class="job-progress"><span style="width:${Math.max(0, Math.min(100, job.progress))}%"></span></div><small>${job.progress}% complete</small>` : ""}${job.credentialRequest ? `<div class="credential-request"><strong>${escapeHtml(job.credentialRequest.name)}</strong><p>${escapeHtml(job.credentialRequest.purpose || "Hermes needs a credential reference.")}</p><button data-provide-credential-job="${escapeHtml(job.id)}">Send credential reference</button></div>` : ""}${job.error ? `<pre>${formatDrawerValue(job.error.message)}</pre>` : ""}${["queued", "running", "waiting_for_approval", "waiting_for_credential", "paused"].includes(job.status) ? `<div class="drawer-actions"><button data-cancel-job="${escapeHtml(job.id)}">Cancel job</button></div>` : ""}${jobActions(job).length ? `<div class="drawer-actions">${jobActions(job).includes("retry") ? `<button data-retry-job="${escapeHtml(job.id)}">Retry</button>` : ""}${jobActions(job).includes("duplicate") ? `<button data-duplicate-job="${escapeHtml(job.id)}">Duplicate</button>` : ""}</div>` : ""}</article>`,
        )
        .join("")
    : '<div class="drawer-empty"><span>✦</span><h3>No background work</h3><p>Long-running Hermes tasks will stay visible here.</p></div>';
  content
    .querySelectorAll("[data-cancel-job]")
    .forEach((button) =>
      button.addEventListener("click", () => void cancelDrawerJob(button.dataset.cancelJob)),
    );
  content
    .querySelectorAll("[data-retry-job]")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => void recoverDrawerJob(button.dataset.retryJob, "retry"),
      ),
    );
  content
    .querySelectorAll("[data-duplicate-job]")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => void recoverDrawerJob(button.dataset.duplicateJob, "duplicate"),
      ),
    );
  content
    .querySelectorAll("[data-provide-credential-job]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        openCredentialChooser(button.dataset.provideCredentialJob),
      ),
    );
}
async function cancelDrawerJob(id) {
  try {
    await api(`/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
    await loadJobs();
    renderDrawer();
    toast("Job canceled.");
  } catch (error) {
    toast(error.message);
  }
}
async function recoverDrawerJob(id, action) {
  try {
    await api(`/jobs/${encodeURIComponent(id)}/${action}`, { method: "POST" });
    await loadJobs();
    renderDrawer();
    toast(action === "retry" ? "Job retry started." : "Job duplicated.");
  } catch (error) {
    toast(error.message);
  }
}
function openCredentialChooser(id) {
  if (!state.credentials.length) return toast("Associate a credential reference first.");
  state.pendingCredentialJobId = id;
  $("credential-provide-select").innerHTML = state.credentials
    .map(
      (credential) =>
        `<option value="${escapeHtml(credential.id)}">${escapeHtml(credential.name)} · ${escapeHtml(credential.injectionMethod)}</option>`,
    )
    .join("");
  $("credential-provide-backdrop").hidden = false;
  $("credential-provide-select").focus();
}
function closeCredentialChooser() {
  $("credential-provide-backdrop").hidden = true;
  state.pendingCredentialJobId = null;
}
async function provideDrawerCredential(event) {
  event.preventDefault();
  const id = state.pendingCredentialJobId;
  const credentialId = $("credential-provide-select").value;
  if (!id || !credentialId) return;
  try {
    await api(`/jobs/${encodeURIComponent(id)}/provide-credential`, {
      method: "POST",
      body: JSON.stringify({ credentialId }),
    });
    await loadJobs();
    renderDrawer();
    closeCredentialChooser();
    toast("Credential sent to Hermes.");
  } catch (error) {
    toast(error.message);
  }
}
function renderNotificationDrawer(content) {
  const notifications = sortNewest(state.notifications);
  content.innerHTML = notifications.length
    ? `<div class="notification-toolbar"><span>${notifications.length} notification${notifications.length === 1 ? "" : "s"}</span><button type="button" data-delete-all-notifications>Dismiss all</button></div>${notifications
        .map(
          (item) =>
            `<article class="drawer-card notification-card ${item.read ? "read" : "unread"}"><div class="drawer-card-head"><span>${escapeHtml(item.kind || "system")}</span><time>${escapeHtml(new Date(item.createdAt).toLocaleString())}</time></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p>${item.reviewUrl ? `<a href="${escapeHtml(item.reviewUrl)}" target="_blank" rel="noreferrer">Open review page ↗</a>` : ""}<div class="drawer-actions">${item.read ? "" : `<button data-read-notification="${escapeHtml(item.id)}">Mark read</button>`}<button data-delete-notification="${escapeHtml(item.id)}">Dismiss</button></div></article>`,
        )
        .join("")}`
    : '<div class="drawer-empty"><span>♢</span><h3>All caught up</h3><p>Notifications about jobs and approvals will appear here.</p>';
  content
    .querySelectorAll("[data-read-notification]")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => void markDrawerNotification(button.dataset.readNotification),
      ),
    );
  content
    .querySelectorAll("[data-delete-notification]")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => void deleteDrawerNotification(button.dataset.deleteNotification),
      ),
    );
  content
    .querySelector("[data-delete-all-notifications]")
    ?.addEventListener("click", () => void deleteAllDrawerNotifications());
}
async function markDrawerNotification(id) {
  try {
    await api(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
    await loadNotifications();
    renderDrawer();
  } catch (error) {
    toast(error.message);
  }
}
async function deleteDrawerNotification(id) {
  try {
    await api(`/notifications/${encodeURIComponent(id)}`, { method: "DELETE" });
    await loadNotifications();
    renderDrawer();
  } catch (error) {
    toast(error.message);
  }
}
async function deleteAllDrawerNotifications() {
  try {
    await api("/notifications", { method: "DELETE" });
    await loadNotifications();
    renderDrawer();
  } catch (error) {
    toast(error.message);
  }
}
function renderMemoryDrawer(content) {
  const memory = state.memory;
  content.innerHTML = `<div class="drawer-card memory-card"><p>Hermes is the source of truth for memory. This panel uses the native <span class="mono">/memory</span> command. It does not create a second memory store.</p><div class="drawer-actions"><button class="primary-button" data-memory-command="/memory">Refresh status</button><button data-memory-command="/memory pending">Pending writes</button></div>${memory ? `<div class="memory-output"><div class="drawer-card-head"><span class="card-label">${escapeHtml(memory.command)}</span><time>Hermes response</time></div><pre>${escapeHtml(memory.output || "No output returned.")}</pre></div>` : '<div class="drawer-empty"><span>✦</span><h3>Memory status is not loaded</h3><p>Ask Hermes for its current memory gate and pending writes.</p></div>'}</div>`;
  content
    .querySelectorAll("[data-memory-command]")
    .forEach((button) =>
      button.addEventListener("click", () => void loadMemory(button.dataset.memoryCommand)),
    );
}
async function loadMemory(command = "/memory") {
  if (!state.activeId) return toast("Choose a conversation first.");
  try {
    state.memory = await api(`/sessions/${encodeURIComponent(state.activeId)}/memory`, {
      method: "POST",
      body: JSON.stringify({ command }),
    });
    openDrawer("memory");
  } catch (error) {
    toast(error.message);
  }
}
async function loadAudit() {
  try {
    const data = await api("/audit");
    state.audit = data.audit || [];
    $("audit-list").innerHTML = state.audit.length
      ? state.audit
          .slice()
          .reverse()
          .slice(0, 30)
          .map((entry) => {
            const details = Object.entries(entry)
              .filter(([key]) => key !== "type" && key !== "at")
              .map(([key, value]) => `${key}: ${String(value)}`)
              .join(" · ");
            return `<div class="audit-entry"><b>${escapeHtml(entry.type)}</b><time>${escapeHtml(new Date(entry.at).toLocaleString())}</time>${details ? `<small>${escapeHtml(details)}</small>` : ""}</div>`;
          })
          .join("")
      : "<span>No audit events yet.</span>";
  } catch (error) {
    $("audit-list").innerHTML = `<span>${escapeHtml(error.message)}</span>`;
  }
}
async function loadProjects() {
  try {
    const data = await api("/projects?includeArchived=true");
    state.projects = data.projects || [];
    $("project-select").innerHTML = state.projects
      .map(
        (project) =>
          `<option value="${escapeHtml(project.id)}"${project.archived ? " disabled" : ""}>${escapeHtml(project.name)}${project.archived ? " · archived" : ""}</option>`,
      )
      .join("");
    renderPermissionMode();
    renderTerminalHosts();
    renderSessions();
  } catch {
    $("project-select").innerHTML = '<option value="">No projects available</option>';
    renderPermissionMode();
    renderTerminalHosts();
    renderSessions();
  }
}
function renderPermissionMode() {
  const project = state.projects.find((item) => item.id === $("project-select").value);
  const mode = project?.permissionMode || "ask";
  $("permission-mode").value = mode;
  $("permission-help").textContent =
    mode === "safe"
      ? "Reads and commands can run; writes and network access ask first."
      : mode === "autonomy"
        ? "Declared project actions can run without an approval prompt."
        : "Edits, commands, and network actions ask first.";
  $("permission-mode").disabled = !project;
  $("edit-project").disabled = !project;
  $("archive-project").disabled = !project || project.archived;
}
function renderTerminalHosts() {
  const project = state.projects.find((item) => item.id === $("project-select").value);
  const hosts = ["local", ...(project?.hosts || []).filter((host) => host !== "local")];
  $("terminal-host").innerHTML = hosts
    .map((host) => {
      const label = host === "local" ? "Local host" : `SSH · ${host}`;
      return `<option value="${escapeHtml(host)}">${escapeHtml(label)}</option>`;
    })
    .join("");
}
function renderTerminalCredentials() {
  const select = $("terminal-credential");
  const current = select.value;
  select.innerHTML = `<option value="">No credential</option>${state.credentials
    .filter((credential) => credential.injectionMethod === "temporary_file")
    .map(
      (credential) =>
        `<option value="${escapeHtml(credential.id)}">${escapeHtml(credential.name)} · file</option>`,
    )
    .join("")}`;
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}
function renderConversationPermission(
  session = state.sessions.find((item) => item.id === state.activeId),
) {
  const mode = session?.permissionModeOverride || "inherit";
  $("conversation-permission").value = mode;
  $("conversation-permission").disabled = !session;
  $("conversation-permission-help").textContent =
    mode === "inherit"
      ? "This conversation uses the project mode."
      : "This overrides the project mode here.";
}
async function updatePermissionMode(mode) {
  const projectId = $("project-select").value;
  if (!projectId) return;
  const project = state.projects.find((item) => item.id === projectId);
  const previous = project?.permissionMode || "ask";
  try {
    const updated = await api(`/projects/${encodeURIComponent(projectId)}/policy`, {
      method: "POST",
      body: JSON.stringify({ mode }),
    });
    const index = state.projects.findIndex((item) => item.id === projectId);
    if (index >= 0) state.projects[index] = updated;
    renderPermissionMode();
    toast(`Permission mode: ${$("permission-mode").selectedOptions[0]?.textContent || mode}.`);
  } catch (error) {
    $("permission-mode").value = previous;
    renderPermissionMode();
    toast(error.message);
  }
}
function openProjectForm(project) {
  state.projectEditingId = project?.id || null;
  $("project-form-title").textContent = project ? "EDIT PROJECT" : "NEW PROJECT";
  $("project-name").value = project?.name || "";
  $("project-path").value = project?.paths?.[0] || "";
  $("project-hosts").value = (project?.hosts || []).join(", ");
  $("project-instructions").value = project?.instructions || "";
  $("project-backdrop").hidden = false;
  $("project-name").focus();
}
function closeProjectForm() {
  $("project-backdrop").hidden = true;
  state.projectEditingId = null;
}
async function saveProject(event) {
  event.preventDefault();
  const name = $("project-name").value.trim();
  if (!name) return;
  const path = $("project-path").value.trim();
  const hosts = $("project-hosts").value;
  const instructions = $("project-instructions").value.trim();
  const existingId = state.projectEditingId;
  try {
    const project = await api(
      existingId ? `/projects/${encodeURIComponent(existingId)}` : "/projects",
      {
        method: "POST",
        body: JSON.stringify({
          name,
          paths: path ? [path] : [],
          hosts: hosts
            ? hosts
                .split(",")
                .map((host) => host.trim())
                .filter(Boolean)
            : [],
          instructions: instructions || undefined,
        }),
      },
    );
    await loadProjects();
    $("project-select").value = project.id;
    renderPermissionMode();
    renderTerminalHosts();
    if (!existingId && state.activeId) {
      await api(`/sessions/${encodeURIComponent(state.activeId)}/project`, {
        method: "POST",
        body: JSON.stringify({ projectId: project.id }),
      });
    }
    await loadFiles();
    await loadCredentials();
    state.workspacePath = "";
    await loadWorkspace();
    closeProjectForm();
    toast(existingId ? "Project updated." : "Project created and selected.");
  } catch (error) {
    toast(error.message);
  }
}
function createProject() {
  openProjectForm();
}
function editProject() {
  const project = state.projects.find((item) => item.id === $("project-select").value);
  if (project && !project.archived) openProjectForm(project);
}
async function archiveProject() {
  const project = state.projects.find((item) => item.id === $("project-select").value);
  if (!project || project.archived || !window.confirm(`Archive ${project.name}?`)) return;
  try {
    await api(`/projects/${encodeURIComponent(project.id)}/archive`, { method: "POST" });
    await loadProjects();
    $("project-select").value = "";
    renderPermissionMode();
    renderTerminalHosts();
    toast("Project archived.");
  } catch (error) {
    toast(error.message);
  }
}
async function loadApprovals() {
  try {
    const data = await api("/approvals");
    state.approvals = data.approvals || [];
    $("approval-count").textContent = String(
      state.approvals.filter((item) => item.decision === "pending").length,
    );
    renderConversationApprovals(state.activeId);
  } catch {
    $("approval-count").textContent = "—";
  }
}
async function loadCredentials() {
  const projectId = $("project-select").value || "";
  if (!projectId) return;
  try {
    const data = await api(`/projects/${encodeURIComponent(projectId)}/credentials`);
    state.credentials = data.credentials || [];
    const health = await api(`/credentials/health?projectId=${encodeURIComponent(projectId)}`);
    state.credentialHealth = health.health || [];
    renderCredentials();
    renderTerminalCredentials();
  } catch {
    state.credentialHealth = [];
    renderTerminalCredentials();
    $("credential-list").innerHTML = "<span>Credential references are unavailable.</span>";
  }
}
function renderCredentials() {
  $("credential-list").innerHTML = state.credentials.length
    ? state.credentials
        .map((credential) => {
          const health = state.credentialHealth.find((item) => item.id === credential.id);
          const status =
            health?.status === "healthy" ? "Healthy" : health ? "Unavailable" : "Not checked";
          return `<div class="credential-item"><span>◇</span><div><strong>${escapeHtml(credential.name)}</strong><small>${escapeHtml(credential.provider)} · ${escapeHtml(credential.injectionMethod)} · ${status}</small></div><button data-credential-validate="${escapeHtml(credential.id)}">Check</button></div>`;
        })
        .join("")
    : "<span>No references associated.</span>";
  document.querySelectorAll("[data-credential-validate]").forEach((button) =>
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await api(
          `/credentials/${encodeURIComponent(button.dataset.credentialValidate)}/validate`,
          {
            method: "POST",
          },
        );
        toast("Credential reference is reachable. The secret stayed on the server.");
      } catch (error) {
        toast(error.message);
      } finally {
        button.disabled = false;
      }
    }),
  );
}
function openCredentialForm() {
  $("credential-name").value = "";
  $("credential-secret-id").value = "";
  $("credential-purpose").value = "Remote access";
  $("credential-hosts").value = "gospel";
  $("credential-injection").value = "temporary_file";
  $("credential-backdrop").hidden = false;
  $("credential-name").focus();
}
function closeCredentialForm() {
  $("credential-backdrop").hidden = true;
}
async function saveCredential(event) {
  event.preventDefault();
  const projectId = $("project-select").value;
  if (!projectId) return toast("Choose a project first.");
  const name = $("credential-name").value.trim();
  const externalSecretId = $("credential-secret-id").value.trim();
  const purpose = $("credential-purpose").value.trim();
  const hosts = $("credential-hosts").value;
  if (!name || !externalSecretId || !purpose) return;
  try {
    await api(`/projects/${encodeURIComponent(projectId)}/credentials`, {
      method: "POST",
      body: JSON.stringify({
        name,
        provider: "bitwarden-secrets-manager",
        externalSecretId,
        purpose,
        allowedHosts: hosts
          ? hosts
              .split(",")
              .map((host) => host.trim())
              .filter(Boolean)
          : [],
        injectionMethod: $("credential-injection").value,
      }),
    });
    await loadCredentials();
    closeCredentialForm();
    toast("Credential reference associated. No secret was uploaded.");
  } catch (error) {
    toast(error.message);
  }
}
async function loadFiles() {
  try {
    const search = $("file-search").value.trim();
    const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
    const data = await api(
      `/files?projectId=${encodeURIComponent($("project-select").value || "")}${searchParam}`,
    );
    state.files = data.files || [];
    renderFiles();
  } catch {
    $("file-list").innerHTML = "<span>Files are unavailable.</span>";
  }
}
async function loadArtifacts() {
  try {
    const data = await api("/artifacts");
    state.artifacts = data.artifacts || [];
    $("artifact-list").innerHTML = state.artifacts.length
      ? state.artifacts
          .map(
            (artifact) =>
              `<a href="/api/artifacts/${encodeURIComponent(artifact.id)}/preview" target="_blank" rel="noreferrer">↗ ${escapeHtml(artifact.name)}</a>`,
          )
          .join("")
      : "<span>No generated artifacts yet.</span>";
  } catch {
    $("artifact-list").innerHTML = "<span>Artifacts are unavailable.</span>";
  }
}
async function loadWorkspace(path = state.workspacePath) {
  const projectId = $("project-select").value || "";
  if (!projectId) return;
  try {
    const params = new URLSearchParams({ projectId });
    if (path) params.set("path", path);
    const data = await api(`/workspace?${params}`);
    state.workspacePath = data.listing.path;
    $("workspace-path").value = state.workspacePath;
    $("workspace-list").innerHTML = data.listing.entries.length
      ? data.listing.entries
          .map(
            (entry) =>
              `<div class="workspace-entry"><span>${entry.type === "directory" ? "▸" : entry.type === "symlink" ? "⌁" : "▤"}</span><button class="workspace-entry-name" data-workspace-type="${escapeHtml(entry.type)}" data-workspace-path="${escapeHtml(entry.path)}">${escapeHtml(entry.name)}</button><small>${entry.type === "file" ? `${Math.ceil((entry.sizeBytes || 0) / 1024)}K` : entry.type}</small><button class="workspace-use-path" type="button" data-workspace-use-path="${escapeHtml(entry.path)}" aria-label="Use path ${escapeHtml(entry.path)}">Use path</button></div>`,
          )
          .join("")
      : "<span>Empty directory.</span>";
    document.querySelectorAll("[data-workspace-path]").forEach((button) =>
      button.addEventListener("click", () => {
        if (button.dataset.workspaceType === "directory")
          void loadWorkspace(button.dataset.workspacePath);
        else if (button.dataset.workspaceType === "file")
          void loadEditor(button.dataset.workspacePath);
      }),
    );
    document
      .querySelectorAll("[data-workspace-use-path]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          insertWorkspacePath(button.dataset.workspaceUsePath),
        ),
      );
  } catch (error) {
    $("workspace-list").innerHTML = `<span>${escapeHtml(error.message)}</span>`;
  }
}
function insertWorkspacePath(path) {
  if (!path) return;
  const input = $("composer-input");
  const current = input.value.trimEnd();
  input.value = `${current}${current ? "\n" : ""}${path}`;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
  toast("Workspace path added to the message.");
}
async function searchWorkspace() {
  const projectId = $("project-select").value || "";
  const query = $("workspace-search").value.trim();
  if (!projectId) return;
  if (!query) {
    $("workspace-search-results").hidden = true;
    return;
  }
  try {
    const params = new URLSearchParams({ projectId, q: query });
    const data = await api(`/workspace/search?${params}`);
    const results = $("workspace-search-results");
    results.hidden = false;
    results.innerHTML = data.matches.length
      ? `${data.matches.map((match) => `<div class="workspace-search-result"><button type="button" data-search-path="${escapeHtml(match.path)}"><strong>${escapeHtml(match.name)}</strong><small>${escapeHtml(match.match)}${match.preview ? ` · ${match.preview}` : ""}</small></button><button class="workspace-search-use-path" type="button" data-search-use-path="${escapeHtml(match.path)}" aria-label="Use path ${escapeHtml(match.path)}">Use path</button></div>`).join("")}${data.truncated ? '<small class="workspace-search-note">Showing the first 100 matches.</small>' : ""}`
      : '<span class="workspace-search-note">No matching files.</span>';
    results
      .querySelectorAll("[data-search-path]")
      .forEach((button) =>
        button.addEventListener("click", () => void loadEditor(button.dataset.searchPath)),
      );
    results
      .querySelectorAll("[data-search-use-path]")
      .forEach((button) =>
        button.addEventListener("click", () => insertWorkspacePath(button.dataset.searchUsePath)),
      );
  } catch (error) {
    $("workspace-search-results").hidden = false;
    $("workspace-search-results").textContent = error.message;
  }
}
async function loadEditor(path) {
  const projectId = $("project-select").value;
  const params = new URLSearchParams({ projectId, path });
  try {
    const response = await fetch(`/api/workspace/file?${params}`);
    const content = await response.text();
    if (!response.ok)
      throw new Error(JSON.parse(content).error?.message || "File could not be read.");
    state.editFilePath = path;
    state.editOriginal = content;
    state.editProposal = null;
    $("edit-review").hidden = false;
    $("edit-file-name").textContent = path.split("/").pop() || path;
    $("edit-status").textContent = "Editing a local copy. Propose a change to review it.";
    $("edit-content").value = content;
    $("edit-diff").textContent = "No proposal yet.";
    $("approve-edit").hidden = true;
    $("reject-edit").hidden = true;
  } catch (error) {
    toast(error.message);
  }
}
function beginNewFile() {
  $("workspace-new-file-row").hidden = false;
  $("new-file-path").value = "";
  $("new-file-path").focus();
}
function cancelNewFile() {
  $("workspace-new-file-row").hidden = true;
  $("new-file-path").value = "";
}
function startNewFileEditor() {
  const relativePath = $("new-file-path").value.trim();
  const base = state.workspacePath.replace(/\/+$/u, "");
  if (!relativePath) return toast("Enter a file name.");
  const path = relativePath.startsWith("/") ? relativePath : `${base}/${relativePath}`;
  state.editFilePath = path;
  state.editOriginal = "";
  state.editProposal = null;
  $("edit-review").hidden = false;
  $("edit-file-name").textContent = `NEW FILE · ${relativePath}`;
  $("edit-status").textContent = "New file. Propose it for exact review before writing.";
  $("edit-content").value = "";
  $("edit-diff").textContent = "No proposal yet.";
  $("approve-edit").hidden = true;
  $("reject-edit").hidden = true;
  cancelNewFile();
}
function renderEditDiff(proposal) {
  const lines = buildUnifiedDiff(proposal.beforeText, proposal.afterText);
  $("edit-diff").innerHTML = lines
    .map((line) => {
      const prefix = line.kind === "remove" ? "−" : line.kind === "add" ? "+" : " ";
      return `<span class="diff-${line.kind}"><b>${line.oldLine ?? ""}</b><b>${line.newLine ?? ""}</b><i>${prefix}</i>${escapeHtml(line.text)}</span>`;
    })
    .join("");
}
async function proposeEdit() {
  if (!state.editFilePath) return toast("Open a workspace file first.");
  try {
    const data = await api("/workspace/proposals", {
      method: "POST",
      body: JSON.stringify({
        projectId: $("project-select").value,
        path: state.editFilePath,
        afterText: $("edit-content").value,
      }),
    });
    state.editProposal = data.proposal;
    renderEditDiff(state.editProposal);
    $("edit-status").textContent = "Pending review · the file will be rechecked before writing.";
    $("approve-edit").hidden = false;
    $("reject-edit").hidden = false;
    toast("Change proposed. Review it before approving the write.");
  } catch (error) {
    toast(error.message);
  }
}
async function decideEdit(action) {
  if (!state.editProposal) return;
  try {
    const data = await api(
      `/edit-proposals/${encodeURIComponent(state.editProposal.id)}/${action}`,
      { method: "POST" },
    );
    state.editProposal = data;
    $("approve-edit").hidden = true;
    $("reject-edit").hidden = true;
    $("edit-status").textContent = action === "approve" ? "Approved and written." : "Rejected.";
    toast(action === "approve" ? "File written after approval." : "Edit rejected.");
    if (action === "approve") await loadWorkspace(state.workspacePath);
  } catch (error) {
    if (action === "approve" && /changed since/i.test(error.message)) {
      state.editProposal = { ...state.editProposal, status: "stale" };
      $("approve-edit").hidden = true;
      $("reject-edit").hidden = true;
      $("edit-status").textContent = "Stale proposal · the file changed outside this review.";
    }
    toast(error.message);
  }
}
async function openTerminal() {
  if (state.terminal?.status === "active") return toast("A terminal is already open.");
  const projectId = $("project-select").value;
  const cwd = state.workspacePath || $("workspace-path").value.trim();
  if (!projectId || !cwd) return toast("Choose a project workspace first.");
  const host = $("terminal-host").value || "local";
  const credentialId = $("terminal-credential").value;
  try {
    const terminal = await api("/terminals", {
      method: "POST",
      body: JSON.stringify({ projectId, cwd, host, ...(credentialId ? { credentialId } : {}) }),
    });
    state.terminal = terminal;
    state.terminalReconnectAttempts = 0;
    state.terminalSize = "";
    $("terminal-status").textContent =
      `Active · ${terminal.host} · ${terminal.cwd} · ${terminal.cols}×${terminal.rows}`;
    $("terminal-output").textContent = "";
    $("terminal-input").disabled = false;
    $("send-terminal").disabled = false;
    $("close-terminal").disabled = false;
    startTerminalStream(terminal.id);
    void resizeTerminal();
  } catch (error) {
    toast(error.message);
  }
}
function scheduleTerminalReconnect(id) {
  if (!state.terminal || state.terminal.id !== id || state.terminal.status !== "active") return;
  if (state.terminalReconnectAttempts >= 5) {
    $("terminal-status").textContent = "Stream unavailable · try closing and reopening";
    return;
  }
  state.terminalReconnectAttempts += 1;
  const delay = Math.min(500 * 2 ** (state.terminalReconnectAttempts - 1), 8000);
  $("terminal-status").textContent = `Reconnecting · attempt ${state.terminalReconnectAttempts}`;
  state.terminalReconnectTimer = setTimeout(() => {
    state.terminalReconnectTimer = null;
    void startTerminalStream(id);
  }, delay);
}
async function startTerminalStream(id) {
  state.terminalStreamAbort?.abort();
  const controller = new AbortController();
  state.terminalStreamAbort = controller;
  try {
    const response = await fetch(`/api/terminals/${encodeURIComponent(id)}/stream`, {
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error("Terminal stream is unavailable.");
    state.terminalReconnectAttempts = 0;
    if (state.terminal?.id === id) {
      $("terminal-status").textContent =
        `Active · ${state.terminal.host} · ${state.terminal.cwd} · ${state.terminal.cols}×${state.terminal.rows}`;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      buffer += decoder.decode(part.value, { stream: true });
      const records = buffer.split("\n\n");
      buffer = records.pop() || "";
      for (const record of records) {
        const line = record.split("\n").find((item) => item.startsWith("data: "));
        if (!line) continue;
        const event = JSON.parse(line.slice(6));
        const eventName = record.split("\n").find((item) => item.startsWith("event: ")) || "";
        if (eventName === "event: closed") {
          if (state.terminal?.id === id) {
            state.terminal.status = "closed";
            $("terminal-status").textContent = event.error
              ? `Terminal failed · ${event.error}`
              : "Terminal session ended";
            $("terminal-input").disabled = true;
            $("send-terminal").disabled = true;
          }
        } else if (record.startsWith("event: snapshot")) {
          $("terminal-output").textContent = event.text || "";
        } else {
          $("terminal-output").textContent += event.text || "";
        }
        $("terminal-output").scrollTop = $("terminal-output").scrollHeight;
      }
    }
    if (state.terminal?.id === id && state.terminal.status === "active") {
      state.terminal.status = "closed";
      $("terminal-status").textContent = "Terminal session ended";
      $("terminal-input").disabled = true;
      $("send-terminal").disabled = true;
    }
  } catch (error) {
    if (error.name !== "AbortError") scheduleTerminalReconnect(id);
  }
}
async function resizeTerminal() {
  if (!state.terminal || state.terminal.status !== "active") return;
  const output = $("terminal-output");
  const cols = Math.max(10, Math.min(500, Math.floor(output.clientWidth / 5.4)));
  const rows = Math.max(2, Math.min(200, Math.floor(output.clientHeight / 13.5)));
  const size = `${cols}×${rows}`;
  if (state.terminalSize === size) return;
  state.terminalSize = size;
  try {
    await api(`/terminals/${encodeURIComponent(state.terminal.id)}/resize`, {
      method: "POST",
      body: JSON.stringify({ cols, rows }),
    });
    state.terminal.cols = cols;
    state.terminal.rows = rows;
    $("terminal-status").textContent =
      `Active · ${state.terminal.host} · ${state.terminal.cwd} · ${size}`;
  } catch (error) {
    toast(error.message);
  }
}
async function sendTerminalInput() {
  if (!state.terminal) return;
  const input = $("terminal-input").value;
  if (!input) return;
  $("terminal-input").value = "";
  try {
    await api(`/terminals/${encodeURIComponent(state.terminal.id)}/input`, {
      method: "POST",
      body: JSON.stringify({ text: `${input}\n` }),
    });
  } catch (error) {
    toast(error.message);
  }
}
async function closeTerminal() {
  if (!state.terminal) return;
  try {
    await api(`/terminals/${encodeURIComponent(state.terminal.id)}/close`, { method: "POST" });
  } catch (error) {
    toast(error.message);
  }
  state.terminalStreamAbort?.abort();
  if (state.terminalReconnectTimer) clearTimeout(state.terminalReconnectTimer);
  state.terminalReconnectTimer = null;
  state.terminal = null;
  $("terminal-status").textContent = "Closed · choose a declared host";
  $("terminal-input").disabled = true;
  $("send-terminal").disabled = true;
  $("close-terminal").disabled = true;
  $("terminal-panel").hidden = false;
  $("show-terminal").hidden = true;
}
function hideTerminal() {
  $("terminal-panel").hidden = true;
  $("show-terminal").hidden = false;
}
function showTerminal() {
  $("terminal-panel").hidden = false;
  $("show-terminal").hidden = true;
}
async function copyTerminalOutput() {
  try {
    await navigator.clipboard.writeText($("terminal-output").textContent || "");
    toast("Terminal output copied.");
  } catch {
    toast("Clipboard access was blocked by the browser.");
  }
}
async function pasteTerminalInput() {
  try {
    $("terminal-input").value = await navigator.clipboard.readText();
    $("terminal-input").focus();
  } catch {
    toast("Clipboard access was blocked by the browser.");
  }
}
function renderFiles() {
  const files = filterFiles(state.files, $("file-search").value).slice(0, 20);
  $("file-list").innerHTML = files.length
    ? files
        .map(
          (file) =>
            `<div class="file-item"><span>${file.mimeType.startsWith("image/") ? "▧" : "▤"}</span><button data-file-preview="${escapeHtml(file.id)}">${escapeHtml(file.safeName || file.name)}</button><small>${Math.ceil(file.sizeBytes / 1024)}K</small><button class="file-attach ${state.pendingAttachments.includes(file.id) ? "attached" : ""}" data-file-attach="${escapeHtml(file.id)}">${state.pendingAttachments.includes(file.id) ? "Attached" : "Attach"}</button><button class="file-delete" data-file-delete="${escapeHtml(file.id)}" aria-label="Delete ${escapeHtml(file.safeName || file.name)}">×</button></div>`,
        )
        .join("")
    : "<span>Drop files here or use +</span>";
  document
    .querySelectorAll("[data-file-preview]")
    .forEach((button) =>
      button.addEventListener("click", () => void openFilePreview(button.dataset.filePreview)),
    );
  document
    .querySelectorAll("[data-file-delete]")
    .forEach((button) =>
      button.addEventListener("click", () => void deleteFile(button.dataset.fileDelete)),
    );
  document
    .querySelectorAll("[data-file-attach]")
    .forEach((button) =>
      button.addEventListener("click", () => toggleFileAttachment(button.dataset.fileAttach)),
    );
  renderPendingAttachments();
}
function renderPendingAttachments() {
  const container = $("composer-attachments");
  if (!container) return;
  const files = state.pendingAttachments
    .map((id) => state.files.find((file) => file.id === id))
    .filter(Boolean);
  container.hidden = !files.length;
  container.innerHTML = files
    .map(
      (file) =>
        `<span class="attachment-chip">${file.mimeType.startsWith("image/") ? `<img src="/api/files/${encodeURIComponent(file.id)}/preview" alt="" aria-hidden="true" />` : '<span class="attachment-icon" aria-hidden="true">▤</span>'}<button class="attachment-name" type="button" data-preview-attachment="${escapeHtml(file.id)}">${escapeHtml(file.safeName || file.name)}</button><button type="button" data-remove-attachment="${escapeHtml(file.id)}" aria-label="Remove ${escapeHtml(file.safeName || file.name)}">×</button></span>`,
    )
    .join("");
  container
    .querySelectorAll("[data-preview-attachment]")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => void openFilePreview(button.dataset.previewAttachment),
      ),
    );
  container
    .querySelectorAll("[data-remove-attachment]")
    .forEach((button) =>
      button.addEventListener("click", () => toggleFileAttachment(button.dataset.removeAttachment)),
    );
}
function clearComposer() {
  $("composer-input").value = "";
  $("composer-input").style.height = "auto";
  state.draft = "";
  state.pendingText = "";
  localStorage.removeItem("flan-draft");
  state.pendingAttachments = [];
  renderPendingAttachments();
}
function toggleFileAttachment(id) {
  if (!id) return;
  if (state.pendingAttachments.includes(id))
    state.pendingAttachments = state.pendingAttachments.filter((item) => item !== id);
  else {
    if (state.pendingAttachments.length >= 4) return toast("Attach up to four files per message.");
    state.pendingAttachments.push(id);
  }
  renderFiles();
}
async function openFilePreview(id) {
  const file = state.files.find((item) => item.id === id);
  if (!file) return;
  const kind = previewKind(file);
  $("file-preview-card").hidden = false;
  $("file-preview-card").open = true;
  $("file-preview-title").textContent = file.safeName || file.name;
  const body = $("file-preview-body");
  body.innerHTML = "<span>Loading preview…</span>";
  if (kind === "image") {
    body.innerHTML = `<img src="/api/files/${encodeURIComponent(file.id)}/preview" alt="${escapeHtml(file.safeName || file.name)}" />`;
    return;
  }
  if (kind === "download") {
    body.innerHTML = `<p>This file type is not previewed in the browser.</p><a class="primary-button" href="/api/files/${encodeURIComponent(file.id)}/download">Download file</a>`;
    return;
  }
  try {
    const response = await fetch(`/api/files/${encodeURIComponent(file.id)}/preview`);
    if (!response.ok) throw new Error("Preview is unavailable.");
    const pre = document.createElement("pre");
    pre.textContent = await response.text();
    body.replaceChildren(pre);
  } catch (error) {
    body.textContent = error.message;
  }
}
async function deleteFile(id) {
  const file = state.files.find((item) => item.id === id);
  if (!file || !window.confirm(`Delete ${file.safeName || file.name}?`)) return;
  try {
    await api(`/files/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!$("file-preview-card").hidden && $("file-preview-title").textContent === file.safeName)
      $("file-preview-card").hidden = true;
    await loadFiles();
    toast("File deleted.");
  } catch (error) {
    toast(error.message);
  }
}
function uploadFile(file, { autoAttach = false } = {}) {
  if (file.size > 10 * 1024 * 1024) {
    toast(`${file.name} is too large.`);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/files");
      xhr.setRequestHeader("content-type", "application/json");
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable)
          $("file-list").innerHTML =
            `<span>Uploading ${escapeHtml(file.name)} · ${Math.round((event.loaded / event.total) * 100)}%</span>`;
      };
      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const uploaded = JSON.parse(xhr.responseText);
          if (autoAttach && uploaded.id && !state.pendingAttachments.includes(uploaded.id)) {
            if (state.pendingAttachments.length < 4) state.pendingAttachments.push(uploaded.id);
            else toast("Attach up to four files per message.");
          }
          await loadFiles();
          renderPendingAttachments();
          toast(`${file.name} uploaded.`);
        } else toast(`${file.name} could not be uploaded.`);
        resolve();
      };
      xhr.onerror = () => {
        toast(`${file.name} could not be uploaded.`);
        resolve();
      };
      const inferred =
        file.type ||
        {
          md: "text/markdown",
          markdown: "text/markdown",
          txt: "text/plain",
          json: "application/json",
          csv: "text/csv",
          js: "text/javascript",
          ts: "text/javascript",
          css: "text/css",
        }[file.name.split(".").pop().toLowerCase()] ||
        "application/octet-stream";
      xhr.send(
        JSON.stringify({
          name: file.name,
          mimeType: inferred,
          contentBase64: String(reader.result).split(",")[1],
          projectId: $("project-select").value || undefined,
          sessionId: state.activeId || undefined,
        }),
      );
    };
    reader.onerror = () => {
      toast(`${file.name} could not be read.`);
      resolve();
    };
    reader.readAsDataURL(file);
  });
}
async function uploadFiles(files, options = {}) {
  for (const file of files) await uploadFile(file, options);
}
async function loadModels() {
  try {
    const data = await api("/models");
    const models = data.models || [];
    state.modelOptions = models;
    state.defaultModelId = models[0]?.id || "";
    const options = models
      .map(
        (model) =>
          `<option value="${escapeHtml(model.id)}">${escapeHtml(model.name || model.id)}</option>`,
      )
      .join("");
    $("model-select").innerHTML = '<option value="">Model · auto</option>' + options;
    $("settings-model").innerHTML = '<option value="">Automatic</option>' + options;
  } catch {
    $("model-select").innerHTML = '<option value="">Model · auto</option>';
    $("settings-model").innerHTML = '<option value="">Automatic</option>';
  }
}
async function createSession() {
  hideCommandMenu();
  try {
    const session = await api("/sessions", {
      method: "POST",
      body: JSON.stringify({ title: "New conversation" }),
    });
    state.sessions.unshift(session);
    await openSession(session.id);
  } catch (error) {
    toast(error.message);
  }
}
async function updateSessionOrganization(sessionId, patch) {
  if (!sessionId) return toast("Choose a conversation first.");
  try {
    const session = await api(`/sessions/${encodeURIComponent(sessionId)}/organization`, {
      method: "POST",
      body: JSON.stringify(patch),
    });
    if (sessionId === state.activeId) renderSession(session);
    await loadSessions();
    toast("Conversation organization updated.");
  } catch (error) {
    toast(error.message);
  }
}
async function updateOrganization(patch) {
  return updateSessionOrganization(state.activeId, patch);
}
async function reconnectActiveSessionIfNeeded(session) {
  const hasWorkingMessage = (session.messages || []).some(
    (message) => message.status === "working",
  );
  if (session.status !== "running" && !hasWorkingMessage) return false;
  const refreshed = await api(`/sessions/${encodeURIComponent(session.id)}/reconnect`, {
    method: "POST",
    body: JSON.stringify({ after: state.events.length }),
  });
  renderSession(refreshed);
  for (const event of refreshed.replay || []) addActivity(event);
  await loadJobs();
  const stillRunning = refreshed.reconnect?.status === "running";
  state.running = stillRunning;
  $("run-strip").hidden = !stillRunning;
  $("run-status").textContent = stillRunning ? "ACTIVE" : "IDLE";
  $("run-label").textContent = stillRunning
    ? "Hermes is still working after FlanCommand restarted."
    : "Hermes completed while FlanCommand was restarting.";
  $("stop-run").hidden = !stillRunning;
  $("reconnect-run").hidden = !stillRunning;
  $("send-button").disabled = stillRunning;
  if (!stillRunning) toast("Recovered the completed Hermes run after FlanCommand restarted.");
  return true;
}
async function retryInterruptedSession(id) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 10000)));
    try {
      const session = await api(`/sessions/${encodeURIComponent(id)}`);
      await reconnectActiveSessionIfNeeded(session);
      if (!state.running) {
        state.recovering = false;
        $("run-strip").hidden = true;
        $("run-status").textContent = "IDLE";
        $("send-button").disabled = false;
        return;
      }
    } catch {
      // The container may still be rebuilding. Continue with bounded backoff.
    }
  }
}
async function openSession(id) {
  try {
    const session = await api(`/sessions/${encodeURIComponent(id)}`);
    state.pendingAttachments = [];
    renderSession(session);
    renderFiles();
    await loadCommands(id);
    await reconnectActiveSessionIfNeeded(session);
    closeSideDrawer({ restoreFocus: false });
  } catch (error) {
    toast(error.message);
  }
}
async function loadCommands(id) {
  try {
    const data = await api(`/sessions/${encodeURIComponent(id)}/commands`);
    state.commands = data.commands || [];
  } catch {
    state.commands = [];
  }
}
function hideCommandMenu() {
  $("command-menu").hidden = true;
}
function filesystemTokenContext() {
  const input = $("composer-input");
  const value = input.value;
  const caret = input.selectionStart ?? value.length;
  const before = value.slice(0, caret);
  const tokenStart = Math.max(before.lastIndexOf(" "), before.lastIndexOf("\n")) + 1;
  const token = before.slice(tokenStart);
  if (!token.startsWith("/")) return null;
  const slash = token.lastIndexOf("/");
  const directory = slash <= 0 ? "/" : token.slice(0, slash) || "/";
  return {
    tokenStart,
    tokenEnd: caret,
    token,
    directory,
    prefix: token.slice(slash + 1).toLowerCase(),
  };
}
function activeProjectHasRemoteFilesystem() {
  const project = state.projects.find((item) => item.id === $("project-select").value);
  return Boolean(
    project?.hosts?.some(
      (host) => host !== "local" && host !== "127.0.0.1" && host !== "localhost",
    ) ||
    (project && project.id !== "project-local"),
  );
}
function hideFilesystemPicker() {
  state.filesystemPicker.open = false;
  $("filesystem-picker").hidden = true;
  $("filesystem-picker-list").replaceChildren();
  $("filesystem-picker-status").textContent = "";
}
function filesystemMatches() {
  const context = filesystemTokenContext();
  const prefix = context?.prefix ?? "";
  return state.filesystemPicker.entries.filter((entry) =>
    entry.name.toLowerCase().startsWith(prefix),
  );
}
function renderFilesystemPicker() {
  const picker = $("filesystem-picker");
  const list = $("filesystem-picker-list");
  const matches = filesystemMatches();
  state.filesystemPicker.selectedIndex = Math.max(
    0,
    Math.min(state.filesystemPicker.selectedIndex, Math.max(0, matches.length - 1)),
  );
  $("filesystem-picker-path").textContent = state.filesystemPicker.path;
  list.replaceChildren(
    ...matches.map((entry, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = index === state.filesystemPicker.selectedIndex ? "selected" : "";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(index === state.filesystemPicker.selectedIndex));
      button.dataset.filesystemPath = entry.path;
      button.dataset.filesystemType = entry.type;
      button.innerHTML =
        '<span aria-hidden="true">' +
        (entry.type === "directory" ? "▸" : entry.type === "symlink" ? "⌁" : "▤") +
        "</span><b>" +
        escapeHtml(entry.name) +
        "</b><small>" +
        entry.type +
        "</small>";
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => activateFilesystemEntry(entry));
      return button;
    }),
  );
  if (!matches.length && !$("filesystem-picker-status").textContent)
    $("filesystem-picker-status").textContent = "No matching files or folders.";
}
async function loadFilesystemPicker(path, context = filesystemTokenContext()) {
  if (!context) return;
  const projectId = $("project-select").value || "";
  if (!projectId) {
    $("filesystem-picker-status").textContent = "Choose a project with a declared Gospel host.";
    return;
  }
  const requestId = ++state.filesystemPicker.requestId;
  state.filesystemPicker.open = true;
  state.filesystemPicker.path = path;
  state.filesystemPicker.entries = [];
  state.filesystemPicker.selectedIndex = 0;
  state.filesystemPicker.tokenStart = context.tokenStart;
  state.filesystemPicker.tokenEnd = context.tokenEnd;
  $("filesystem-picker").hidden = false;
  $("filesystem-picker-status").textContent = "Loading Gospel filesystem…";
  renderFilesystemPicker();
  try {
    const params = new URLSearchParams({ projectId, path });
    const data = await api("/filesystem/list?" + params);
    if (requestId !== state.filesystemPicker.requestId) return;
    state.filesystemPicker.path = data.path;
    state.filesystemPicker.entries = data.entries || [];
    $("filesystem-picker-status").textContent = "";
    renderFilesystemPicker();
  } catch (error) {
    if (requestId !== state.filesystemPicker.requestId) return;
    $("filesystem-picker-status").textContent = error.message;
    renderFilesystemPicker();
  }
}
function replaceFilesystemToken(path) {
  const input = $("composer-input");
  const context = filesystemTokenContext();
  if (!context) return;
  input.setRangeText(path, context.tokenStart, context.tokenEnd, "end");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
}
function activateFilesystemEntry(entry) {
  if (entry.type === "directory") {
    replaceFilesystemToken(entry.path + "/");
    void loadFilesystemPicker(entry.path);
    return;
  }
  replaceFilesystemToken(entry.path);
  hideFilesystemPicker();
}
function completeFilesystemPicker() {
  if (!state.filesystemPicker.open) return false;
  const matches = filesystemMatches();
  const entry = matches[state.filesystemPicker.selectedIndex];
  if (!entry) return true;
  activateFilesystemEntry(entry);
  return true;
}
function moveFilesystemSelection(direction) {
  if (!state.filesystemPicker.open) return false;
  const matches = filesystemMatches();
  if (!matches.length) return true;
  state.filesystemPicker.selectedIndex =
    (state.filesystemPicker.selectedIndex + direction + matches.length) % matches.length;
  renderFilesystemPicker();
  return true;
}
function commandContext() {
  const input = $("composer-input");
  const value = input.value;
  const caret = input.selectionStart ?? value.length;
  const before = value.slice(0, caret);
  const tokenStart = Math.max(before.lastIndexOf(" "), before.lastIndexOf("\n")) + 1;
  const token = before.slice(tokenStart);
  if (!token.startsWith("/")) {
    return { start: caret, end: caret, query: "", active: false };
  }
  let tokenEnd = caret;
  while (tokenEnd < value.length && !/[\s]/.test(value[tokenEnd])) tokenEnd += 1;
  return { start: tokenStart, end: tokenEnd, query: token.slice(1).toLowerCase(), active: true };
}
function commandMatches(query = commandContext().query) {
  return state.commands.filter((command) => command.name.toLowerCase().includes(query));
}
function insertCommand(command) {
  const input = $("composer-input");
  const context = commandPickerSelection || commandContext();
  commandPickerSelection = null;
  const value = input.value;
  const following = value.slice(context.end);
  const separator = following && /^[\s]/.test(following) ? "" : " ";
  input.setRangeText(`${command}${separator}`, context.start, context.end, "end");
  hideCommandMenu();
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
}
function renderCommandMenu({ forceOpen = false } = {}) {
  const menu = $("command-menu");
  const context = commandContext();
  if (!forceOpen && !context.active) {
    hideCommandMenu();
    return;
  }
  const commands = commandMatches(context.query);
  menu.innerHTML = commands.length
    ? commands
        .map(
          (command) =>
            `<button type="button" data-command="${escapeHtml(command.name)}"><b>${escapeHtml(command.name)}</b><small>${escapeHtml(command.description || "Run Hermes command")}</small></button>`,
        )
        .join("")
    : '<div class="command-empty">No slash commands available.</div>';
  menu.hidden = false;
  menu.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      insertCommand(button.dataset.command);
    });
  });
}
function completeCommand() {
  const context = commandContext();
  const commands = commandMatches(context.query);
  if (!context.active || !commands.length) return false;
  insertCommand(commands[0].name);
  return true;
}
function formatTokenCount(value) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return String(value);
}
function renderRunMonitors() {
  const elapsed = state.startedAt ? (Date.now() - state.startedAt) / 1000 : state.elapsedSeconds;
  const toolElapsed = state.toolStartedAt
    ? (Date.now() - state.toolStartedAt) / 1000
    : state.toolElapsedSeconds;
  $("elapsed-monitor").textContent = runtimeMonitorLabel(
    "◷",
    elapsed,
    state.elapsedCompleted && !state.startedAt,
  );
  $("tool-monitor").textContent = runtimeMonitorLabel(
    "⚒",
    toolElapsed,
    state.toolElapsedCompleted && !state.toolStartedAt,
  );
  const used = state.contextUsage.totalTokens || 0;
  const max = state.contextUsage.contextWindow || 0;
  const percentage = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  $("context-token-value").textContent = max
    ? `${formatTokenCount(used)} / ${formatTokenCount(max)}`
    : "— / —";
  $("composer-context-meter").style.width = `${percentage}%`;
  $("composer-context-percent").textContent = max ? `${percentage}%` : "—";
  $("context-meter").style.width = `${percentage}%`;
  $("context-value").textContent = max ? `${percentage}%` : "—";
}
function startMonitorTimer() {
  clearInterval(state.elapsedTimer);
  state.elapsedTimer = setInterval(renderRunMonitors, 1000);
  renderRunMonitors();
}
function stopMonitorTimer() {
  clearInterval(state.elapsedTimer);
  state.elapsedTimer = null;
  renderRunMonitors();
}
function addActivity(event) {
  const label = activityLabel(event);
  state.events.push(event);
  if (state.events.length > 120) state.events.shift();
  $("raw-events").textContent = state.events.map((item) => JSON.stringify(item)).join("\n");
  if (!label) return;
  const item = activityRow(event, label);
  const activity = $("activity");
  if (!state.activityExpanded) activity.replaceChildren(item);
  else {
    activity.append(item);
    while (activity.children.length > 12) activity.firstElementChild.remove();
  }
  $("focus-title").textContent = label;
  const liveActivity = $("live-activity");
  if (liveActivity) {
    liveActivity.hidden = false;
    liveActivity.querySelector("span:last-child").textContent = label;
  }
  if (event.type === "run.started") {
    state.startedAt = Date.now();
    state.elapsedSeconds = null;
    state.elapsedCompleted = false;
    state.toolElapsedSeconds = null;
    state.toolElapsedCompleted = false;
    startMonitorTimer();
  }
  if (event.type === "tool.started") {
    state.toolStartedAt = Date.now();
    state.toolElapsedSeconds = null;
    state.toolElapsedCompleted = false;
    renderRunMonitors();
  }
  if (["tool.completed", "tool.failed"].includes(event.type)) {
    state.toolElapsedSeconds = state.toolStartedAt
      ? Math.floor((Date.now() - state.toolStartedAt) / 1000)
      : state.toolElapsedSeconds;
    state.toolElapsedCompleted = true;
    state.toolStartedAt = null;
    renderRunMonitors();
  }
  if (["run.completed", "run.failed", "run.stopped"].includes(event.type)) {
    const durationSeconds = state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0;
    state.elapsedSeconds = state.startedAt
      ? Math.floor((Date.now() - state.startedAt) / 1000)
      : state.elapsedSeconds;
    state.elapsedCompleted = true;
    if (state.toolStartedAt) {
      state.toolElapsedSeconds = Math.floor((Date.now() - state.toolStartedAt) / 1000);
      state.toolElapsedCompleted = true;
      state.toolStartedAt = null;
    }
    state.activitySummary = {
      durationSeconds,
      toolCalls: state.events.filter((item) => item.type === "tool.started").length,
      approvals: state.events.filter((item) => item.type === "approval.requested").length,
      status: event.type === "run.completed" ? "Worked" : event.type.replace("run.", ""),
    };
    stopMonitorTimer();
    $("elapsed-value").textContent = state.startedAt ? `${state.elapsedSeconds}s` : "—";
    state.startedAt = null;
    renderRunMonitors();
  }
  if (event.type === "context.updated") {
    state.contextUsage = {
      ...state.contextUsage,
      ...event.usage,
    };
    renderRunMonitors();
  }
  if (event.type === "run.completed" && event.summary?.usage) {
    state.contextUsage = {
      ...state.contextUsage,
      ...event.summary.usage,
    };
    renderRunMonitors();
    $("token-value").textContent = String(event.summary.usage.totalTokens || "—");
  }
  if (event.type === "artifact.created") void loadArtifacts();
  $("run-status").textContent = ["run.completed", "run.failed", "run.stopped"].includes(event.type)
    ? "DONE"
    : "ACTIVE";
  if (
    ["run.completed", "run.failed", "run.stopped"].includes(event.type) &&
    !state.activityExpanded
  )
    renderActivitySummary();
}
function renderActivitySummary() {
  const summary = state.activitySummary;
  if (!summary) return;
  const toolLabel = `${summary.toolCalls} tool call${summary.toolCalls === 1 ? "" : "s"}`;
  const approvalLabel = `${summary.approvals} approval${summary.approvals === 1 ? "" : "s"}`;
  $("activity").innerHTML =
    '<div class="activity-summary-card"><strong>' +
    escapeHtml(summary.status) +
    " for " +
    summary.durationSeconds +
    "s</strong><span>" +
    toolLabel +
    " · " +
    approvalLabel +
    "</span></div>";
}
function renderCompletedActivityChip(summary) {
  const assistants = $("messages").querySelectorAll(".message.assistant");
  const assistant = assistants[assistants.length - 1];
  if (!assistant || !summary) return;
  const meta = assistant.querySelector(".message-meta");
  if (!meta || meta.querySelector(".activity-chip")) return;
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "activity-chip";
  chip.setAttribute("aria-label", "Show Hermes activity details");
  chip.textContent = activitySummaryLabel(summary);
  chip.addEventListener("click", () => {
    openSideDrawer("details", chip);
    if (!state.activityExpanded) $("activity-toggle").click();
  });
  meta.append(" ", chip);
}
function activityRow(event, label = activityLabel(event)) {
  const item = document.createElement("div");
  item.className = "activity-item";
  item.innerHTML = `<i>•</i><span>${escapeHtml(label || event.type)}</span>`;
  const detail = activityDetail(event);
  if (detail) {
    const pre = document.createElement("pre");
    pre.textContent = detail;
    item.append(pre);
  }
  return item;
}
function appendLiveAssistantMessage(at = new Date().toISOString()) {
  $("messages").insertAdjacentHTML(
    "beforeend",
    `<article class="message assistant" id="live-message" data-message-id="live-assistant-${Date.now()}"><div class="bubble"></div><div class="live-activity" id="live-activity" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span><span>Hermes is working…</span></div><span class="message-meta">Hermes · working<time datetime="${escapeHtml(at)}">${escapeHtml(formatMessageTimestamp(at))}</time></span></article>`,
  );
}
function completeLiveAssistantMessage(at = new Date().toISOString()) {
  const liveMessage = $("live-message");
  if (!liveMessage) return;
  liveMessage.removeAttribute("id");
  liveMessage.querySelector(".live-activity")?.remove();
  const meta = liveMessage.querySelector(".message-meta");
  if (meta)
    meta.innerHTML = `Hermes · complete<time datetime="${escapeHtml(at)}">${escapeHtml(formatMessageTimestamp(at))}</time>`;
}
async function send(text) {
  if (state.running || !state.activeId) return;
  state.running = true;
  $("send-button").disabled = true;
  state.pendingText = text;
  state.recovering = false;
  const attachmentIds = [...state.pendingAttachments];
  const attachmentNames = attachmentIds
    .map((id) => state.files.find((file) => file.id === id)?.safeName)
    .filter(Boolean);
  state.events = [];
  state.activitySummary = null;
  state.startedAt = null;
  state.elapsedSeconds = null;
  state.elapsedCompleted = false;
  state.toolStartedAt = null;
  state.toolElapsedSeconds = null;
  state.toolElapsedCompleted = false;
  renderRunMonitors();
  $("raw-events").textContent = "No events yet.";
  $("activity").innerHTML =
    '<div class="activity-empty"><span>✦</span><p>Listening for Hermes activity…</p></div>';
  $("run-strip").hidden = false;
  $("stop-run").hidden = false;
  $("reconnect-run").hidden = true;
  $("run-status").textContent = "ACTIVE";
  $("run-label").textContent = "Hermes is working";
  $("focus-title").textContent = "Working on your request";
  const controller = new AbortController();
  state.abort = controller;
  const messages = $("messages");
  $("welcome").style.display = "none";
  const userMessageAt = new Date().toISOString();
  messages.insertAdjacentHTML(
    "beforeend",
    renderChatMessage({
      id: `live-user-${Date.now()}`,
      role: "user",
      text,
      at: userMessageAt,
      status: "complete",
      ...(attachmentNames.length ? { attachments: attachmentNames } : {}),
    }),
  );
  clearComposer();
  $("message-scroll").scrollTop = $("message-scroll").scrollHeight;
  try {
    const response = await fetch(`/api/sessions/${encodeURIComponent(state.activeId)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, ...(attachmentIds.length ? { fileIds: attachmentIds } : {}) }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error("Hermes did not accept the message");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let liveText = "";
    const live = () => document.querySelector("#live-message .bubble");
    const ensureLiveMessage = () => {
      if (!live()) appendLiveAssistantMessage();
      return live();
    };
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      buffer += decoder.decode(part.value, { stream: true });
      const records = buffer.split("\n\n");
      buffer = records.pop() || "";
      for (const record of records) {
        const data = record
          .split("\n")
          .find((line) => line.startsWith("data: "))
          ?.slice(6);
        const eventName = record
          .split("\n")
          .find((line) => line.startsWith("event: "))
          ?.slice(7);
        if (!data) continue;
        const event = JSON.parse(data);
        if (eventName === "session" && event.type === "replaced" && event.session?.id) {
          state.activeId = event.session.id;
          continue;
        }
        if (eventName === "error") {
          throw new Error(event.error?.message || "Hermes rejected the message.");
        }
        if (eventName === "agent") {
          addActivity(event);
          if (event.type === "approval.requested") {
            state.approvals = [
              ...state.approvals.filter((item) => item.id !== event.approval.id),
              {
                id: event.approval.id,
                description: event.approval.description || event.approval.action,
                sessionId: state.activeId,
                decision: "pending",
                evaluation: { risk: "Review" },
                createdAt: new Date().toISOString(),
              },
            ];
            renderConversationApprovals(state.activeId);
          }
          if (
            shouldSeparateAssistantMessage(event) &&
            (event.type === "message.completed" || liveText.trim().length > 0)
          ) {
            completeLiveAssistantMessage();
            liveText = "";
          }
          if (event.type === "message.delta") {
            liveText += event.text;
            const liveBubble = ensureLiveMessage();
            if (liveBubble) liveBubble.innerHTML = renderText(liveText);
          }
        }
      }
      $("message-scroll").scrollTop = $("message-scroll").scrollHeight;
    }
    const completedActivity = state.activitySummary;
    await openSession(state.activeId);
    renderCompletedActivityChip(completedActivity);
    state.pendingText = "";
    state.draft = "";
    state.pendingAttachments = [];
    renderFiles();
    localStorage.removeItem("flan-draft");
  } catch (error) {
    const recovery = recoveryForSendFailure(error, text);
    if (recovery) {
      const liveBubble = document.querySelector("#live-message .bubble");
      if (liveBubble) liveBubble.textContent = error.message;
      $("composer-input").value = recovery.draft;
      state.draft = recovery.draft;
      localStorage.setItem("flan-draft", recovery.draft);
      state.recovering = true;
      $("send-button").disabled = true;
      $("run-label").textContent = "Connection lost. Your message is saved.";
      $("stop-run").hidden = true;
      $("reconnect-run").hidden = false;
      toast(error.message);
      void retryInterruptedSession(state.activeId);
    } else {
      const liveBubble = document.querySelector("#live-message .bubble");
      if (liveBubble) liveBubble.textContent = error.message;
      toast(error.message);
    }
  } finally {
    state.running = false;
    state.abort = null;
    if (!state.recovering) {
      $("run-strip").hidden = true;
      $("run-status").textContent = "IDLE";
      $("send-button").disabled = false;
    } else {
      $("run-status").textContent = "RECONNECT";
    }
  }
}
$("composer").addEventListener("submit", (event) => {
  event.preventDefault();
  hideCommandMenu();
  hideFilesystemPicker();
  const text = $("composer-input").value.trim();
  if (text) void send(text);
});
$("command-picker-composer").addEventListener("mousedown", (event) => {
  event.preventDefault();
});

$("command-picker-composer").addEventListener("click", () => {
  hideFilesystemPicker();
  const input = $("composer-input");
  const menu = $("command-menu");
  if (!menu.hidden) {
    hideCommandMenu();
    return;
  }
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  commandPickerSelection = { start, end };
  input.focus();
  input.setSelectionRange(start, end);
  renderCommandMenu({ forceOpen: true });
});
$("composer-input").addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideCommandMenu();
    hideFilesystemPicker();
    return;
  }
  if (event.key === "ArrowDown" && moveFilesystemSelection(1)) {
    event.preventDefault();
    return;
  }
  if (event.key === "ArrowUp" && moveFilesystemSelection(-1)) {
    event.preventDefault();
    return;
  }
  if (event.key === "Tab") {
    event.preventDefault();
    if (!completeFilesystemPicker() && !completeCommand()) {
      const input = event.currentTarget;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      input.setRangeText("\t", start, end, "end");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    return;
  }
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (state.filesystemPicker.open) {
      completeFilesystemPicker();
      return;
    }
    $("composer").requestSubmit();
  }
});
$("composer-input").addEventListener("input", (event) => {
  event.target.style.height = "auto";
  event.target.style.height = `${Math.min(event.target.scrollHeight, 140)}px`;
  state.draft = event.target.value;
  localStorage.setItem("flan-draft", state.draft);
  const filesystemContext = filesystemTokenContext();
  if (filesystemContext && activeProjectHasRemoteFilesystem()) {
    hideCommandMenu();
    void loadFilesystemPicker(filesystemContext.directory, filesystemContext);
  } else {
    hideFilesystemPicker();
    renderCommandMenu();
  }
});
$("filesystem-use-folder").addEventListener("click", () => {
  replaceFilesystemToken(state.filesystemPicker.path);
  hideFilesystemPicker();
});
$("stop-run").addEventListener("click", async () => {
  if (state.abort) state.abort.abort();
  if (state.activeId)
    try {
      await api(`/sessions/${encodeURIComponent(state.activeId)}/stop`, { method: "POST" });
    } catch (error) {
      toast(error.message);
    }
});
$("reconnect-run").addEventListener("click", async () => {
  if (!state.activeId) return;
  const button = $("reconnect-run");
  button.disabled = true;
  try {
    const refreshed = await api(`/sessions/${encodeURIComponent(state.activeId)}/reconnect`, {
      method: "POST",
      body: JSON.stringify({ after: state.events.length }),
    });
    renderSession(refreshed);
    for (const event of refreshed.replay || []) addActivity(event);
    await loadJobs();
    state.recovering = false;
    const stillRunning = refreshed.reconnect?.status === "running";
    state.running = stillRunning;
    $("run-strip").hidden = !stillRunning;
    $("run-status").textContent = stillRunning ? "ACTIVE" : "IDLE";
    $("run-label").textContent = stillRunning
      ? "Hermes is still working. Refresh again when it settles."
      : "Hermes is working";
    $("stop-run").hidden = !stillRunning;
    $("reconnect-run").hidden = !stillRunning;
    $("send-button").disabled = stillRunning;
    toast("Session refreshed. Check the latest job before sending again.");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});
$("new-session").addEventListener("click", () => void createSession());
let searchTimer;
$("search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void loadSessions(), 180);
});
$("rename-session").addEventListener("click", () => {
  const session = state.sessions.find((item) => item.id === state.activeId);
  const title = window.prompt("Conversation name:", session?.title || "");
  if (title !== null) void updateOrganization({ customTitle: title });
});
$("pin-session").addEventListener("click", () => {
  const session = state.sessions.find((item) => item.id === state.activeId);
  void updateOrganization({ isPinned: !session?.isPinned });
});
$("archive-session").addEventListener("click", () => {
  if (window.confirm("Archive this conversation?")) void updateOrganization({ archived: true });
});
$("folder-select").addEventListener(
  "change",
  () => void updateOrganization({ folderId: $("folder-select").value || null }),
);
$("add-folder").addEventListener("click", async () => {
  const name = window.prompt("Folder name:");
  if (!name) return;
  try {
    await api("/folders", { method: "POST", body: JSON.stringify({ name }) });
    await loadFolders();
    toast("Folder created.");
  } catch (error) {
    toast(error.message);
  }
});
$("project-select").addEventListener("change", async (event) => {
  renderPermissionMode();
  renderTerminalHosts();
  if (!state.activeId || !event.target.value) return;
  try {
    await api(`/sessions/${encodeURIComponent(state.activeId)}/project`, {
      method: "POST",
      body: JSON.stringify({ projectId: event.target.value }),
    });
    toast("Project boundary applied to this conversation.");
  } catch (error) {
    toast(error.message);
  }
  await loadFiles();
  await loadCredentials();
  state.workspacePath = "";
  await loadWorkspace();
});
$("permission-mode").addEventListener(
  "change",
  (event) => void updatePermissionMode(event.target.value),
);
$("conversation-permission").addEventListener("change", async (event) => {
  if (!state.activeId) return;
  const select = event.target;
  try {
    const session = await api(`/sessions/${encodeURIComponent(state.activeId)}/policy`, {
      method: "POST",
      body: JSON.stringify({ mode: select.value }),
    });
    const index = state.sessions.findIndex((item) => item.id === state.activeId);
    if (index >= 0) state.sessions[index] = session;
    renderConversationPermission(session);
    toast(
      select.value === "inherit"
        ? "Using project permission mode."
        : "Conversation override applied.",
    );
  } catch (error) {
    renderConversationPermission();
    toast(error.message);
  }
});
$("add-project").addEventListener("click", () => void createProject());
$("edit-project").addEventListener("click", () => void editProject());
$("archive-project").addEventListener("click", () => void archiveProject());
$("project-form").addEventListener("submit", (event) => void saveProject(event));
$("project-cancel").addEventListener("click", closeProjectForm);
$("project-close").addEventListener("click", closeProjectForm);
$("credential-form").addEventListener("submit", (event) => void saveCredential(event));
$("credential-cancel").addEventListener("click", closeCredentialForm);
$("credential-close").addEventListener("click", closeCredentialForm);
$("credential-provide-form").addEventListener(
  "submit",
  (event) => void provideDrawerCredential(event),
);
$("credential-provide-cancel").addEventListener("click", closeCredentialChooser);
$("credential-provide-close").addEventListener("click", closeCredentialChooser);
$("workspace-open").addEventListener(
  "click",
  () => void loadWorkspace($("workspace-path").value.trim()),
);
$("workspace-search-button").addEventListener("click", () => void searchWorkspace());
$("workspace-search").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void searchWorkspace();
  }
});
$("workspace-new-file").addEventListener("click", beginNewFile);
$("new-file-start").addEventListener("click", startNewFileEditor);
$("new-file-cancel").addEventListener("click", cancelNewFile);
$("propose-edit").addEventListener("click", () => void proposeEdit());
$("approve-edit").addEventListener("click", () => void decideEdit("approve"));
$("reject-edit").addEventListener("click", () => void decideEdit("reject"));
$("open-terminal").addEventListener("click", () => void openTerminal());
$("send-terminal").addEventListener("click", () => void sendTerminalInput());
$("close-terminal").addEventListener("click", () => void closeTerminal());
$("terminal-hide").addEventListener("click", hideTerminal);
$("show-terminal").addEventListener("click", showTerminal);
$("terminal-copy").addEventListener("click", () => void copyTerminalOutput());
$("terminal-paste").addEventListener("click", () => void pasteTerminalInput());
document
  .querySelectorAll("summary button")
  .forEach((button) => button.addEventListener("click", (event) => event.stopPropagation()));
if ("ResizeObserver" in window) {
  new ResizeObserver(() => void resizeTerminal()).observe($("terminal-output"));
}
$("terminal-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") void sendTerminalInput();
});
$("add-credential").addEventListener("click", openCredentialForm);
$("attach-file").addEventListener("click", () => {
  state.uploadToComposer = false;
  $("file-input").click();
});
$("attach-file-composer").addEventListener("click", () => {
  state.uploadToComposer = true;
  $("file-input").click();
});
$("file-input").addEventListener("change", (event) => {
  const autoAttach = state.uploadToComposer;
  state.uploadToComposer = false;
  void uploadFiles([...event.target.files], { autoAttach });
  event.target.value = "";
});
let fileSearchTimer;
$("file-search").addEventListener("input", () => {
  clearTimeout(fileSearchTimer);
  fileSearchTimer = setTimeout(() => void loadFiles(), 180);
});
$("file-preview-close").addEventListener("click", () => {
  $("file-preview-card").hidden = true;
});
$("composer").addEventListener("dragover", (event) => {
  event.preventDefault();
  $("composer").classList.add("drop-ready");
});
$("composer").addEventListener("dragleave", () => $("composer").classList.remove("drop-ready"));
$("composer").addEventListener("drop", (event) => {
  event.preventDefault();
  $("composer").classList.remove("drop-ready");
  void uploadFiles([...event.dataTransfer.files], { autoAttach: true });
});
$("composer").addEventListener("paste", (event) => {
  const files = [...(event.clipboardData?.files || [])];
  if (!files.length && event.clipboardData?.items) {
    for (const item of event.clipboardData.items) {
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (!files.length) return;
  event.preventDefault();
  void uploadFiles(files, { autoAttach: true });
});
$("approval-inbox").addEventListener("click", async () => {
  await loadApprovals();
  openDrawer("approvals");
});
$("memory-viewer").addEventListener("click", () => void loadMemory());
$("notification-bell").addEventListener("click", async () => {
  await loadNotifications();
  openDrawer("notifications");
  if (
    state.settings?.notifications &&
    "Notification" in window &&
    Notification.permission === "default"
  )
    void Notification.requestPermission().catch(() => {});
});
$("job-dashboard").addEventListener("click", async () => {
  await loadJobs();
  openDrawer("jobs");
});
$("model-select").addEventListener("change", async (event) => {
  if (!state.activeId || !event.target.value) return;
  try {
    await api(`/sessions/${encodeURIComponent(state.activeId)}/model`, {
      method: "POST",
      body: JSON.stringify({ modelId: event.target.value }),
    });
    toast("Model updated for this session.");
  } catch (error) {
    event.target.value = "";
    toast(error.message);
  }
});
$("activity-toggle").addEventListener("click", () => {
  state.activityExpanded = !state.activityExpanded;
  $("activity-toggle").textContent = state.activityExpanded ? "Collapse" : "Expand";
  $("activity").classList.toggle("expanded", state.activityExpanded);
  if (state.activityExpanded) {
    $("activity").replaceChildren(
      ...state.events
        .map((event) => activityRow(event))
        .filter(Boolean)
        .slice(-30),
    );
    if (!state.events.length)
      $("activity").innerHTML =
        '<div class="activity-empty"><span>✦</span><p>No events yet.</p></div>';
  } else {
    if (state.activitySummary) renderActivitySummary();
    else
      $("activity").innerHTML =
        '<div class="activity-empty"><span>✦</span><p>Expand to inspect recent events.</p></div>';
  }
});
$("dev-toggle").addEventListener("click", () => {
  const panel = $("developer-panel");
  panel.open = !panel.open;
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
$("theme-toggle").addEventListener("click", () => {
  state.theme = themeOrder[(themeOrder.indexOf(state.theme) + 1) % themeOrder.length];
  document.documentElement.dataset.theme = state.theme;
  localStorage.setItem("flan-theme", state.theme);
  $("theme-toggle").setAttribute("aria-label", `Switch theme. Current: ${themeNames[state.theme]}`);
  $("send-icon").textContent = themeSendIcons[state.theme] || "↑";
  if (state.settings)
    void api("/settings", { method: "POST", body: JSON.stringify({ theme: state.theme }) }).then(
      applySettings,
    );
});
$("settings-button").addEventListener("click", () => void openSettings());
$("settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await saveSettings();
  } catch (error) {
    toast(error.message);
  }
});
$("settings-close").addEventListener("click", () => ($("settings-backdrop").hidden = true));
$("settings-cancel").addEventListener("click", () => ($("settings-backdrop").hidden = true));
$("settings-chat-background").addEventListener("change", (event) => {
  const value = event.target.value;
  if (value === "custom" && !localStorage.getItem("flan-custom-wallpaper")) {
    event.target.value = state.settings?.chatBackground || "bliss";
    toast("Upload a custom image first.");
    return;
  }
  $("settings-chat-background-preview").textContent =
    value === "custom"
      ? "Using the custom wallpaper saved in this browser."
      : "Custom wallpaper stays in this browser.";
});
$("settings-chat-background-upload").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return toast("Choose an image file.");
  if (file.size > 2 * 1024 * 1024) return toast("Custom wallpaper must be 2 MB or smaller.");
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    if (typeof reader.result !== "string") return;
    localStorage.setItem("flan-custom-wallpaper", reader.result);
    localStorage.setItem("flan-chat-background", "custom");
    document.documentElement.style.setProperty("--custom-wallpaper", `url("${reader.result}")`);
    document.documentElement.dataset.chatBackground = "custom";
    $("settings-chat-background").value = "custom";
    $("settings-chat-background-preview").textContent =
      "Custom wallpaper ready. Save settings to keep the choice.";
  });
  reader.readAsDataURL(file);
});
$("settings-chat-background-remove").addEventListener("click", () => {
  localStorage.removeItem("flan-custom-wallpaper");
  if (state.settings) {
    state.chatBackground = state.settings.chatBackground || "bliss";
    localStorage.setItem("flan-chat-background", state.chatBackground);
    document.documentElement.dataset.chatBackground = state.chatBackground;
  }
  $("settings-chat-background").value = state.chatBackground;
  $("settings-chat-background-preview").textContent = "Custom wallpaper stays in this browser.";
});
$("settings-backdrop").addEventListener("click", (event) => {
  if (event.target === $("settings-backdrop")) $("settings-backdrop").hidden = true;
});
$("credential-backdrop").addEventListener("click", (event) => {
  if (event.target === $("credential-backdrop")) closeCredentialForm();
});
$("credential-provide-backdrop").addEventListener("click", (event) => {
  if (event.target === $("credential-provide-backdrop")) closeCredentialChooser();
});
$("drawer-close").addEventListener("click", closeDrawer);
$("drawer-backdrop").addEventListener("click", (event) => {
  if (event.target === $("drawer-backdrop")) closeDrawer();
});
$("conversations-tab").addEventListener("click", (event) =>
  openSideDrawer("conversations", event.currentTarget),
);
$("details-tab").addEventListener("click", (event) =>
  openSideDrawer("details", event.currentTarget),
);
$("close-conversations").addEventListener("click", () => closeSideDrawer());
$("close-details").addEventListener("click", () => closeSideDrawer());
$("side-drawer-backdrop").addEventListener("click", () => closeSideDrawer());
$("brand").addEventListener("click", () => openSideDrawer("conversations"));
$("diagnostics").addEventListener("click", async () => {
  openSideDrawer("details");
  const panel = $("audit-panel");
  panel.hidden = !panel.hidden;
  if (!panel.hidden) {
    panel.open = true;
    await loadAudit();
  }
});
$("audit-refresh").addEventListener("click", (event) => {
  event.stopPropagation();
  void loadAudit();
});
document.querySelectorAll(".starter").forEach((button) =>
  button.addEventListener("click", () => {
    $("composer-input").value = button.dataset.prompt;
    $("composer-input").focus();
  }),
);
function togglePalette(open = false) {
  $("palette-backdrop").hidden = !open;
  if (open) document.querySelector("[data-palette]")?.focus();
}
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    togglePalette(true);
  }
  if (event.key === "Escape" && state.sideDrawerKind) {
    closeSideDrawer();
    return;
  }
  if (event.key === "Escape") togglePalette(false);
  if (event.key === "Escape" && state.drawerKind) closeDrawer();
});
$("palette-backdrop").addEventListener("click", (event) => {
  if (event.target === $("palette-backdrop")) togglePalette(false);
});
document.querySelectorAll("[data-palette]").forEach((button) =>
  button.addEventListener("click", () => {
    if (button.dataset.palette === "new") void createSession();
    if (button.dataset.palette === "theme") $("theme-toggle").click();
    if (button.dataset.palette === "developer") $("dev-toggle").click();
    togglePalette(false);
  }),
);
renderRunMonitors();
void load();
setInterval(() => {
  void loadJobs();
  void loadNotifications();
}, 5000);

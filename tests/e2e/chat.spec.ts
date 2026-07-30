import { expect, test } from "@playwright/test";

test("closes the slash command picker when canceled or selected", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  await expect(page.locator(".topbar #session-title")).toBeVisible();
  await expect(page.locator(".chat-header")).toHaveCount(0);
  const input = page.locator("#composer-input");
  const menu = page.locator("#command-menu");

  await input.fill("/");
  await expect(menu).toBeVisible();
  await input.fill("A normal message");
  await expect(menu).toBeHidden();

  await input.fill("/");
  await expect(menu).toBeVisible();
  await page.locator("[data-command]").first().click();
  await expect(menu).toBeHidden();
});

test("opens commands from the composer button and inserts only the active token", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  const input = page.locator("#composer-input");
  const menu = page.locator("#command-menu");

  await input.fill("Run ");
  await page.locator("#command-picker-composer").click();
  await expect(menu).toBeVisible();
  await expect(menu.locator("[data-command='/status']")).toBeVisible();
  await menu.locator("[data-command='/status']").click();
  await expect(input).toHaveValue("Run /status ");
  await expect(input).toBeFocused();

  await input.fill("Run /sta now");
  await input.evaluate((element) => element.setSelectionRange(4, 8));
  await page.locator("#command-picker-composer").click();
  await menu.locator("[data-command='/status']").click();
  await expect(input).toHaveValue("Run /status now");
});

test("shows the full slash command catalog in a scrollable picker", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  const input = page.locator("#composer-input");
  const menu = page.locator("#command-menu");

  await input.fill("Browse commands");
  await page.locator("#command-picker-composer").click();
  await expect(menu.locator("[data-command]")).toHaveCount(8);
  await expect(menu.locator("[data-command='/workspace']")).toBeVisible();
  await expect(menu).toHaveCSS("overflow-y", "auto");
  await menu.evaluate((element) => {
    if (element.scrollHeight <= element.clientHeight)
      throw new Error("command menu is not scrollable");
    element.scrollTop = element.scrollHeight;
  });
  await expect(menu.locator("[data-command='/workspace']")).toBeVisible();
});

test("toggles the slash command picker from its button", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  const button = page.locator("#command-picker-composer");
  const menu = page.locator("#command-menu");

  await button.click();
  await expect(menu).toBeVisible();
  await button.click();
  await expect(menu).toBeHidden();
});

test("completes slash commands with Tab and keeps Tab inside the textarea", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  const input = page.locator("#composer-input");

  await input.fill("/sta");
  await input.press("Tab");
  await expect(input).toHaveValue("/status ");
  await expect(input).toBeFocused();

  await input.fill("literal");
  await input.press("Tab");
  await expect(input).toHaveValue("literal\t");
  await expect(input).toBeFocused();
});

test("browses the active Gospel filesystem with mouse and keyboard", async ({ page }) => {
  await page.route("**/api/filesystem/list**", async (route) => {
    const path = new URL(route.request().url()).searchParams.get("path");
    const entries =
      path === "/"
        ? [
            { name: "projects", path: "/projects", type: "directory" },
            { name: "tmp.txt", path: "/tmp.txt", type: "file" },
          ]
        : [{ name: "README.md", path: `${path}/README.md`, type: "file" }];
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ host: "gospel", path, entries }),
    });
  });
  await page.goto("/");
  const project = await page.request.post("/api/projects", {
    data: { name: `Gospel picker ${Date.now()}`, paths: [], hosts: ["gospel"] },
  });
  const projectBody = (await project.json()) as { id: string };
  await page.reload();
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  await expect(page.locator(`#project-select option[value="${projectBody.id}"]`)).toHaveCount(1);
  await page.locator("#project-select").selectOption(projectBody.id);

  const input = page.locator("#composer-input");
  const picker = page.locator("#filesystem-picker");
  await input.fill("/");
  await expect(picker).toBeVisible();
  await expect(picker.locator("button[data-filesystem-path='/projects']")).toBeVisible();
  await picker.locator("button[data-filesystem-path='/projects']").click();
  await expect(input).toHaveValue("/projects/");
  await expect(picker.locator("button[data-filesystem-path='/projects/README.md']")).toBeVisible();
  await input.press("Tab");
  await expect(input).toHaveValue("/projects/README.md");
  await expect(picker).toBeHidden();

  await input.fill("/");
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(input).toHaveValue("/tmp.txt");
});

test("creates a conversation and renders one streamed Hermes reply", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#composer-input")).toBeVisible();
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");

  const before = await page.locator("#messages .assistant").count();
  await page.locator("#composer-input").fill("Give me a workspace pulse.");
  await page.locator("#send-button").click();

  await expect(page.locator("#messages .assistant")).toHaveCount(before + 1);
  await expect(page.locator("#messages .assistant").last()).toContainText("Mock reply");
  await expect(page.locator("#run-strip")).toBeHidden();
  await expect(page.locator("#run-status")).toHaveText("IDLE");
  await expect(page.locator(".activity-chip").last()).toContainText("tool call");
  await expect(page.locator("#activity")).toContainText("tool call");
  await expect(page.locator("#activity")).toContainText("approval");

  await page.locator("#activity-toggle").click();
  await expect(page.locator("#activity")).toHaveClass(/expanded/);
  await expect(page.locator("#activity")).toContainText("Using mock_tool");
  await page.locator("#details-tab").click();
  await page.locator("#dev-toggle").click();
  await expect(page.locator("#developer-panel")).toHaveAttribute("open", "");
  await expect(page.locator("#raw-events")).toContainText("tool.started");

  await expect(page.locator("#model-select option[value='mock-model-fast']")).toHaveCount(1);
  await page.locator("#model-select").selectOption("mock-model-fast");
  await expect(page.locator("#model-select")).toHaveValue("mock-model-fast");

  await page.locator("#conversations-tab").click();
  await page.locator("#job-dashboard").click();
  await expect(page.locator("#drawer-content")).toContainText("Give me a workspace pulse.");
  await expect(page.locator("[data-duplicate-job]")).toBeVisible();
  await page.locator("[data-duplicate-job]").first().click();
  await expect(page.locator("#toast")).toHaveText("Job duplicated.");
});

test("does not show an empty assistant bubble before the first response delta", async ({
  page,
}) => {
  await page.route("**/api/sessions/*/messages", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: 'event: agent\ndata: {"type":"message.delta","text":"Delayed reply"}\n\n',
    });
  });
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  await page.locator("#composer-input").fill("Wait for the reply.");
  await page.locator("#send-button").click();
  await expect(page.locator("#messages .assistant")).toHaveCount(0);
});

test("renders tables and task lists in streamed Hermes Markdown", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");

  await page.locator("#composer-input").fill("Show me a status table.");
  await page.locator("#send-button").click();

  await expect(page.locator("#messages .assistant table")).toBeVisible();
  await expect(page.locator("#messages .assistant .task-list input[type=checkbox]")).toHaveCount(2);
  await expect(page.locator("#messages .assistant").last()).toContainText("Hermes");
});

test("sends with Enter and keeps Shift+Enter as a newline", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  const input = page.locator("#composer-input");
  const before = await page.locator("#messages .user").count();

  await expect(page.locator("#composer-hint")).toContainText("Enter to send");
  await expect(page.locator("#composer-hint")).toContainText("Shift+Enter");

  await input.fill("Message sent with Enter");
  await input.press("Enter");
  await expect(page.locator("#messages .user")).toHaveCount(before + 1);

  await input.fill("First line");
  await input.press("Shift+Enter");
  await input.type("Second line");
  await expect(input).toHaveValue("First line\nSecond line");
  await expect(page.locator("#messages .user")).toHaveCount(before + 1);
});

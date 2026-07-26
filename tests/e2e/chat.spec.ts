import { expect, test } from "@playwright/test";

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
  await expect(page.locator("#activity")).toContainText("tool call");
  await expect(page.locator("#activity")).toContainText("approval");

  await page.locator("#activity-toggle").click();
  await expect(page.locator("#activity")).toHaveClass(/expanded/);
  await expect(page.locator("#activity")).toContainText("Using mock_tool");
  await page.locator("#dev-toggle").click();
  await expect(page.locator("#developer-panel")).toHaveAttribute("open", "");
  await expect(page.locator("#raw-events")).toContainText("tool.started");

  await expect(page.locator("#model-select option[value='mock-model-fast']")).toHaveCount(1);
  await page.locator("#model-select").selectOption("mock-model-fast");
  await expect(page.locator("#model-select")).toHaveValue("mock-model-fast");

  await page.locator("#job-dashboard").click();
  await expect(page.locator("#drawer-content")).toContainText("Give me a workspace pulse.");
  await expect(page.locator("[data-duplicate-job]")).toBeVisible();
  await page.locator("[data-duplicate-job]").first().click();
  await expect(page.locator("#toast")).toHaveText("Job duplicated.");
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

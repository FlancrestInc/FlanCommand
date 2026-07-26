import { expect, test } from "@playwright/test";

test("reviews an approval on mobile and rejects token replay", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const review = await page.evaluate(async () => {
    const response = await fetch("/api/policy/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "project-local",
        sessionId: "session-1",
        action: "write",
        path: "/tmp/e2e-approval.txt",
      }),
    });
    return (await response.json()) as { reviewUrl: string; approval: { id: string } };
  });

  const reviewUrl = new URL(review.reviewUrl, page.url());
  const token = reviewUrl.searchParams.get("token");
  expect(token).toBeTruthy();

  await page.goto(reviewUrl.toString());
  await expect(page.locator("#title")).toHaveText(/requires approval/u);
  await expect(page.locator("#details")).toContainText("/tmp/e2e-approval.txt");
  await expect(page.locator("#actions")).toBeVisible();

  await page.locator("#deny").click();
  await expect(page.locator("#status")).toHaveText("Action denied. You can close this page.");
  await expect(page.locator("#actions")).toBeHidden();

  const replayStatus = await page.evaluate(
    async ({ approvalId, token }) => {
      const response = await fetch(`/api/approvals/${encodeURIComponent(approvalId)}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, decision: "approve" }),
      });
      return response.status;
    },
    { approvalId: review.approval.id, token },
  );
  expect(replayStatus).toBe(404);
});

test("expands a project boundary from the approval drawer", async ({ page }) => {
  await page.goto("/");
  const boundaryPath = `/tmp/e2e-boundary-${Date.now()}`;
  await page.evaluate(async (path) => {
    await fetch("/api/policy/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "project-local", action: "read", path }),
    });
  }, boundaryPath);

  await page.locator("#approval-inbox").click();
  await expect(page.locator("[data-expand-boundary]")).toHaveCount(1);
  await page.locator("[data-expand-boundary]").click();
  await expect(page.locator("#toast")).toContainText("Project boundary expanded");
  await expect(
    page.evaluate(async (path) => {
      const response = await fetch("/api/projects?includeArchived=true");
      const data = (await response.json()) as { projects: Array<{ paths: string[] }> };
      return data.projects.some((project) => project.paths.includes(path));
    }, boundaryPath),
  ).resolves.toBe(true);
});

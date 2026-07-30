import { expect, test } from "@playwright/test";

test("starts with the conversations drawer closed and closes it with the close button", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");

  await expect(page.locator("#sidebar")).not.toHaveClass(/open/);
  await expect(page.locator("#conversations-tab")).toContainText("Conversations");
  await expect(page.locator("#details-tab")).toContainText("Run details");
  await expect(page.locator(".chat-actions #model-select")).toHaveCount(0);
  await expect(page.locator("#context-chip")).toHaveCount(0);
  await expect(page.locator(".composer #model-select")).toBeVisible();
  await expect(page.locator("#context-monitor")).toBeVisible();
  await expect(page.locator("#elapsed-monitor")).toHaveAttribute("title", /Elapsed time/);
  await expect(page.locator("#tool-monitor")).toHaveAttribute("title", /currently running tool/);
  await expect(page.locator("#conversations-tab")).toHaveAttribute("aria-expanded", "false");

  await page.locator("#conversations-tab").click();
  await expect(page.locator("#sidebar")).toHaveClass(/open/);
  await expect(page.locator("#close-conversations")).toBeFocused();
  await page.locator("#close-conversations").click();
  await expect(page.locator("#sidebar")).not.toHaveClass(/open/);
  await expect(page.locator("#conversations-tab")).toHaveAttribute("aria-expanded", "false");
});

test("dismisses a notification from the notifications drawer", async ({ page }) => {
  let dismissed = false;
  await page.route("**/api/notifications", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        notifications: dismissed
          ? []
          : [
              {
                id: "notification-e2e",
                kind: "system",
                title: "Test notification",
                body: "This notification should disappear.",
                read: true,
                createdAt: "2026-01-01T00:00:00.000Z",
              },
            ],
      }),
    });
  });
  await page.route("**/api/notifications/notification-e2e", async (route) => {
    expect(route.request().method()).toBe("DELETE");
    dismissed = true;
    await route.fulfill({ status: 204, body: "" });
  });
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  await page.locator("#notification-bell").click();
  await expect(page.locator(".notification-card")).toContainText("Test notification");
  await page.locator("[data-delete-notification='notification-e2e']").click();
  await expect(page.locator("#drawer-content")).toContainText("All caught up");
  await expect(page.locator(".notification-card")).toHaveCount(0);
});

test("shows conversation actions in the recent conversations menu", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  await page.locator("#conversations-tab").click();
  const menuToggle = page.locator("[data-session-menu-toggle]").first();
  await expect(menuToggle).toBeVisible();
  const menuToggleIsTopmost = await menuToggle.evaluate((element) => {
    const box = (element as any).getBoundingClientRect();
    const topmost = (element as any).ownerDocument.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    return topmost === element || element.contains(topmost);
  });
  expect(menuToggleIsTopmost).toBe(true);
  const sessionButtonBox = await menuToggle.locator("..").locator("[data-session]").boundingBox();
  const menuToggleBox = await menuToggle.boundingBox();
  expect(menuToggleBox!.x).toBeGreaterThanOrEqual(sessionButtonBox!.x + sessionButtonBox!.width);
  await menuToggle.click();
  const menu = page.locator("[data-session-menu]").first();
  await expect(menu).toBeVisible();
  await expect(menu.locator("[data-session-action='archive']")).toBeVisible();
  await expect(menu.locator("[data-session-action='pin']")).toBeVisible();
  await expect(menu.locator("[data-session-action='rename']")).toBeVisible();
  await expect(menu.locator("[data-session-project]")).toBeVisible();
});

test("dismisses all notifications from the notifications drawer", async ({ page }) => {
  let dismissed = false;
  await page.route("**/api/notifications", async (route) => {
    if (route.request().method() === "DELETE") {
      dismissed = true;
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        notifications: dismissed
          ? []
          : [
              {
                id: "notification-one",
                kind: "system",
                title: "First notification",
                body: "First body",
                read: false,
                createdAt: "2026-01-01T00:00:00.000Z",
              },
              {
                id: "notification-two",
                kind: "job",
                title: "Second notification",
                body: "Second body",
                read: true,
                createdAt: "2026-01-02T00:00:00.000Z",
              },
            ],
      }),
    });
  });
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  await page.locator("#notification-bell").click();
  await expect(page.locator("[data-delete-all-notifications]")).toBeVisible();
  await page.locator("[data-delete-all-notifications]").click();
  await expect(page.locator("#drawer-content")).toContainText("All caught up");
  await expect(page.locator(".notification-card")).toHaveCount(0);
});

test("loads without browser policy console warnings", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") warnings.push(message.text());
  });
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  expect(warnings).toEqual([]);
});

test("shows a session loading state while the conversation list loads", async ({ page }) => {
  await page.route("**/api/sessions**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".session-skeleton")).toHaveCount(3);
  await expect(page.locator("#session-list .session-skeleton")).toHaveCount(0);
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
});

test("honors reduced-motion preferences", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const transitionDuration = await page
    .locator(".starter")
    .first()
    .evaluate((element) => {
      const browserWindow = (
        element as unknown as {
          ownerDocument: {
            defaultView: { getComputedStyle(node: unknown): { transitionDuration: string } };
          };
        }
      ).ownerDocument.defaultView;
      return Number.parseFloat(browserWindow.getComputedStyle(element).transitionDuration);
    });
  expect(transitionDuration).toBeLessThan(0.001);
});

test("exposes live status and a visible keyboard focus", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#connection")).toHaveAttribute("role", "status");
  await expect(page.locator("#toast")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator("#run-status")).toHaveAttribute("aria-live", "polite");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveCSS("outline-style", "solid");
  await page.locator("#settings-button").click();
  await expect(page.locator("#settings-close")).toBeFocused();
});

test("registers the offline app shell without caching API data", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const browserNavigator = navigator as Navigator & {
      serviceWorker: { ready: Promise<unknown> };
    };
    await browserNavigator.serviceWorker.ready;
  });
  const cacheEntries = await page.evaluate(async () => {
    const browser = globalThis as typeof globalThis & {
      caches: {
        open(name: string): Promise<{ keys(): Promise<Array<{ url: string }>> }>;
      };
    };
    const cache = await browser.caches.open("flancommand-shell-v13");
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(cacheEntries).toContain("/index.html");
  expect(cacheEntries).toContain("/app.js");
  expect(cacheEntries.some((path) => path.startsWith("/api/"))).toBe(false);

  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const browserNavigator = navigator as Navigator & {
          serviceWorker: { controller: unknown };
        };
        return Boolean(browserNavigator.serviceWorker.controller);
      }),
    )
    .toBe(true);
  await page.context().setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toHaveText("Conversations");
});

test("keeps navigation usable on a phone-sized viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");

  await page.locator("#conversations-tab").click();
  await expect(page.locator("#sidebar")).toHaveClass(/open/);
  await page.locator("#brand").click();
  await expect(page.locator("#sidebar")).not.toHaveClass(/open/);

  await page.locator("#notification-bell").click();
  await expect(page.locator("#drawer-backdrop")).toBeVisible();
  await expect(page.locator("#drawer-title")).toHaveText("Notifications");
  await page.locator("#drawer-close").click();
  await expect(page.locator("#drawer-backdrop")).toBeHidden();

  await page.locator("#conversations-tab").click();
  await page.locator("#job-dashboard").click();
  await expect(page.locator("#drawer-title")).toHaveText("Background jobs");
  await page.locator("#drawer-close").click();

  await page.locator("#diagnostics").click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator("#audit-panel")).toBeVisible();
});

test("keeps the composer visible in a short desktop window", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 520 });
  await page.goto("/");
  const sendBox = await page.locator("#composer").boundingBox();
  const sendButton = await page.locator("#send-button").boundingBox();

  expect(sendBox).not.toBeNull();
  expect(sendButton).not.toBeNull();
  expect(sendBox!.y + sendBox!.height).toBeLessThanOrEqual(520);
  expect(sendButton!.y + sendButton!.height).toBeLessThanOrEqual(520);
});

test("opens side drawers one at a time and collapses long sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");

  await page.locator("#conversations-tab").click();
  await expect(page.locator("#sidebar")).toHaveClass(/open/);
  const leftDrawer = await page.locator("#sidebar").boundingBox();
  const leftTab = await page.locator("#conversations-tab").boundingBox();
  expect(leftDrawer).not.toBeNull();
  expect(leftTab).not.toBeNull();
  await expect
    .poll(async () => {
      const drawer = await page.locator("#sidebar").boundingBox();
      const tab = await page.locator("#conversations-tab").boundingBox();
      return drawer && tab ? Math.abs(tab.x - (drawer.x + drawer.width)) : Number.POSITIVE_INFINITY;
    })
    .toBeLessThanOrEqual(2);
  await expect(page.locator("#conversations-tab")).toHaveAttribute("aria-expanded", "true");

  const chatBeforeRightDrawer = await page.locator(".chat-column").boundingBox();
  await page.locator("#details-tab").click();
  await expect(page.locator("#detail-panel")).toHaveClass(/open/);
  await expect
    .poll(async () => (await page.locator(".chat-column").boundingBox())?.x)
    .toBe(chatBeforeRightDrawer?.x);
  const rightDrawer = await page.locator("#detail-panel").boundingBox();
  const rightTab = await page.locator("#details-tab").boundingBox();
  expect(rightDrawer).not.toBeNull();
  expect(rightTab).not.toBeNull();
  await expect
    .poll(async () => {
      const drawer = await page.locator("#detail-panel").boundingBox();
      const tab = await page.locator("#details-tab").boundingBox();
      return drawer && tab ? Math.abs(tab.x + tab.width - drawer.x) : Number.POSITIVE_INFINITY;
    })
    .toBeLessThanOrEqual(2);
  await expect(page.locator("#sidebar")).not.toHaveClass(/open/);
  await expect(page.locator("#close-details")).toBeFocused();

  await page.locator("#close-details").click();
  await expect(page.locator("#detail-panel")).not.toHaveClass(/open/);
  await expect(page.locator("#details-tab")).toHaveAttribute("aria-expanded", "false");

  await page.locator("#details-tab").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#detail-panel")).not.toHaveClass(/open/);
  await expect(page.locator("#details-tab")).toBeFocused();

  await page.locator("#conversations-tab").click();
  await page.locator("#side-drawer-backdrop").click({ position: { x: 400, y: 120 } });
  await expect(page.locator("#sidebar")).not.toHaveClass(/open/);

  await page.locator("#conversations-tab").click();
  const recent = page.locator("#recent-chats-section");
  await expect(recent).toHaveAttribute("open", "");
  await recent.locator("summary").click();
  await expect(recent).not.toHaveAttribute("open", "");
  await expect(recent.locator("summary")).toContainText("RECENT");

  await page.locator("#diagnostics").click();
  const audit = page.locator("#audit-panel");
  await expect(audit).toHaveAttribute("open", "");
  await audit.locator("summary").click();
  await expect(audit).not.toHaveAttribute("open", "");
  await expect(page.locator("#audit-refresh")).toBeVisible();
});

test("exposes every long side-panel section as a disclosure", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");

  for (const selector of [
    "#recent-chats-section",
    "#project-section",
    "#credential-section",
    "#file-section",
    "#tools-section",
  ]) {
    await expect(page.locator(selector).locator("summary")).toBeVisible();
  }

  await page.locator("#details-tab").click();
  await page.locator("#developer-panel summary").click();
  await expect(page.locator("#dev-toggle")).toBeVisible();
  await page.locator("#dev-toggle").click();
  await expect(page.locator("#developer-panel")).not.toHaveAttribute("open", "");
  for (const selector of [
    "#focus-section",
    "#activity-section",
    "#developer-panel",
    "#artifact-section",
    "#workspace-section",
    "#session-section",
  ]) {
    await expect(page.locator(selector).locator("summary")).toBeVisible();
  }
});

test("keeps key mobile controls at a touch-safe size", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  for (const selector of [
    "#notification-bell",
    "#theme-toggle",
    "#settings-button",
    "#conversations-tab",
    "#attach-file-composer",
    "#send-button",
  ]) {
    const box = await page.locator(selector).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

test("keeps a renamed conversation after refresh", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  await page.locator("#conversations-tab").click();
  page.on("dialog", async (dialog) => {
    await dialog.accept("E2E kept conversation");
  });

  await page.locator("#new-session").click();
  await expect(page.locator("#session-title")).toHaveText("New conversation");
  await page.locator("#conversations-tab").click();
  await page.locator("#rename-session").click();
  await expect(page.locator("#session-title")).toHaveText("E2E kept conversation");

  await page.reload();
  await expect(page.locator("#session-title")).toHaveText("E2E kept conversation");
});

test("edits and archives a project from the browser", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  await page.locator("#conversations-tab").click();

  await page.locator("#add-project").click();
  await expect(page.locator("#project-backdrop")).toBeVisible();
  await page.locator("#project-name").fill("E2E project before edit");
  await page.locator("#project-path").fill("/tmp/e2e-project-before");
  await page.locator("#project-hosts").fill("gospel");
  await page.locator("#project-instructions").fill("Follow the E2E project rules.");
  await page.locator("#project-form").locator("button[type=submit]").click();
  await expect(
    page.locator("#project-select option", { hasText: "E2E project before edit" }),
  ).toHaveCount(1);
  await page.locator("#project-select").selectOption({ label: "E2E project before edit" });
  await expect(page.locator("#edit-project")).toBeEnabled();
  await page.locator("#edit-project").click();
  await expect(page.locator("#project-backdrop")).toBeVisible();
  await page.locator("#project-name").fill("E2E project after edit");
  await page.locator("#project-path").fill("/tmp/e2e-project-after");
  await page.locator("#project-hosts").fill("gospel, barnabas");
  await page.locator("#project-instructions").fill("Keep the E2E change small.");
  await page.locator("#project-form").locator("button[type=submit]").click();
  await expect(
    page.locator("#project-select option", { hasText: "E2E project after edit" }),
  ).toHaveCount(1);
  await page.locator("#project-select").selectOption({ label: "E2E project after edit" });
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#archive-project").click();
  await expect(
    page.locator("#project-select option", { hasText: "E2E project after edit · archived" }),
  ).toHaveCount(1);
  await expect(page.locator("#archive-project")).toBeDisabled();
});

test("switches and persists the classic and BOOTSTRA.386 themes", async ({ page }) => {
  await page.goto("/");
  await page.locator("#settings-button").click();
  await expect(page.locator("#settings-backdrop")).toBeVisible();
  await page.locator("#settings-theme").selectOption("win98");
  await page.locator("#settings-chat-background").selectOption("3d-pipes");
  await page.locator("#settings-form").locator("button[type=submit]").click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "win98");
  await expect(page.locator("html")).toHaveAttribute("data-chat-background", "3d-pipes");
  await expect(page.locator("#settings-theme option[value=dark]")).toHaveCount(0);
  await expect(page.locator("#settings-theme option[value=light]")).toHaveCount(0);
  await expect(page.locator("#settings-button")).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "win98");
  await expect(page.locator("html")).toHaveAttribute("data-chat-background", "3d-pipes");

  for (const theme of ["cga", "amber", "green", "win98css", "xpcss", "win7css"]) {
    await page.locator("#settings-button").click();
    await page.locator("#settings-theme").selectOption(theme);
    await page.locator("#settings-form").locator("button[type=submit]").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  }

  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "xp");
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "win98");
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "cga");
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "amber");
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "green");
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "win98css");
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "xpcss");
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "win7css");
});

test("associates a credential reference through the browser form", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  await page.locator("#conversations-tab").click();

  await page.locator("#add-credential").click();
  await expect(page.locator("#credential-backdrop")).toBeVisible();
  await page.locator("#credential-name").fill("E2E Gospel SSH");
  await page.locator("#credential-secret-id").fill("e2e-secret-reference");
  await page.locator("#credential-purpose").fill("E2E remote access");
  await page.locator("#credential-hosts").fill("gospel");
  await page.locator("#credential-injection").selectOption("temporary_file");
  await page.locator("#credential-form").locator("button[type=submit]").click();

  await expect(page.locator("#credential-backdrop")).toBeHidden();
  await expect(page.locator("#credential-list")).toContainText("E2E Gospel SSH");
  await expect(page.locator("#credential-list")).toContainText("temporary_file");
});

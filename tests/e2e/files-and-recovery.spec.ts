import { expect, test } from "@playwright/test";

test("uploads and previews a text file in the browser", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  await page.locator("#file-input").setInputFiles({
    name: "e2e-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Hermes browser file check\n"),
  });

  await expect(page.locator("#file-list")).toContainText("e2e-notes.txt");
  await page.locator("#file-list button", { hasText: "e2e-notes.txt" }).click();
  await expect(page.locator("#file-preview-card")).toBeVisible();
  await expect(page.locator("#file-preview-body pre")).toHaveText("Hermes browser file check\n");
});

test("attaches an uploaded file to the next Hermes turn", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  await page.locator("#file-input").setInputFiles({
    name: "e2e-attach.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Send this to Hermes\n"),
  });
  await expect(page.locator("#file-list")).toContainText("e2e-attach.txt");
  await page
    .locator(".file-item", { hasText: "e2e-attach.txt" })
    .locator("[data-file-attach]")
    .click();
  await expect(page.locator("#composer-attachments")).toContainText("e2e-attach.txt");
  await page.locator("#composer-input").fill("Read the attached note.");
  await page.locator("#send-button").click();
  await expect(page.locator("#messages .assistant").last()).toContainText("Mock reply");
  await expect(page.locator("#messages .user").last()).toContainText("Attached: e2e-attach.txt");
  await expect(page.locator("#composer-attachments")).toBeHidden();
});

test("pastes a file into the composer and attaches it", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");

  await page.evaluate(`(() => {
    const input = document.querySelector("#composer-input");
    if (!input) throw new Error("Composer input is unavailable.");
    const file = new File(["Pasted into Hermes\\n"], "e2e-pasted.txt", { type: "text/plain" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    }));
  })()`);

  await expect(page.locator("#composer-attachments")).toContainText("e2e-pasted.txt");
  await page.locator("#composer-input").fill("Read the pasted note.");
  await page.locator("#send-button").click();
  await expect(page.locator("#messages .user").last()).toContainText("Attached: e2e-pasted.txt");
  await expect(page.locator("#composer-attachments")).toBeHidden();
});

test("pastes an image into the composer and renders a thumbnail", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");

  await page.evaluate(`(() => {
    const input = document.querySelector("#composer-input");
    if (!input) throw new Error("Composer input is unavailable.");
    const image = new File(["fake image bytes"], "e2e-pasted.png", { type: "image/png" });
    const transfer = new DataTransfer();
    transfer.items.add(image);
    input.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    }));
  })()`);

  await expect(page.locator("#composer-attachments")).toContainText("e2e-pasted.png");
  await expect(page.locator("#composer-attachments img")).toHaveAttribute(
    "src",
    /\/api\/files\/[^/]+\/preview$/,
  );
});

test("shows registered artifacts in the browser panel", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");

  const file = await page.evaluate(async () => {
    const response = await fetch("/api/files", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "generated.md",
        mimeType: "text/markdown",
        contentBase64: btoa("# Generated artifact"),
      }),
    });
    return (await response.json()) as { id: string };
  });
  await page.evaluate(async (fileId) => {
    await fetch("/api/artifacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileId, name: "generated.md", artifactType: "document" }),
    });
  }, file.id);

  await page.reload();
  await expect(page.locator("#artifact-list")).toContainText("generated.md");
  await expect(page.locator("#artifact-list a")).toHaveAttribute("href", /\/preview$/);
});

test("opens the embedded terminal and receives command output", async ({ page, browserName }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  if (browserName === "chromium")
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  await expect(page.locator("#terminal-credential")).toBeVisible();
  await page.locator("#open-terminal").click();
  await expect(page.locator("#terminal-status")).toContainText("Active");
  await page.locator("#terminal-input").fill("printf 'browser-terminal-ok\\n'");
  await page.locator("#send-terminal").click();
  await expect(page.locator("#terminal-output")).toContainText("browser-terminal-ok");
  await expect(page.locator("#terminal-copy")).toBeVisible();
  await expect(page.locator("#terminal-paste")).toBeVisible();
  if (browserName === "chromium") {
    await page.locator("#terminal-copy").click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            navigator as Navigator & {
              clipboard: { readText(): Promise<string>; writeText(value: string): Promise<void> };
            }
          ).clipboard.readText(),
        ),
      )
      .toContain("browser-terminal-ok");
    await page.evaluate(() =>
      (
        navigator as Navigator & {
          clipboard: { readText(): Promise<string>; writeText(value: string): Promise<void> };
        }
      ).clipboard.writeText("echo pasted-from-browser"),
    );
    await page.locator("#terminal-paste").click();
    await expect(page.locator("#terminal-input")).toHaveValue("echo pasted-from-browser");
  }
  await page.locator("#terminal-hide").click();
  await expect(page.locator("#terminal-panel")).toBeHidden();
  await expect(page.locator("#show-terminal")).toBeVisible();
  await page.locator("#show-terminal").click();
  await expect(page.locator("#terminal-panel")).toBeVisible();
  await expect(page.locator("#terminal-output")).toContainText("browser-terminal-ok");
  await expect(page.locator("#terminal-status")).toContainText("×");
  await page.locator("#close-terminal").click();
  await expect(page.locator("#terminal-status")).toContainText("Closed");
});

test("reviews and approves a new workspace file", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");

  const fileName = `e2e-created-${Date.now()}.txt`;
  await page.locator("#workspace-new-file").click();
  await page.locator("#new-file-path").fill(fileName);
  await page.locator("#new-file-start").click();
  await page.locator("#edit-content").fill("Created through the browser.\n");
  await page.locator("#propose-edit").click();
  await expect(page.locator("#edit-status")).toContainText("Pending review");
  await page.locator("#approve-edit").click();
  await expect(page.locator("#edit-status")).toContainText("Approved and written");
  await expect(page.locator("#workspace-list")).toContainText(fileName);
  await page.locator(`[data-workspace-use-path$="${fileName}"]`).click();
  await expect(page.locator("#composer-input")).toHaveValue(new RegExp(fileName));
});

test("searches workspace files by name", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");

  const fileName = `e2e-search-${Date.now()}.txt`;
  await page.locator("#workspace-new-file").click();
  await page.locator("#new-file-path").fill(fileName);
  await page.locator("#new-file-start").click();
  await page.locator("#edit-content").fill("Searchable workspace content.\n");
  await page.locator("#propose-edit").click();
  await page.locator("#approve-edit").click();
  await expect(page.locator("#edit-status")).toContainText("Approved and written");

  await page.locator("#workspace-search").fill(fileName);
  await page.locator("#workspace-search-button").click();
  await expect(page.locator("#workspace-search-results")).toContainText(fileName);
  await page.locator(`[data-search-use-path$="${fileName}"]`).click();
  await expect(page.locator("#composer-input")).toHaveValue(new RegExp(fileName));
});

test("shows approval controls for a Hermes approval event", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  await page.locator("#composer-input").fill("Run the protected fixture.");
  await page.locator("#send-button").click();
  await expect(page.locator("#run-strip")).toBeHidden();

  await page.locator("#approval-inbox").click();
  await expect(page.locator("#drawer-backdrop")).toBeVisible();
  await expect(page.locator("#drawer-content")).toContainText("mock command");
  await expect(
    page.locator(".approval-card", { hasText: "mock command" }).locator("[data-approve-drawer]"),
  ).toBeVisible();
  await page.locator("#drawer-close").click();
});

test("preserves a prompt when the message stream drops", async ({ page }) => {
  await page.route(/\/api\/sessions\/[^/]+\/messages$/u, (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"offline"}' }),
  );
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");

  await page.locator("#composer-input").fill("Keep this prompt after disconnect.");
  await page.locator("#send-button").click();

  await expect(page.locator("#run-label")).toHaveText("Connection lost. Your message is saved.");
  await expect(page.locator("#reconnect-run")).toBeVisible();
  await expect(page.locator("#composer-input")).toHaveValue("Keep this prompt after disconnect.");
  await expect(page.locator("#send-button")).toBeDisabled();

  await page.locator("#reconnect-run").click();
  await expect(page.locator("#run-strip")).toBeHidden();
  await expect(page.locator("#toast")).toHaveText(
    "Session refreshed. Check the latest job before sending again.",
  );
});

test("opens a credential reference chooser for a paused Hermes job", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  await page.evaluate(async () => {
    await fetch("/api/projects/project-local/credentials", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "E2E Gospel SSH",
        provider: "bitwarden-secrets-manager",
        externalSecretId: "e2e-secret-reference",
        purpose: "E2E remote access",
        allowedHosts: ["gospel"],
        injectionMethod: "temporary_file",
      }),
    });
  });
  await page.reload();
  await expect(page.locator("#session-title")).not.toHaveText("Loading conversation");
  await page.locator("#composer-input").fill("Request a credential");
  await page.locator("#send-button").click();
  await expect(page.locator("#run-strip")).toBeHidden();
  await page.locator("#job-dashboard").click();
  await expect(page.locator("#drawer-content")).toContainText("Gospel SSH");
  await page.locator("[data-provide-credential-job]").click();
  await expect(page.locator("#credential-provide-backdrop")).toBeVisible();
  await expect(page.locator("#credential-provide-select")).toContainText("E2E Gospel SSH");
});

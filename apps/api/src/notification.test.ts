import { describe, expect, it, vi } from "vitest";
import {
  AppriseNotificationAdapter,
  NtfyNotificationAdapter,
  type NotificationMessage,
} from "./notification.js";

const message: NotificationMessage = {
  title: "Approval needed",
  body: "Hermes needs permission to edit a file.",
  url: "https://command.example/approvals/approval-1",
};

describe("notification adapters", () => {
  it("sends an ntfy notification without exposing the topic in the payload", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const adapter = new NtfyNotificationAdapter("private-topic", fetcher, "https://ntfy.test");

    await adapter.send(message);

    expect(fetcher).toHaveBeenCalledWith(
      "https://ntfy.test/private-topic",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Title: "Approval needed", Click: message.url }),
        body: message.body,
      }),
    );
  });

  it("posts the Apprise API payload to the configured key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const adapter = new AppriseNotificationAdapter("https://apprise.test", "command-key", fetcher);

    await adapter.send(message);

    expect(fetcher).toHaveBeenCalledWith(
      "https://apprise.test/notify/command-key",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: message.title, body: message.body, url: message.url }),
      }),
    );
  });

  it("fails when a provider rejects the request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    const adapter = new NtfyNotificationAdapter("topic", fetcher, "https://ntfy.test");

    await expect(adapter.send(message)).rejects.toThrow("notification provider returned 503");
  });
});

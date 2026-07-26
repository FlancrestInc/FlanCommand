export interface NotificationMessage {
  title: string;
  body: string;
  url?: string;
}

export interface NotificationAdapter {
  readonly name: string;
  send(message: NotificationMessage): Promise<void>;
}

type Fetcher = typeof fetch;

function assertResponse(response: Response): void {
  if (!response.ok) throw new Error(`notification provider returned ${response.status}`);
}

export class NtfyNotificationAdapter implements NotificationAdapter {
  readonly name = "ntfy";

  constructor(
    private readonly topic: string,
    private readonly fetcher: Fetcher = fetch,
    private readonly baseUrl = "https://ntfy.sh",
  ) {}

  async send(message: NotificationMessage): Promise<void> {
    const headers: Record<string, string> = { Title: message.title };
    if (message.url) headers.Click = message.url;
    const response = await this.fetcher(
      `${this.baseUrl.replace(/\/$/u, "")}/${encodeURIComponent(this.topic)}`,
      { method: "POST", headers, body: message.body },
    );
    assertResponse(response);
  }
}

export class AppriseNotificationAdapter implements NotificationAdapter {
  readonly name = "apprise";

  constructor(
    private readonly baseUrl: string,
    private readonly key: string,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async send(message: NotificationMessage): Promise<void> {
    const response = await this.fetcher(
      `${this.baseUrl.replace(/\/$/u, "")}/notify/${encodeURIComponent(this.key)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: message.title, body: message.body, url: message.url }),
      },
    );
    assertResponse(response);
  }
}

export function notificationAdaptersFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): NotificationAdapter[] {
  const adapters: NotificationAdapter[] = [];
  if (env.FLANC_NTFY_TOPIC)
    adapters.push(
      new NtfyNotificationAdapter(env.FLANC_NTFY_TOPIC, fetch, env.FLANC_NTFY_BASE_URL),
    );
  if (env.FLANC_APPRISE_URL && env.FLANC_APPRISE_KEY)
    adapters.push(new AppriseNotificationAdapter(env.FLANC_APPRISE_URL, env.FLANC_APPRISE_KEY));
  return adapters;
}

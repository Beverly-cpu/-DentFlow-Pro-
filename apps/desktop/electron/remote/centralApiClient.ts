import { randomUUID } from "node:crypto";

import { getDeploymentConfig } from "./serverConnection";

type JsonRecord = Record<string, unknown>;

class CentralApiClient {
  private token: string | null = null;
  private readonly deviceId = randomUUID();

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const config = getDeploymentConfig();
    if (!config.serverUrl) throw new Error("尚未設定中央伺服器網址");
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    headers.set("x-device-id", this.deviceId);
    if (init.body !== undefined) headers.set("content-type", "application/json");
    if (this.token) headers.set("authorization", `Bearer ${this.token}`);

    const response = await fetch(`${config.serverUrl}${path}`, { ...init, headers });
    const payload = await response.json().catch(() => null) as JsonRecord | null;
    if (!response.ok) {
      if (response.status === 401) this.token = null;
      throw new Error(typeof payload?.message === "string" ? payload.message : `中央伺服器回應 ${response.status}`);
    }
    return payload as T;
  }

  get<T>(path: string) { return this.request<T>(path); }
  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
  }
  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) });
  }
  delete<T>(path: string) { return this.request<T>(path, { method: "DELETE" }); }

  async login(input: unknown) {
    const result = await this.post<{ token: string; session: unknown }>("/v1/auth/login", input);
    this.token = result.token;
    return result.session;
  }

  clearSession() { this.token = null; }
}

export const centralApi = new CentralApiClient();

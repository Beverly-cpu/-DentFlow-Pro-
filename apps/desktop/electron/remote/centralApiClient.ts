import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { app } from "electron";

import { getDeploymentConfig } from "./serverConnection";

import { CentralApiError } from "./centralApiError";

type JsonRecord = Record<string, unknown>;

class CentralApiClient {
  private token: string | null = null;
  private deviceId: string | null = null;

  getDeviceId() {
    if (this.deviceId) return this.deviceId;
    const filePath = path.join(app.getPath("userData"), "dentflow-device-id");
    if (existsSync(filePath)) {
      const saved = readFileSync(filePath, "utf8").trim();
      if (saved) return (this.deviceId = saved);
    }
    const created = randomUUID();
    try {
      writeFileSync(filePath, created, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      return (this.deviceId = readFileSync(filePath, "utf8").trim());
    }
    return (this.deviceId = created);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const config = getDeploymentConfig();
    if (!config.serverUrl) throw new Error("尚未設定中央伺服器網址");
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    headers.set("x-device-id", this.getDeviceId());
    if (init.body !== undefined) headers.set("content-type", "application/json");
    if (this.token) headers.set("authorization", `Bearer ${this.token}`);

    const response = await fetch(`${config.serverUrl}${path}`, { ...init, headers });
    const payload = await response.json().catch(() => null) as JsonRecord | null;
    if (!response.ok) {
      if (response.status === 401) this.token = null;
      throw new CentralApiError(response.status, typeof payload?.error === "string" ? payload.error : "request_failed",
        typeof payload?.message === "string" ? payload.message : `中央伺服器回應 ${response.status}`);
    }
    return payload as T;
  }

  get<T>(path: string) { return this.request<T>(path); }
  async getDataUrl(path: string) {
    const config = getDeploymentConfig();
    if (!config.serverUrl) throw new Error("尚未設定中央伺服器網址");
    const headers = new Headers({ "x-device-id": this.getDeviceId() });
    if (this.token) headers.set("authorization", `Bearer ${this.token}`);
    const response = await fetch(`${config.serverUrl}${path}`, { headers, cache: "no-store" });
    if (!response.ok) {
      if (response.status === 401) this.token = null;
      const payload = await response.json().catch(() => null) as JsonRecord | null;
      throw new CentralApiError(response.status, typeof payload?.error === "string" ? payload.error : "request_failed",
        typeof payload?.message === "string" ? payload.message : `中央伺服器回應 ${response.status}`);
    }
    const type = response.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream";
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!type.startsWith("image/") || bytes.length > 16 * 1024 * 1024) throw new Error("臨床資產格式或大小不正確");
    return `data:${type};base64,${bytes.toString("base64")}`;
  }
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

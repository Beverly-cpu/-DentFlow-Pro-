const DEFAULT_PORT = 8787;

export type ApiConfig = {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  databaseUrl: string;
  databaseSsl: boolean;
  trustProxy: boolean;
};

function readBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`布林環境變數必須是 true 或 false，收到：${value}`);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
  if (!(["development", "test", "production"] as const).includes(nodeEnv as ApiConfig["nodeEnv"])) {
    throw new Error(`不支援的 NODE_ENV：${nodeEnv}`);
  }

  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("缺少必要環境變數 DATABASE_URL");

  const port = Number(env.PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT 必須是 1 到 65535 的整數，收到：${env.PORT ?? ""}`);
  }

  return {
    nodeEnv: nodeEnv as ApiConfig["nodeEnv"],
    host: env.HOST?.trim() || "127.0.0.1",
    port,
    databaseUrl,
    databaseSsl: readBoolean(env.DATABASE_SSL, nodeEnv === "production"),
    trustProxy: readBoolean(env.TRUST_PROXY, false),
  };
}

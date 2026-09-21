const SERVER_URL_ENV =
  "DENTFLOW_SERVER_URL";

const HEALTH_TIMEOUT_MS =
  5_000;

export type DentflowDeploymentConfig = {
  mode: "local" | "remote";
  serverUrl: string | null;
};

export type DentflowServerHealth = {
  ok: boolean;
  mode: "local" | "remote";
  serverUrl: string | null;
  message: string;
  checkedAt: string;
};

function normalizeServerUrl(
  rawValue: string | undefined,
) {
  const value = rawValue?.trim();

  if (!value) {
    return null;
  }

  const url = new URL(value);
  const isLocalDevelopment =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1";

  if (
    url.protocol !== "https:" &&
    !(isLocalDevelopment && url.protocol === "http:")
  ) {
    throw new Error(
      "遠端 DentFlow 伺服器必須使用 HTTPS",
    );
  }

  return url.toString().replace(/\/$/, "");
}

export function getDeploymentConfig():
  DentflowDeploymentConfig {
  const serverUrl =
    normalizeServerUrl(
      process.env[SERVER_URL_ENV],
    );

  return {
    mode: serverUrl ? "remote" : "local",
    serverUrl,
  };
}

export async function checkServerConnection():
  Promise<DentflowServerHealth> {
  const config =
    getDeploymentConfig();

  const checkedAt =
    new Date().toISOString();

  if (
    config.mode === "local" ||
    !config.serverUrl
  ) {
    return {
      ok: true,
      ...config,
      message: "目前使用單機資料庫模式",
      checkedAt,
    };
  }

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      HEALTH_TIMEOUT_MS,
    );

  try {
    const response =
      await fetch(
        `${config.serverUrl}/health`,
        {
          headers: {
            accept: "application/json",
          },
          signal:
            controller.signal,
        },
      );

    if (!response.ok) {
      throw new Error(
        `伺服器回應 ${response.status}`,
      );
    }

    return {
      ok: true,
      ...config,
      message: "DentFlow 雲端伺服器連線正常",
      checkedAt,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    return {
      ok: false,
      ...config,
      message: `無法連線 DentFlow 雲端伺服器：${message}`,
      checkedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";
import { createDraftJournal } from "./draftJournal";
function ready() {
  if (!safeStorage.isEncryptionAvailable() || (process.platform === "linux" && ["basic_text", "unknown"].includes(safeStorage.getSelectedStorageBackend()))) throw Error("系統尚未提供安全的加密儲存，暫停新增中央個案；查詢與既有草稿操作仍可使用");
}
function file(key: string) { return path.join(app.getPath("userData"), "central-draft-intents", createHash("sha256").update(key).digest("hex") + ".bin"); }
export const encryptedDraftJournal = createDraftJournal({
  read(key) { ready(); const p = file(key); return existsSync(p) ? readFileSync(p) : null; },
  write(key, bytes) { ready(); const p = file(key); mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 }); const temporary = p + "." + randomUUID() + ".tmp";
    try { writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 }); renameSync(temporary, p); }
    finally { if (existsSync(temporary)) unlinkSync(temporary); }
  },
  remove(key) { ready(); const p = file(key); if (existsSync(p)) unlinkSync(p); },
  encrypt(value) { ready(); return safeStorage.encryptString(value); },
  decrypt(bytes) { ready(); return safeStorage.decryptString(Buffer.from(bytes)); },
});

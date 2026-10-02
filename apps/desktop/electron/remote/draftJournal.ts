import { draftCreate } from "../../shared/centralImplants";
import type { DraftCreate } from "../../shared/centralImplants";
export type DraftContext = { serverUrl: string; actorUserId: number; clinicId: number };
export type DraftJournal = { read(context: DraftContext): DraftCreate | null; save(context: DraftContext, request: DraftCreate): void; clear(context: DraftContext, request: DraftCreate): void };
export type EncryptedJournalStorage = { read(key: string): Uint8Array | null; write(key: string, bytes: Uint8Array): void; remove(key: string): void; encrypt(value: string): Uint8Array; decrypt(bytes: Uint8Array): string };
export function journalKey(context: DraftContext) { return JSON.stringify([context.serverUrl, context.actorUserId, context.clinicId]); }
export function createDraftJournal(storage: EncryptedJournalStorage): DraftJournal {
  const read = (context: DraftContext) => { const bytes = storage.read(journalKey(context)); if (!bytes) return null; const request = draftCreate(JSON.parse(storage.decrypt(bytes))); if (request.clinicId !== context.clinicId) throw Error("保存草稿的院所不符"); return request; };
  return { read,
    save(context, request) { const normalized = draftCreate(request); if (normalized.clinicId !== context.clinicId) throw Error("新增院所不符"); const previous = read(context); if (previous && JSON.stringify(previous) !== JSON.stringify(normalized)) throw Error("已有待確認的新個案，請先恢復原請求"); storage.write(journalKey(context), storage.encrypt(JSON.stringify(normalized))); },
    clear(context, request) { const previous = read(context); if (previous && JSON.stringify(previous) !== JSON.stringify(draftCreate(request))) throw Error("保存請求已變更，不可清除"); storage.remove(journalKey(context)); },
  };
}

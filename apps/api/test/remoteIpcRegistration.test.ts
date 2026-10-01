import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { createRemotePatientClient } from "../../desktop/electron/remote/patientClient.ts";
import { createRemoteInventoryClient } from "../../desktop/electron/remote/inventoryClient.ts";
import { createRemoteImplantClient } from "../../desktop/electron/remote/implantClient.ts";
import { localOperation } from "../../desktop/electron/remote/localOperation.ts";
async function registered(mode: "local" | "remote") {
  const source = await readFile(new URL("../../desktop/electron/main.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("main.ts", source, ts.ScriptTarget.ES2023, true);
  const names = new Set(["registerLocalHandler", "registerRemotePatientHandlers", "registerRemoteDoctorHandlers", "registerPatientHandlers", "registerDoctorHandlers", "registerImplantHandlers", "registerCentralImplantHandlers", "registerInventoryHandlers", "registerCentralInventoryHandlers", "registerInventoryTransactionHandlers", "registerConsumableHandlers", "registerIpcHandlers"]);
  const functions = ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.has(n.name?.text ?? "")).map(n => n.getText(ast)).join("\n");
  const handlers = new Map<string, (...args: unknown[]) => unknown>(); const calls: string[] = []; let localReads = 0;
  const code = ts.transpileModule(functions + "\nregisterIpcHandlers();", { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { ipcMain: { handle(channel: string, callback: (...args: unknown[]) => unknown) { assert.equal(handlers.has(channel), false, channel); handlers.set(channel, callback); } },
    getDeploymentConfig: () => ({ mode }), createRemotePatientClient, createRemoteInventoryClient, createRemoteImplantClient, encryptedDraftJournal: { read: () => null, save() {}, clear() {} }, localOperation, centralApi: { async get(path: string) { calls.push(path); return []; }, async put(path: string) { calls.push(path); return {}; }, async post(path: string) { calls.push(path); return {}; }, async delete(path: string) { calls.push(path); return true; } },
    registerAuthHandlers() {}, registerClinicHandlers() {}, getPatients() { localReads++; return ["local"]; } };
  vm.runInNewContext(code, context); return { handlers, calls, localReads: () => localReads };
}
test("actual remote IPC registrations block every unswitched local channel before callback execution", async () => {
  const { handlers, calls } = await registered("remote");
  const blocked = [...handlers].filter(([channel]) => !channel.startsWith("patients:") && !channel.startsWith("central-inventory:") && !channel.startsWith("central-implants:") && !["doctors:list", "doctors:active", "doctors:by-id", "doctors:by-user-id", "doctors:active-by-user-id", "system:deployment-config", "system:server-health"].includes(channel));
  assert.ok(blocked.length > 40);
  for (const [channel, callback] of blocked) assert.throws(() => callback(null, 50, 10, {}), /尚未開放|中央醫師/, channel);
  assert.equal(calls.length, 0);
  await handlers.get("patients:list")!(null, 10); assert.equal(calls[0], "/v1/patients?clinicId=10");
  await handlers.get("patients:delete")!(null, 50, 10, 7); assert.equal(calls[1], "/v1/patients/50?clinicId=10&expectedVersion=7");
});
test("actual local patient IPC registration still uses the local repository", async () => {
  const { handlers, calls, localReads } = await registered("local");
  assert.deepEqual(handlers.get("patients:list")!(null, 10), ["local"]); assert.equal(localReads(), 1); assert.equal(calls.length, 0);
});

test("actual central inventory IPC uses API paths while local mode rejects it", async () => {
  const remote = await registered("remote");
  await remote.handlers.get("central-inventory:list")!(null, 10, 100);
  assert.equal(remote.calls[0], "/v1/inventory?clinicId=10&afterId=100");
  await remote.handlers.get("central-inventory:sources")!(null, 50, 10);
  assert.equal(remote.calls[1], "/v1/inventory/50/sources?clinicId=10");
  const local = await registered("local");
  for (const [channel, callback] of local.handlers) if (channel.startsWith("central-inventory:")) assert.throws(() => callback(null, 50, 10), /中央伺服器/);
  assert.equal(local.calls.length, 0);
});

test("actual central implant IPC uses central ID paths; local mode rejects every new entry", async () => {
  const remote = await registered("remote");
  await remote.handlers.get("central-implants:list")!(null, 10, 100);
  await remote.handlers.get("central-implants:detail")!(null, 50, 10);
  assert.deepEqual(remote.calls, ["/v1/implants?clinicId=10&afterId=100", "/v1/implants/50?clinicId=10"]);
  const local = await registered("local");
  for (const [channel, callback] of local.handlers) if (channel.startsWith("central-implants:")) assert.throws(() => callback(null, 50, 10), /中央伺服器/);
  assert.equal(local.calls.length, 0);
});

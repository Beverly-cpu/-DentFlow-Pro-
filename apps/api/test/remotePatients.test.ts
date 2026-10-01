import assert from "node:assert/strict";
import test from "node:test";
import { createRemotePatientClient } from "../../desktop/electron/remote/patientClient.ts";
import type { PatientTransport } from "../../desktop/electron/remote/patientClient.ts";
import { CentralApiError } from "../../desktop/electron/remote/centralApiError.ts";
import { localOperation } from "../../desktop/electron/remote/localOperation.ts";
function fixture(error?: Error) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const request = async (method: string, path: string, body?: unknown) => { calls.push({ method, path, body }); if (error) throw error; return [{ id: 1, clinicId: 10 }, { id: 2, clinicId: 11 }]; };
  const api = { get: (p: string) => request("GET", p), post: (p: string, b: unknown) => request("POST", p, b), put: (p: string, b: unknown) => request("PUT", p, b), delete: (p: string) => request("DELETE", p) } as PatientTransport;
  return { client: createRemotePatientClient(api), calls };
}
test("desktop patient writes preserve editor version and central doctor ID without legacy or client fields", async () => {
  const { client, calls } = fixture();
  await client.update(50, 10, { chartNumber: "A", name: "Patient", doctorUserId: 20, doctor: "Wrong label", expectedVersion: 7, clinicId: 999, phone: "ignored", actorUserId: 1 });
  assert.equal(calls[0]!.path, "/v1/patients/50"); const body = calls[0]!.body as Record<string, unknown>;
  assert.equal(body.expectedVersion, 7); assert.equal(body.doctorUserId, 20); assert.equal(body.clinicId, 10); assert.equal(body.doctor, undefined); assert.equal(body.actorUserId, undefined); assert.equal(body.phone, undefined);
  await client.archive(50, 10, 7); assert.equal(calls[1]!.path, "/v1/patients/50?clinicId=10&expectedVersion=7");
});
test("missing edit/archive versions and name-only doctor assignments never reach central API", () => {
  const { client, calls } = fixture();
  assert.throws(() => client.update(50, 10, { name: "P" })); assert.throws(() => client.archive(50, 10, undefined as unknown as number));
  assert.throws(() => client.create(10, { doctor: "Legacy name" })); assert.equal(calls.length, 0);
});
test("doctor browse uses central user identity and filters the selected clinic", async () => {
  const { client, calls } = fixture(); assert.deepEqual(await client.byDoctor(20, 10), [{ id: 1, clinicId: 10 }]); assert.equal(calls[0]!.path, "/v1/patients/by-doctor-user/20");
  await client.doctors(10); assert.equal(calls[1]!.path, "/v1/doctors?clinicId=10");
});
test("only real HTTP 404 becomes missing; network, permission and stale version errors propagate", async () => {
  assert.equal(await fixture(new CentralApiError(404, "not_found", "Missing")).client.byId(1, 10), null);
  for (const error of [new Error("network"), new CentralApiError(403, "forbidden", "Denied"), new CentralApiError(409, "version_conflict", "Changed")]) await assert.rejects(fixture(error).client.byId(1, 10), e => e === error);
});
test("remote unswitched operations cannot invoke SQLite callback; local mode preserves it", () => {
  let writes = 0; const operation = (id: number) => { writes++; return id; };
  assert.throws(() => localOperation("remote", operation)(50)); assert.equal(writes, 0);
  assert.equal(localOperation("local", operation)(50), 50); assert.equal(writes, 1);
});

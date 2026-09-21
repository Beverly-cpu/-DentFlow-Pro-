import { createHash, randomBytes, randomUUID } from "node:crypto";

import bcrypt from "bcrypt";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { DatabasePool } from "./database.js";

const SESSION_HOURS = 8;
export const PASSWORD_MIN_LENGTH = 8;
export const BCRYPT_ROUNDS = 12;

export const roles = ["Doctor", "Assistant", "Admin", "Accountant", "Procurement"] as const;
export type UserRole = (typeof roles)[number];

export type SessionPrincipal = {
  sessionId: string;
  userId: number;
  role: UserRole;
  clinicId: number | null;
  deviceId: string;
};

declare module "fastify" {
  interface FastifyRequest {
    principal: SessionPrincipal | null;
  }
}

export function normalizeAccount(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function assertPassword(password: unknown) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`密碼至少需要 ${PASSWORD_MIN_LENGTH} 個字元`);
  }
}

export function isRole(value: unknown): value is UserRole {
  return typeof value === "string" && roles.includes(value as UserRole);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest();
}

export async function createSession(
  pool: DatabasePool,
  input: { userId: number; tokenVersion: number; clinicId: number; deviceId: string },
) {
  const token = randomBytes(32).toString("base64url");
  const sessionId = randomUUID();
  await pool.query(
    `INSERT INTO sessions
      (id, user_id, token_hash, token_version, device_id, selected_clinic_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() + ($7 || ' hours')::interval)`,
    [sessionId, input.userId, hashToken(token), input.tokenVersion, input.deviceId, input.clinicId, SESSION_HOURS],
  );
  return { token, sessionId };
}

export function registerAuthHook(pool: DatabasePool) {
  return async (request: FastifyRequest) => {
    request.principal = null;
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return;
    const token = header.slice(7).trim();
    if (!token) return;

    const result = await pool.query<{
      sessionId: string;
      userId: string;
      role: UserRole;
      clinicId: string | null;
      deviceId: string;
    }>(
      `SELECT s.id AS "sessionId", u.id AS "userId", u.role,
              s.selected_clinic_id AS "clinicId", s.device_id AS "deviceId"
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > now()
         AND u.active = true
         AND u.token_version = s.token_version`,
      [hashToken(token)],
    );
    const row = result.rows[0];
    if (!row) return;
    request.principal = {
      sessionId: row.sessionId,
      userId: Number(row.userId),
      role: row.role,
      clinicId: row.clinicId === null ? null : Number(row.clinicId),
      deviceId: row.deviceId,
    };
    void pool.query("UPDATE sessions SET last_seen_at = now() WHERE id = $1", [row.sessionId]);
  };
}

export async function requireSession(request: FastifyRequest, reply: FastifyReply) {
  if (request.principal) return;
  return reply.code(401).send({ error: "unauthorized", message: "登入已失效，請重新登入" });
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.principal) {
    return reply.code(401).send({ error: "unauthorized", message: "登入已失效，請重新登入" });
  }
  if (request.principal.role !== "Admin") {
    return reply.code(403).send({ error: "forbidden", message: "此操作需要管理者權限" });
  }
}

export async function audit(
  pool: DatabasePool,
  request: FastifyRequest,
  eventType: string,
  entityType?: string,
  entityId?: string | number,
  metadata: Record<string, unknown> = {},
) {
  const principal = request.principal;
  await pool.query(
    `INSERT INTO audit_events
      (actor_user_id, clinic_id, session_id, device_id, request_id, event_type, entity_type, entity_id, ip, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [principal?.userId ?? null, principal?.clinicId ?? null, principal?.sessionId ?? null,
      principal?.deviceId ?? request.headers["x-device-id"] ?? null, request.id, eventType,
      entityType ?? null, entityId === undefined ? null : String(entityId), request.ip, JSON.stringify(metadata)],
  );
}

export async function hashPassword(password: string) {
  assertPassword(password);
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

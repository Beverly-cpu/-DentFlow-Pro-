import { getDatabase } from "./db";

export type LegacyInventoryRecord = {
  legacyId: number; clinicCode: string; name: string; category: string;
  brand: string; model: string; specification: string; refNumber: string;
  lotNumber: string; expiryDate: string; quantity: number; unitCost: number;
  safetyStock: number; note: string; createdAt: string; updatedAt: string;
};
export type LegacyUserRecord = { legacyId: number; clinicCode: string; account: string; role: string };

export function getLegacyInventoryForMigration(): LegacyInventoryRecord[] {
  return getDatabase().prepare(`
    SELECT i.id AS legacyId,c.code AS clinicCode,i.name,i.category,i.brand,i.model,
      i.specification,i.refNumber,i.lotNumber,i.expiryDate,i.quantity,i.unitCost,
      i.safetyStock,i.note,i.createdAt,i.updatedAt
    FROM inventory i LEFT JOIN clinics c ON c.id=i.clinicId ORDER BY i.id
  `).all() as LegacyInventoryRecord[];
}

// Export identity only. Never send passwords, contact details or session data.
// Include clinics referenced by historic cases after membership was removed.
export function getLegacyUsersForMigration(): LegacyUserRecord[] {
  return getDatabase().prepare(`
    WITH memberships AS (
      SELECT userId,clinicId FROM userClinics
      UNION SELECT createdByUserId,clinicId FROM implants
      UNION SELECT orderedByUserId,clinicId FROM implants
      UNION SELECT pickedByUserId,clinicId FROM implants
      UNION SELECT surgeryCompletedByUserId,clinicId FROM implants
      UNION SELECT returnedByUserId,clinicId FROM implants
      UNION SELECT closedByUserId,clinicId FROM implants
      UNION SELECT cancelledByUserId,clinicId FROM implants
      UNION SELECT doctorSignedByUserId,clinicId FROM implants
      UNION SELECT r.pickedByUserId,i.clinicId FROM implantReservations r JOIN implants i ON i.id=r.implantId
      UNION SELECT a.actorUserId,i.clinicId FROM implantReturnAudits a JOIN implants i ON i.id=a.implantId
    )
    SELECT DISTINCT u.id AS legacyId,c.code AS clinicCode,u.account,u.role
    FROM memberships m JOIN users u ON u.id=m.userId
    LEFT JOIN clinics c ON c.id=m.clinicId ORDER BY u.id,c.code
  `).all() as LegacyUserRecord[];
}

import { getDatabase } from "./db";

export type ImplantInput = {
  patientId: number;
  doctorId: number | null;
  toothPosition: string;
  brand: string;
  model: string;
  diameter: string;
  length: string;
  lotNumber: string;
  expiryDate: string;
  implantDate: string;
  note: string;
};

export type ImplantRecord = ImplantInput & {
  id: number;

  patientName: string;
  patientChartNumber: string;

  doctorName: string | null;

  createdAt: string;
  updatedAt: string;
};

export function getImplants(): ImplantRecord[] {
  const database = getDatabase();

  return database
    .prepare(`
      SELECT
        implants.id,
        implants.patientId,
        implants.doctorId,
        implants.toothPosition,
        implants.brand,
        implants.model,
        implants.diameter,
        implants.length,
        implants.lotNumber,
        implants.expiryDate,
        implants.implantDate,
        implants.note,
        implants.createdAt,
        implants.updatedAt,

        patients.name AS patientName,
        patients.chartNumber AS patientChartNumber,

        doctors.name AS doctorName

      FROM implants

      INNER JOIN patients
        ON patients.id = implants.patientId

      LEFT JOIN doctors
        ON doctors.id = implants.doctorId

      ORDER BY implants.id DESC
    `)
    .all() as ImplantRecord[];
}

export function createImplant(
  implant: ImplantInput,
): ImplantRecord {
  const database = getDatabase();

  const result = database
    .prepare(`
      INSERT INTO implants (
        patientId,
        doctorId,
        toothPosition,
        brand,
        model,
        diameter,
        length,
        lotNumber,
        expiryDate,
        implantDate,
        note
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      implant.patientId,
      implant.doctorId,
      implant.toothPosition.trim(),
      implant.brand.trim(),
      implant.model.trim(),
      implant.diameter.trim(),
      implant.length.trim(),
      implant.lotNumber.trim(),
      implant.expiryDate,
      implant.implantDate,
      implant.note.trim(),
    );

  return getImplantById(Number(result.lastInsertRowid));
}

export function updateImplant(
  id: number,
  implant: ImplantInput,
): ImplantRecord {
  const database = getDatabase();

  database
    .prepare(`
      UPDATE implants
      SET
        patientId = ?,
        doctorId = ?,
        toothPosition = ?,
        brand = ?,
        model = ?,
        diameter = ?,
        length = ?,
        lotNumber = ?,
        expiryDate = ?,
        implantDate = ?,
        note = ?,
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .run(
      implant.patientId,
      implant.doctorId,
      implant.toothPosition.trim(),
      implant.brand.trim(),
      implant.model.trim(),
      implant.diameter.trim(),
      implant.length.trim(),
      implant.lotNumber.trim(),
      implant.expiryDate,
      implant.implantDate,
      implant.note.trim(),
      id,
    );

  return getImplantById(id);
}

export function deleteImplant(id: number): boolean {
  const database = getDatabase();

  const result = database
    .prepare(`
      DELETE FROM implants
      WHERE id = ?
    `)
    .run(id);

  return result.changes > 0;
}

function getImplantById(id: number): ImplantRecord {
  const database = getDatabase();

  const implant = database
    .prepare(`
      SELECT
        implants.id,
        implants.patientId,
        implants.doctorId,
        implants.toothPosition,
        implants.brand,
        implants.model,
        implants.diameter,
        implants.length,
        implants.lotNumber,
        implants.expiryDate,
        implants.implantDate,
        implants.note,
        implants.createdAt,
        implants.updatedAt,

        patients.name AS patientName,
        patients.chartNumber AS patientChartNumber,

        doctors.name AS doctorName

      FROM implants

      INNER JOIN patients
        ON patients.id = implants.patientId

      LEFT JOIN doctors
        ON doctors.id = implants.doctorId

      WHERE implants.id = ?
    `)
    .get(id) as ImplantRecord | undefined;

  if (!implant) {
    throw new Error("找不到植體紀錄");
  }

  return implant;
}
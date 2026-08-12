import { getDatabase } from "./db";

export type PatientInput = {
  chartNumber: string;
  name: string;
  birthDate: string;
  phone: string;
  doctor: string;
  note: string;
};

export type PatientRecord = PatientInput & {
  id: number;
  createdAt: string;
  updatedAt: string;
};

export function getPatients(): PatientRecord[] {
  return getDatabase()
    .prepare(`
      SELECT
        id,
        chartNumber,
        name,
        birthDate,
        phone,
        doctor,
        note,
        createdAt,
        updatedAt
      FROM patients
      ORDER BY id DESC
    `)
    .all() as PatientRecord[];
}

export function createPatient(patient: PatientInput): PatientRecord {
  const database = getDatabase();

  const result = database
    .prepare(`
      INSERT INTO patients (
        chartNumber,
        name,
        birthDate,
        phone,
        doctor,
        note
      )
      VALUES (
        @chartNumber,
        @name,
        @birthDate,
        @phone,
        @doctor,
        @note
      )
    `)
    .run(patient);

  return database
    .prepare(`
      SELECT *
      FROM patients
      WHERE id = ?
    `)
    .get(result.lastInsertRowid) as PatientRecord;
}

export function updatePatient(
  id: number,
  patient: PatientInput,
): PatientRecord {
  const database = getDatabase();

  database
    .prepare(`
      UPDATE patients
      SET
        chartNumber = @chartNumber,
        name = @name,
        birthDate = @birthDate,
        phone = @phone,
        doctor = @doctor,
        note = @note,
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = @id
    `)
    .run({
      id,
      ...patient,
    });

  return database
    .prepare(`
      SELECT *
      FROM patients
      WHERE id = ?
    `)
    .get(id) as PatientRecord;
}

export function deletePatient(id: number): void {
  getDatabase()
    .prepare(`
      DELETE FROM patients
      WHERE id = ?
    `)
    .run(id);
}
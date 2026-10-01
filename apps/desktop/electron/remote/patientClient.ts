import { CentralApiError } from "./centralApiError";
export type CentralPatient = { id: number; clinicId: number; version: number; doctorUserId: number | null };
export type CentralDoctor = { id: number; userId: number; name: string; account: string };
export type PatientTransport = {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
};
function positive(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw Error(`${label}格式錯誤，請重新載入`);
  return value;
}
function writeInput(clinicId: number, value: unknown, edit: boolean) {
  positive(clinicId, "院所");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("病患資料格式錯誤");
  const row = value as Record<string, unknown>;
  const doctorUserId = row.doctorUserId == null ? null : positive(row.doctorUserId, "指定醫師");
  if (doctorUserId === null && row.doctor) throw Error("請從中央醫師名單重新選擇主治醫師");
  return { clinicId, chartNumber: row.chartNumber, name: row.name, birthDate: row.birthDate, note: row.note, doctorUserId,
    ...(edit ? { expectedVersion: positive(row.expectedVersion, "病患版本") } : {}) };
}
export function createRemotePatientClient(api: PatientTransport) {
  const doctors = (clinicId: number) => api.get<CentralDoctor[]>(`/v1/doctors?clinicId=${positive(clinicId, "院所")}`);
  const byDoctorAllClinics = (userId: number) => api.get<CentralPatient[]>(`/v1/patients/by-doctor-user/${positive(userId, "中央醫師")}`);
  return {
    list: (clinicId: number) => api.get<CentralPatient[]>(`/v1/patients?clinicId=${positive(clinicId, "院所")}`),
    async byId(patientId: number, clinicId: number) {
      try { return await api.get<CentralPatient>(`/v1/patients/${positive(patientId, "中央病患")}?clinicId=${positive(clinicId, "院所")}`); }
      catch (error) { if (error instanceof CentralApiError && error.status === 404) return null; throw error; }
    },
    byDoctorAllClinics,
    async byDoctor(userId: number, clinicId: number) {
      positive(clinicId, "院所"); return (await byDoctorAllClinics(userId)).filter(p => p.clinicId === clinicId);
    },
    create: (clinicId: number, input: unknown) => api.post<CentralPatient>("/v1/patients", writeInput(clinicId, input, false)),
    update: (patientId: number, clinicId: number, input: unknown) => api.put<CentralPatient>(`/v1/patients/${positive(patientId, "中央病患")}`, writeInput(clinicId, input, true)),
    archive: (patientId: number, clinicId: number, version: number) => api.delete<boolean>(`/v1/patients/${positive(patientId, "中央病患")}?clinicId=${positive(clinicId, "院所")}&expectedVersion=${positive(version, "病患版本")}`),
    doctors,
  };
}

import Database from "better-sqlite3";
import path from "node:path";
import { app } from "electron";

let database: Database.Database | null = null;

export function initializeDatabase(): Database.Database {
  if (database) {
    return database;
  }

  const databasePath = path.join(app.getPath("userData"), "dentflow.db");

  database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  database.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chartNumber TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      birthDate TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      doctor TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      account TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      specialty TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'Doctor',
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS implants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  patientId INTEGER NOT NULL,
  doctorId INTEGER,

  toothPosition TEXT NOT NULL DEFAULT '',

  brand TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  diameter TEXT NOT NULL DEFAULT '',
  length TEXT NOT NULL DEFAULT '',

  lotNumber TEXT NOT NULL DEFAULT '',
  expiryDate TEXT NOT NULL DEFAULT '',
  implantDate TEXT NOT NULL DEFAULT '',

  note TEXT NOT NULL DEFAULT '',

  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (patientId)
    REFERENCES patients(id)
    ON DELETE RESTRICT,

  FOREIGN KEY (doctorId)
    REFERENCES doctors(id)
    ON DELETE SET NULL
    );
  `);

  console.log("DentFlow database:", databasePath);

  return database;
}

export function getDatabase(): Database.Database {
  if (!database) {
    throw new Error("資料庫尚未初始化");
  }

  return database;
}
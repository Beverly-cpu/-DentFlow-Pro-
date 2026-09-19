import Database from "better-sqlite3";
import path from "node:path";
import { app } from "electron";

/* =========================================================
   Database Instance
========================================================= */

let database:
  Database.Database | null = null;

/* =========================================================
   Types
========================================================= */

type TableColumnInfo = {
  cid: number;

  name: string;

  type: string;

  notnull: number;

  dflt_value: unknown;

  pk: number;
};

type ClinicRow = {
  id: number;

  code: string;

  name: string;
};

/* =========================================================
   初始化資料庫
========================================================= */

export function initializeDatabase():
  Database.Database {
  if (database) {
    return database;
  }

  const databasePath =
    path.join(
      app.getPath(
        "userData",
      ),
      "dentflow.db",
    );

  const db =
    new Database(
      databasePath,
    );

  database = db;

  /* =======================================================
     SQLite Settings
  ======================================================= */

  db.pragma(
    "journal_mode = WAL",
  );

  db.pragma(
    "foreign_keys = ON",
  );

  /* =======================================================
     建立主要 Schema
  ======================================================= */

  db.exec(`
    /* =====================================================
       Migration 紀錄
    ===================================================== */

    CREATE TABLE IF NOT EXISTS schemaMigrations (
      key TEXT PRIMARY KEY,

      appliedAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP
    );


    /* =====================================================
       院所
    ===================================================== */

    CREATE TABLE IF NOT EXISTS clinics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      code TEXT NOT NULL UNIQUE,

      name TEXT NOT NULL,

      phone TEXT NOT NULL
        DEFAULT '',

      address TEXT NOT NULL
        DEFAULT '',

      note TEXT NOT NULL
        DEFAULT '',

      isActive INTEGER NOT NULL
        DEFAULT 1,

      createdAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      updatedAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      CHECK (
        isActive IN (
          0,
          1
        )
      )
    );


    /* =====================================================
       系統登入帳號
    ===================================================== */

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      name TEXT NOT NULL,

      account TEXT NOT NULL UNIQUE,

      passwordHash TEXT NOT NULL,

      role TEXT NOT NULL,

      phone TEXT NOT NULL
        DEFAULT '',

      email TEXT NOT NULL
        DEFAULT '',

      isActive INTEGER NOT NULL
        DEFAULT 1,

      lastLoginAt TEXT,

      createdAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      updatedAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      CHECK (
        role IN (
          'Doctor',
          'Assistant',
          'Admin',
          'Accountant',
          'Procurement'
        )
      ),

      CHECK (
        isActive IN (
          0,
          1
        )
      )
    );


    /* =====================================================
       使用者 × 院所

       一個使用者可登入多間院所。
    ===================================================== */

    CREATE TABLE IF NOT EXISTS userClinics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      userId INTEGER NOT NULL,

      clinicId INTEGER NOT NULL,

      isPrimary INTEGER NOT NULL
        DEFAULT 0,

      createdAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      updatedAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (
        userId
      )
        REFERENCES users(id)
        ON DELETE CASCADE,

      FOREIGN KEY (
        clinicId
      )
        REFERENCES clinics(id)
        ON DELETE CASCADE,

      CHECK (
        isPrimary IN (
          0,
          1
        )
      ),

      UNIQUE (
        userId,
        clinicId
      )
    );


    /* =====================================================
       病患
    ===================================================== */

    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      clinicId INTEGER,

      chartNumber TEXT NOT NULL UNIQUE,

      name TEXT NOT NULL,

      birthDate TEXT NOT NULL
        DEFAULT '',

      phone TEXT NOT NULL
        DEFAULT '',

      doctor TEXT NOT NULL
        DEFAULT '',

      note TEXT NOT NULL
        DEFAULT '',

      createdAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      updatedAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (
        clinicId
      )
        REFERENCES clinics(id)
        ON DELETE RESTRICT
    );


    /* =====================================================
       醫師

       doctors:
       醫師專業身份。

       users:
       登入帳號。

       -----------------------------------------------------

       clinicId 暫時保留作為舊版相容欄位。

       新版醫師 × 院所關係，
       正式由 doctorClinics 管理。
    ===================================================== */

    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      clinicId INTEGER,

      userId INTEGER,

      name TEXT NOT NULL,

      account TEXT NOT NULL UNIQUE,

      passwordHash TEXT NOT NULL,

      specialty TEXT NOT NULL
        DEFAULT '',

      phone TEXT NOT NULL
        DEFAULT '',

      role TEXT NOT NULL
        DEFAULT 'Doctor',

      isActive INTEGER NOT NULL
        DEFAULT 1,

      createdAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      updatedAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (
        clinicId
      )
        REFERENCES clinics(id)
        ON DELETE RESTRICT,

      FOREIGN KEY (
        userId
      )
        REFERENCES users(id)
        ON DELETE SET NULL
    );


    /* =====================================================
       醫師 × 院所

       一位醫師可在多間院所執業。

       例如：

       王醫師
       → 台北院所
       → 新竹院所
       → 台中院所

       -----------------------------------------------------

       isPrimary:
       醫師預設主要執業院所。

       doctors.clinicId:
       暫時保留舊資料相容，
       新功能不再以它作為唯一院所來源。
    ===================================================== */

    CREATE TABLE IF NOT EXISTS doctorClinics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      doctorId INTEGER NOT NULL,

      clinicId INTEGER NOT NULL,

      isPrimary INTEGER NOT NULL
        DEFAULT 0,

      createdAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      updatedAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (
        doctorId
      )
        REFERENCES doctors(id)
        ON DELETE CASCADE,

      FOREIGN KEY (
        clinicId
      )
        REFERENCES clinics(id)
        ON DELETE CASCADE,

      CHECK (
        isPrimary IN (
          0,
          1
        )
      ),

      UNIQUE (
        doctorId,
        clinicId
      )
    );


    /* =====================================================
       庫存

       同尺寸、不同 REF / LOT
       必須是不同 inventory row。
    ===================================================== */

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      clinicId INTEGER,

      name TEXT NOT NULL,

      category TEXT NOT NULL
        DEFAULT '其他耗材',

      brand TEXT NOT NULL
        DEFAULT '',

      model TEXT NOT NULL
        DEFAULT '',

      specification TEXT NOT NULL
        DEFAULT '',

      refNumber TEXT NOT NULL
        DEFAULT '',

      lotNumber TEXT NOT NULL
        DEFAULT '',

      expiryDate TEXT NOT NULL
        DEFAULT '',

      quantity INTEGER NOT NULL
        DEFAULT 0,

      unitCost REAL NOT NULL
        DEFAULT 0,

      safetyStock INTEGER NOT NULL
        DEFAULT 0,

      note TEXT NOT NULL
        DEFAULT '',

      createdAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      updatedAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (
        clinicId
      )
        REFERENCES clinics(id)
        ON DELETE RESTRICT,

      CHECK (
        quantity >= 0
      ),

      CHECK (
        safetyStock >= 0
      )
    );


    /* =====================================================
       植體個案主檔
    ===================================================== */

    CREATE TABLE IF NOT EXISTS implants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      clinicId INTEGER,

      patientId INTEGER NOT NULL,

      doctorId INTEGER,

      inventoryItemId INTEGER,

      toothPosition TEXT NOT NULL
        DEFAULT '',

      brand TEXT NOT NULL
        DEFAULT '',

      model TEXT NOT NULL
        DEFAULT '',

      diameter TEXT NOT NULL
        DEFAULT '',

      length TEXT NOT NULL
        DEFAULT '',

      lotNumber TEXT NOT NULL
        DEFAULT '',

      expiryDate TEXT NOT NULL
        DEFAULT '',

      implantDate TEXT NOT NULL
        DEFAULT '',

      note TEXT NOT NULL
        DEFAULT '',

      status TEXT NOT NULL
        DEFAULT '待醫師叫貨',

      inventoryDeducted INTEGER NOT NULL
        DEFAULT 0,

      inventoryReturned INTEGER NOT NULL
        DEFAULT 0,

      createdByUserId INTEGER REFERENCES users(id),

      createdAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      updatedAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (
        clinicId
      )
        REFERENCES clinics(id)
        ON DELETE RESTRICT,

      FOREIGN KEY (
        patientId
      )
        REFERENCES patients(id)
        ON DELETE RESTRICT,

      FOREIGN KEY (
        doctorId
      )
        REFERENCES doctors(id)
        ON DELETE SET NULL,

      FOREIGN KEY (
        inventoryItemId
      )
        REFERENCES inventory(id)
        ON DELETE SET NULL
    );


    /* =====================================================
       植體個案牙位
    ===================================================== */

    CREATE TABLE IF NOT EXISTS implantTeeth (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      implantId INTEGER NOT NULL,

      toothPosition TEXT NOT NULL,

      createdAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      updatedAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (
        implantId
      )
        REFERENCES implants(id)
        ON DELETE CASCADE,

      UNIQUE (
        implantId,
        toothPosition
      )
    );


    /* =====================================================
       舊版 implantItems
    ===================================================== */

    CREATE TABLE IF NOT EXISTS implantItems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      implantToothId INTEGER NOT NULL,

      inventoryItemId INTEGER NOT NULL,

      quantity INTEGER NOT NULL
        DEFAULT 1,

      deductedQuantity INTEGER NOT NULL
        DEFAULT 0,

      usedQuantity INTEGER NOT NULL
        DEFAULT 0,

      returnedQuantity INTEGER NOT NULL
        DEFAULT 0,

      createdAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      updatedAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (
        implantToothId
      )
        REFERENCES implantTeeth(id)
        ON DELETE CASCADE,

      FOREIGN KEY (
        inventoryItemId
      )
        REFERENCES inventory(id)
        ON DELETE RESTRICT,

      CHECK (
        quantity >= 1
      ),

      CHECK (
        deductedQuantity >= 0
      ),

      CHECK (
        usedQuantity >= 0
      ),

      CHECK (
        returnedQuantity >= 0
      ),

      UNIQUE (
        implantToothId,
        inventoryItemId
      )
    );


    /* =====================================================
       新版：術前規格需求
    ===================================================== */

    CREATE TABLE IF NOT EXISTS implantPlanItems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      implantToothId INTEGER NOT NULL,

      legacyImplantItemId INTEGER,

      name TEXT NOT NULL
        DEFAULT '',

      category TEXT NOT NULL
        DEFAULT '植體',

      brand TEXT NOT NULL
        DEFAULT '',

      model TEXT NOT NULL
        DEFAULT '',

      specification TEXT NOT NULL
        DEFAULT '',

      plannedQuantity INTEGER NOT NULL
        DEFAULT 1,

      note TEXT NOT NULL
        DEFAULT '',

      instrumentPhotoDataUrl TEXT NOT NULL
        DEFAULT '',

      createdAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      updatedAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (
        implantToothId
      )
        REFERENCES implantTeeth(id)
        ON DELETE CASCADE,

      CHECK (
        plannedQuantity >= 1
      ),

      UNIQUE (
        legacyImplantItemId
      )
    );


    /* =====================================================
       新版：術後實際使用
    ===================================================== */

    CREATE TABLE IF NOT EXISTS implantUsageItems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      implantPlanItemId INTEGER NOT NULL,

      inventoryItemId INTEGER NOT NULL,

      quantity INTEGER NOT NULL
        DEFAULT 1,

      note TEXT NOT NULL
        DEFAULT '',

      createdAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      updatedAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (
        implantPlanItemId
      )
        REFERENCES implantPlanItems(id)
        ON DELETE CASCADE,

      FOREIGN KEY (
        inventoryItemId
      )
        REFERENCES inventory(id)
        ON DELETE RESTRICT,

      CHECK (
        quantity >= 1
      )
    );


    /* =====================================================
       庫存異動紀錄
    ===================================================== */

    CREATE TABLE IF NOT EXISTS inventoryTransactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      clinicId INTEGER,

      inventoryItemId INTEGER NOT NULL,

      implantId INTEGER,

      implantToothId INTEGER,

      implantItemId INTEGER,

      implantPlanItemId INTEGER,

      implantUsageItemId INTEGER,

      type TEXT NOT NULL,

      quantityChange INTEGER NOT NULL,

      quantityBefore INTEGER NOT NULL,

      quantityAfter INTEGER NOT NULL,

      unitCost REAL NOT NULL
        DEFAULT 0,

      totalCost REAL NOT NULL
        DEFAULT 0,

      note TEXT NOT NULL
        DEFAULT '',

      createdAt TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (
        clinicId
      )
        REFERENCES clinics(id)
        ON DELETE RESTRICT,

      FOREIGN KEY (
        inventoryItemId
      )
        REFERENCES inventory(id)
        ON DELETE RESTRICT,

      FOREIGN KEY (
        implantId
      )
        REFERENCES implants(id)
        ON DELETE SET NULL,

      FOREIGN KEY (
        implantToothId
      )
        REFERENCES implantTeeth(id)
        ON DELETE SET NULL,

      FOREIGN KEY (
        implantItemId
      )
        REFERENCES implantItems(id)
        ON DELETE SET NULL,

      FOREIGN KEY (
        implantPlanItemId
      )
        REFERENCES implantPlanItems(id)
        ON DELETE SET NULL,

      FOREIGN KEY (
        implantUsageItemId
      )
        REFERENCES implantUsageItems(id)
        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS inventoryItems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clinicId INTEGER NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      brand TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      specification TEXT NOT NULL DEFAULT '',
      refNumber TEXT NOT NULL DEFAULT '',
      lotNumber TEXT NOT NULL DEFAULT '',
      expiryDate TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      safetyStock INTEGER NOT NULL DEFAULT 0 CHECK (safetyStock >= 0),
      unitCost REAL NOT NULL DEFAULT 0 CHECK (unitCost >= 0),
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_inventoryItems_clinicId
      ON inventoryItems(clinicId);

    CREATE TABLE IF NOT EXISTS inventoryTransactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clinicId INTEGER NOT NULL,
      inventoryItemId INTEGER NOT NULL,
      type TEXT NOT NULL,
      quantityChange INTEGER NOT NULL,
      quantityBefore INTEGER NOT NULL,
      quantityAfter INTEGER NOT NULL,
      unitCost REAL NOT NULL DEFAULT 0,
      totalCost REAL NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      inventoryName TEXT NOT NULL,
      inventoryCategory TEXT NOT NULL DEFAULT '',
      inventoryBrand TEXT NOT NULL DEFAULT '',
      inventoryModel TEXT NOT NULL DEFAULT '',
      inventorySpecification TEXT NOT NULL DEFAULT '',
      inventoryRefNumber TEXT NOT NULL DEFAULT '',
      inventoryLotNumber TEXT NOT NULL DEFAULT '',
      inventoryExpiryDate TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (inventoryItemId) REFERENCES inventoryItems(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_inventoryTransactions_clinicId_createdAt
      ON inventoryTransactions(clinicId, createdAt DESC);
  `);

  database.exec(`
    UPDATE doctors SET role = 'Admin' WHERE role = 'Administrator';
    UPDATE doctors SET role = 'Assistant' WHERE role = 'Warehouse';

    CREATE TABLE IF NOT EXISTS inventoryCategories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clinicId INTEGER NOT NULL,
      name TEXT NOT NULL,
      requiresDoctorSignature INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (clinicId) REFERENCES clinics(id) ON DELETE CASCADE,
      UNIQUE (clinicId, name)
    );
  `);

  const inventoryCategoryColumns = db.prepare("PRAGMA table_info(inventoryCategories)").all() as Array<{ name: string }>;
  if (!inventoryCategoryColumns.some((column) => column.name === "requiresDoctorSignature")) {
    db.exec("ALTER TABLE inventoryCategories ADD COLUMN requiresDoctorSignature INTEGER NOT NULL DEFAULT 0");
  }

  const usersSchema = db.prepare(`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'
  `).get() as { sql: string } | undefined;

  if (usersSchema && !usersSchema.sql.includes("'Procurement'")) {
    db.pragma("foreign_keys = OFF");
    try {
      db.exec(`
        BEGIN;
        CREATE TABLE users_role_upgrade (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          account TEXT NOT NULL UNIQUE,
          passwordHash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('Doctor','Assistant','Admin','Accountant','Procurement')),
          phone TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          isActive INTEGER NOT NULL DEFAULT 1 CHECK (isActive IN (0,1)),
          lastLoginAt TEXT,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO users_role_upgrade
          (id,name,account,passwordHash,role,phone,email,isActive,lastLoginAt,createdAt,updatedAt)
        SELECT id,name,account,passwordHash,role,phone,email,isActive,lastLoginAt,createdAt,updatedAt FROM users;
        DROP TABLE users;
        ALTER TABLE users_role_upgrade RENAME TO users;
        COMMIT;
      `);
    } catch (error) {
      if (db.inTransaction) db.exec("ROLLBACK;");
      throw error;
    } finally {
      db.pragma("foreign_keys = ON");
    }
  }

  /* =======================================================
     clinics / users 基礎 Migration
  ======================================================= */

  const multiClinicFoundationMigrationKey =
    "2026-multi-clinic-foundation-v1";

  if (
    !hasMigration(
      db,
      multiClinicFoundationMigrationKey,
    )
  ) {
    const migrate =
      db.transaction(
        () => {
          db
            .prepare(`
              INSERT OR IGNORE
              INTO clinics (
                code,
                name,
                phone,
                address,
                note,
                isActive
              )
              VALUES (
                'MAIN',
                '預設院所',
                '',
                '',
                '由既有 DentFlow 資料自動建立',
                1
              )
            `)
            .run();

          markMigration(
            db,
            multiClinicFoundationMigrationKey,
          );
        },
      );

    migrate();

    console.log(
      "DentFlow migration: multi-clinic foundation initialized",
    );
  }

  /* =======================================================
     inventory Migration
  ======================================================= */

  ensureColumn(
    db,
    "inventory",
    "refNumber",
    `
      ALTER TABLE inventory
      ADD COLUMN refNumber TEXT
      NOT NULL DEFAULT '';
    `,
  );

  ensureColumn(
    db,
    "inventory",
    "clinicId",
    `
      ALTER TABLE inventory
      ADD COLUMN clinicId INTEGER
      REFERENCES clinics(id);
    `,
  );

  ensureColumn(
    db,
    "inventory",
    "unitCost",
    `
      ALTER TABLE inventory
      ADD COLUMN unitCost REAL
      NOT NULL DEFAULT 0;
    `,
  );

  /* =======================================================
     patients Migration
  ======================================================= */

  ensureColumn(
    db,
    "patients",
    "clinicId",
    `
      ALTER TABLE patients
      ADD COLUMN clinicId INTEGER
      REFERENCES clinics(id);
    `,
  );

  /* =======================================================
     doctors Migration
  ======================================================= */

  ensureColumn(
    db,
    "doctors",
    "clinicId",
    `
      ALTER TABLE doctors
      ADD COLUMN clinicId INTEGER
      REFERENCES clinics(id);
    `,
  );

  ensureColumn(
    db,
    "doctors",
    "userId",
    `
      ALTER TABLE doctors
      ADD COLUMN userId INTEGER
      REFERENCES users(id);
    `,
  );

  /* =======================================================
     implants Migration
  ======================================================= */

  ensureColumn(
    db,
    "implants",
    "clinicId",
    `
      ALTER TABLE implants
      ADD COLUMN clinicId INTEGER
      REFERENCES clinics(id);
    `,
  );

  for (const [columnName, sql] of [
    ["orderedAt", "ALTER TABLE implants ADD COLUMN orderedAt TEXT;"],
    ["pickedAt", "ALTER TABLE implants ADD COLUMN pickedAt TEXT;"],
    ["surgeryCompletedAt", "ALTER TABLE implants ADD COLUMN surgeryCompletedAt TEXT;"],
    ["returnedAt", "ALTER TABLE implants ADD COLUMN returnedAt TEXT;"],
    ["closedAt", "ALTER TABLE implants ADD COLUMN closedAt TEXT;"],
    ["cancelledAt", "ALTER TABLE implants ADD COLUMN cancelledAt TEXT;"],
    ["cancelReason", "ALTER TABLE implants ADD COLUMN cancelReason TEXT NOT NULL DEFAULT '';"],
    ["orderedByUserId", "ALTER TABLE implants ADD COLUMN orderedByUserId INTEGER REFERENCES users(id);"],
    ["pickedByUserId", "ALTER TABLE implants ADD COLUMN pickedByUserId INTEGER REFERENCES users(id);"],
    ["surgeryCompletedByUserId", "ALTER TABLE implants ADD COLUMN surgeryCompletedByUserId INTEGER REFERENCES users(id);"],
    ["returnedByUserId", "ALTER TABLE implants ADD COLUMN returnedByUserId INTEGER REFERENCES users(id);"],
    ["closedByUserId", "ALTER TABLE implants ADD COLUMN closedByUserId INTEGER REFERENCES users(id);"],
    ["cancelledByUserId", "ALTER TABLE implants ADD COLUMN cancelledByUserId INTEGER REFERENCES users(id);"],
    ["doctorSignedAt", "ALTER TABLE implants ADD COLUMN doctorSignedAt TEXT;"],
    ["doctorSignature", "ALTER TABLE implants ADD COLUMN doctorSignature TEXT NOT NULL DEFAULT '';"],
    ["doctorSignedByUserId", "ALTER TABLE implants ADD COLUMN doctorSignedByUserId INTEGER REFERENCES users(id);"],
    ["createdByUserId", "ALTER TABLE implants ADD COLUMN createdByUserId INTEGER REFERENCES users(id);"],
  ] as const) {
    ensureColumn(db, "implants", columnName, sql);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS implantReservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      implantId INTEGER NOT NULL,
      implantPlanItemId INTEGER NOT NULL,
      reservedQuantity INTEGER NOT NULL DEFAULT 0,
      pickedQuantity INTEGER NOT NULL DEFAULT 0,
      usedQuantity INTEGER NOT NULL DEFAULT 0,
      returnedQuantity INTEGER NOT NULL DEFAULT 0,
      reservedAt TEXT,
      pickedAt TEXT,
      pickedByUserId INTEGER REFERENCES users(id),
      returnedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (implantId) REFERENCES implants(id) ON DELETE CASCADE,
      FOREIGN KEY (implantPlanItemId) REFERENCES implantPlanItems(id) ON DELETE CASCADE,
      UNIQUE (implantPlanItemId),
      CHECK (reservedQuantity >= 0),
      CHECK (pickedQuantity >= 0),
      CHECK (usedQuantity >= 0),
      CHECK (returnedQuantity >= 0)
    );

    CREATE INDEX IF NOT EXISTS idx_implantReservations_implantId
      ON implantReservations(implantId);
  `);

  ensureColumn(
    db,
    "implantReservations",
    "pickedByUserId",
    `
      ALTER TABLE implantReservations
      ADD COLUMN pickedByUserId INTEGER
      REFERENCES users(id);
    `,
  );

  ensureColumn(
    db,
    "implantPlanItems",
    "instrumentPhotoDataUrl",
    `
      ALTER TABLE implantPlanItems
      ADD COLUMN instrumentPhotoDataUrl TEXT
      NOT NULL DEFAULT '';
    `,
  );

  ensureColumn(
    db,
    "implants",
    "status",
    `
      ALTER TABLE implants
      ADD COLUMN status TEXT
      NOT NULL DEFAULT '待醫師叫貨';
    `,
  );

  ensureColumn(
    db,
    "implants",
    "inventoryItemId",
    `
      ALTER TABLE implants
      ADD COLUMN inventoryItemId INTEGER;
    `,
  );

  ensureColumn(
    db,
    "implants",
    "inventoryDeducted",
    `
      ALTER TABLE implants
      ADD COLUMN inventoryDeducted INTEGER
      NOT NULL DEFAULT 0;
    `,
  );

  ensureColumn(
    db,
    "implants",
    "inventoryReturned",
    `
      ALTER TABLE implants
      ADD COLUMN inventoryReturned INTEGER
      NOT NULL DEFAULT 0;
    `,
  );

  /* =======================================================
     implantItems Migration
  ======================================================= */

  ensureColumn(
    db,
    "implantItems",
    "usedQuantity",
    `
      ALTER TABLE implantItems
      ADD COLUMN usedQuantity INTEGER
      NOT NULL DEFAULT 0;
    `,
  );

  /* =======================================================
     inventoryTransactions Migration
  ======================================================= */

  ensureColumn(
    db,
    "inventoryTransactions",
    "clinicId",
    `
      ALTER TABLE inventoryTransactions
      ADD COLUMN clinicId INTEGER
      REFERENCES clinics(id);
    `,
  );

  ensureColumn(
    db,
    "inventoryTransactions",
    "implantToothId",
    `
      ALTER TABLE inventoryTransactions
      ADD COLUMN implantToothId INTEGER;
    `,
  );

  ensureColumn(
    db,
    "inventoryTransactions",
    "implantItemId",
    `
      ALTER TABLE inventoryTransactions
      ADD COLUMN implantItemId INTEGER;
    `,
  );

  ensureColumn(
    db,
    "inventoryTransactions",
    "implantPlanItemId",
    `
      ALTER TABLE inventoryTransactions
      ADD COLUMN implantPlanItemId INTEGER;
    `,
  );

  ensureColumn(
    db,
    "inventoryTransactions",
    "implantUsageItemId",
    `
      ALTER TABLE inventoryTransactions
      ADD COLUMN implantUsageItemId INTEGER;
    `,
  );

  ensureColumn(
    db,
    "inventoryTransactions",
    "unitCost",
    `
      ALTER TABLE inventoryTransactions
      ADD COLUMN unitCost REAL
      NOT NULL DEFAULT 0;
    `,
  );

  ensureColumn(
    db,
    "inventoryTransactions",
    "totalCost",
    `
      ALTER TABLE inventoryTransactions
      ADD COLUMN totalCost REAL
      NOT NULL DEFAULT 0;
    `,
  );

  /* =======================================================
     Migration：
     現有資料歸到預設院所
  ======================================================= */

  const defaultClinicDataMigrationKey =
    "2026-default-clinic-data-v1";

  if (
    !hasMigration(
      db,
      defaultClinicDataMigrationKey,
    )
  ) {
    const migrate =
      db.transaction(
        () => {
          const defaultClinic =
            getDefaultClinic(
              db,
            );

          db
            .prepare(`
              UPDATE patients

              SET clinicId = ?

              WHERE
                clinicId IS NULL
            `)
            .run(
              defaultClinic.id,
            );

          db
            .prepare(`
              UPDATE doctors

              SET clinicId = ?

              WHERE
                clinicId IS NULL
            `)
            .run(
              defaultClinic.id,
            );

          db
            .prepare(`
              UPDATE inventory

              SET clinicId = ?

              WHERE
                clinicId IS NULL
            `)
            .run(
              defaultClinic.id,
            );

          db
            .prepare(`
              UPDATE implants

              SET clinicId = (
                SELECT
                  patients.clinicId

                FROM patients

                WHERE
                  patients.id =
                    implants.patientId
              )

              WHERE
                clinicId IS NULL
            `)
            .run();

          db
            .prepare(`
              UPDATE implants

              SET clinicId = ?

              WHERE
                clinicId IS NULL
            `)
            .run(
              defaultClinic.id,
            );

          db
            .prepare(`
              UPDATE inventoryTransactions

              SET clinicId = (
                SELECT
                  inventory.clinicId

                FROM inventory

                WHERE
                  inventory.id =
                    inventoryTransactions.inventoryItemId
              )

              WHERE
                clinicId IS NULL
            `)
            .run();

          db
            .prepare(`
              UPDATE inventoryTransactions

              SET clinicId = ?

              WHERE
                clinicId IS NULL
            `)
            .run(
              defaultClinic.id,
            );

          markMigration(
            db,
            defaultClinicDataMigrationKey,
          );
        },
      );

    migrate();

    console.log(
      "DentFlow migration: existing data assigned to default clinic",
    );
  }

  /* =======================================================
     Migration：
     舊 doctors 登入資料 → users
  ======================================================= */

  const doctorUserMigrationKey =
    "2026-doctor-users-v1";

  if (
    !hasMigration(
      db,
      doctorUserMigrationKey,
    )
  ) {
    const migrate =
      db.transaction(
        () => {
          const doctors =
            db
              .prepare(`
                SELECT
                  id,
                  clinicId,
                  name,
                  account,
                  passwordHash,
                  phone,
                  isActive

                FROM doctors

                WHERE
                  TRIM(account) <> ''

                ORDER BY
                  id ASC
              `)
              .all() as Array<{
              id: number;

              clinicId:
                number | null;

              name: string;

              account: string;

              passwordHash: string;

              phone: string;

              isActive: number;
            }>;

          const insertUser =
            db.prepare(`
              INSERT OR IGNORE
              INTO users (
                name,
                account,
                passwordHash,
                role,
                phone,
                email,
                isActive
              )
              VALUES (
                ?,
                ?,
                ?,
                'Doctor',
                ?,
                '',
                ?
              )
            `);

          const getUserByAccount =
            db.prepare(`
              SELECT
                id

              FROM users

              WHERE
                account = ?
            `);

          const linkDoctor =
            db.prepare(`
              UPDATE doctors

              SET
                userId = ?,
                updatedAt = CURRENT_TIMESTAMP

              WHERE
                id = ?
            `);

          const grantClinic =
            db.prepare(`
              INSERT OR IGNORE
              INTO userClinics (
                userId,
                clinicId,
                isPrimary
              )
              VALUES (
                ?,
                ?,
                ?
              )
            `);

          for (
            const doctor of
            doctors
          ) {
            insertUser.run(
              doctor.name,

              doctor.account,

              doctor.passwordHash,

              doctor.phone,

              doctor.isActive ===
              1
                ? 1
                : 0,
            );

            const user =
              getUserByAccount.get(
                doctor.account,
              ) as
                | {
                    id: number;
                  }
                | undefined;

            if (!user) {
              continue;
            }

            linkDoctor.run(
              user.id,
              doctor.id,
            );

            if (
              doctor.clinicId !==
              null
            ) {
              const existingClinicCount =
                db
                  .prepare(`
                    SELECT
                      COUNT(*) AS count

                    FROM userClinics

                    WHERE
                      userId = ?
                  `)
                  .get(
                    user.id,
                  ) as {
                  count: number;
                };

              grantClinic.run(
                user.id,

                doctor.clinicId,

                existingClinicCount.count ===
                0
                  ? 1
                  : 0,
              );
            }
          }

          markMigration(
            db,
            doctorUserMigrationKey,
          );
        },
      );

    migrate();

    console.log(
      "DentFlow migration: doctors → users initialized",
    );
  }

  /* =======================================================
     Migration：
     doctors / userClinics
     → doctorClinics

     -------------------------------------------------------

     目的：

     同一位 Doctor 可以在多間院所執業。

     舊 doctors.clinicId：
     → 搬成 primary doctorClinic

     已存在的 userClinics：
     → 同步成 Doctor 可執業院所

     -------------------------------------------------------

     注意：

     doctors.clinicId 不刪除，
     先保留給舊版 Repository 相容使用。
  ======================================================= */

  const doctorClinicsMigrationKey =
    "2026-doctor-clinics-v1";

  if (
    !hasMigration(
      db,
      doctorClinicsMigrationKey,
    )
  ) {
    const migrate =
      db.transaction(
        () => {
          /*
           * 1.
           * 先把 doctors.clinicId
           * 搬成醫師主要院所。
           */
          db
            .prepare(`
              INSERT OR IGNORE
              INTO doctorClinics (
                doctorId,
                clinicId,
                isPrimary
              )

              SELECT
                doctors.id,
                doctors.clinicId,
                1

              FROM doctors

              INNER JOIN clinics
                ON clinics.id =
                   doctors.clinicId

              WHERE
                doctors.clinicId IS NOT NULL
            `)
            .run();

          /*
           * 2.
           * 如果 doctor 已經有 userId，
           * 將 userClinics 裡可登入的院所
           * 同步成可執業院所。
           *
           * 額外院所先設為非 primary，
           * 避免同一 Doctor 出現多個 primary。
           */
          db
            .prepare(`
              INSERT OR IGNORE
              INTO doctorClinics (
                doctorId,
                clinicId,
                isPrimary
              )

              SELECT
                doctors.id,
                userClinics.clinicId,
                0

              FROM doctors

              INNER JOIN userClinics
                ON userClinics.userId =
                   doctors.userId

              INNER JOIN clinics
                ON clinics.id =
                   userClinics.clinicId

              WHERE
                doctors.userId IS NOT NULL
            `)
            .run();

          /*
           * 3.
           * 如果某位醫師因舊資料特殊狀況
           * 沒有 primary，
           * 自動將第一間院所設為 primary。
           */
          const doctorsWithoutPrimary =
            db
              .prepare(`
                SELECT
                  doctors.id

                FROM doctors

                WHERE
                  EXISTS (
                    SELECT
                      1

                    FROM doctorClinics

                    WHERE
                      doctorClinics.doctorId =
                        doctors.id
                  )

                  AND NOT EXISTS (
                    SELECT
                      1

                    FROM doctorClinics

                    WHERE
                      doctorClinics.doctorId =
                        doctors.id

                      AND doctorClinics.isPrimary =
                        1
                  )

                ORDER BY
                  doctors.id ASC
              `)
              .all() as Array<{
              id: number;
            }>;

          const setFirstClinicPrimary =
            db.prepare(`
              UPDATE doctorClinics

              SET
                isPrimary = 1,
                updatedAt =
                  CURRENT_TIMESTAMP

              WHERE
                id = (
                  SELECT
                    id

                  FROM doctorClinics

                  WHERE
                    doctorId = ?

                  ORDER BY
                    clinicId ASC,
                    id ASC

                  LIMIT 1
                )
            `);

          for (
            const doctor of
            doctorsWithoutPrimary
          ) {
            setFirstClinicPrimary.run(
              doctor.id,
            );
          }

          /*
           * 4.
           * 同步 legacy doctors.clinicId
           * 到目前 primary doctorClinic。
           *
           * 暫時維持舊 Repository 相容。
           */
          db
            .prepare(`
              UPDATE doctors

              SET
                clinicId = (
                  SELECT
                    doctorClinics.clinicId

                  FROM doctorClinics

                  WHERE
                    doctorClinics.doctorId =
                      doctors.id

                    AND doctorClinics.isPrimary =
                      1

                  ORDER BY
                    doctorClinics.id ASC

                  LIMIT 1
                ),

                updatedAt =
                  CURRENT_TIMESTAMP

              WHERE
                EXISTS (
                  SELECT
                    1

                  FROM doctorClinics

                  WHERE
                    doctorClinics.doctorId =
                      doctors.id

                    AND doctorClinics.isPrimary =
                      1
                )
            `)
            .run();

          markMigration(
            db,
            doctorClinicsMigrationKey,
          );
        },
      );

    migrate();

    console.log(
      "DentFlow migration: doctorClinics initialized",
    );
  }

  /* =======================================================
     Migration 1

     舊單牙位 implants
     → implantTeeth + implantItems
  ======================================================= */

  const legacyMultiToothMigrationKey =
    "2026-implant-multi-tooth-v1";

  if (
    !hasMigration(
      db,
      legacyMultiToothMigrationKey,
    )
  ) {
    const migrate =
      db.transaction(
        () => {
          const legacyImplants =
            db
              .prepare(`
                SELECT
                  id,
                  toothPosition,
                  inventoryItemId,
                  inventoryDeducted,
                  inventoryReturned

                FROM implants

                ORDER BY
                  id ASC
              `)
              .all() as Array<{
              id: number;

              toothPosition:
                string;

              inventoryItemId:
                number | null;

              inventoryDeducted:
                number;

              inventoryReturned:
                number;
            }>;

          const insertTooth =
            db.prepare(`
              INSERT OR IGNORE
              INTO implantTeeth (
                implantId,
                toothPosition
              )
              VALUES (
                ?,
                ?
              )
            `);

          const getTooth =
            db.prepare(`
              SELECT
                id

              FROM implantTeeth

              WHERE
                implantId = ?

                AND toothPosition = ?
            `);

          const insertItem =
            db.prepare(`
              INSERT OR IGNORE
              INTO implantItems (
                implantToothId,
                inventoryItemId,
                quantity,
                deductedQuantity,
                usedQuantity,
                returnedQuantity
              )
              VALUES (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?
              )
            `);

          for (
            const legacy of
            legacyImplants
          ) {
            if (
              !legacy.toothPosition
                .trim() &&
              legacy.inventoryItemId ===
                null
            ) {
              continue;
            }

            const toothPosition =
              legacy.toothPosition
                .trim() ||
              "未指定";

            insertTooth.run(
              legacy.id,
              toothPosition,
            );

            const tooth =
              getTooth.get(
                legacy.id,
                toothPosition,
              ) as
                | {
                    id: number;
                  }
                | undefined;

            if (
              !tooth ||
              legacy.inventoryItemId ===
                null
            ) {
              continue;
            }

            const deductedQuantity =
              legacy.inventoryDeducted ===
                1 ||
              legacy.inventoryReturned ===
                1
                ? 1
                : 0;

            const returnedQuantity =
              legacy.inventoryReturned ===
              1
                ? 1
                : 0;

            const usedQuantity =
              0;

            insertItem.run(
              tooth.id,

              legacy.inventoryItemId,

              1,

              deductedQuantity,

              usedQuantity,

              returnedQuantity,
            );
          }

          markMigration(
            db,
            legacyMultiToothMigrationKey,
          );
        },
      );

    migrate();

    console.log(
      "DentFlow migration: legacy implants → implantTeeth / implantItems",
    );
  }

  /* =======================================================
     Migration 2

     舊 inventoryTransactions
     補 implantToothId
  ======================================================= */

  const transactionToothMigrationKey =
    "2026-inventory-transaction-tooth-v1";

  if (
    !hasMigration(
      db,
      transactionToothMigrationKey,
    )
  ) {
    const migrate =
      db.transaction(
        () => {
          db
            .prepare(`
              UPDATE inventoryTransactions

              SET implantToothId = (
                SELECT
                  implantItems.implantToothId

                FROM implantItems

                WHERE
                  implantItems.id =
                    inventoryTransactions.implantItemId
              )

              WHERE
                implantItemId IS NOT NULL

                AND implantToothId IS NULL
            `)
            .run();

          db
            .prepare(`
              UPDATE inventoryTransactions

              SET
                implantItemId = (
                  SELECT
                    MIN(ii.id)

                  FROM implantItems ii

                  INNER JOIN implantTeeth it
                    ON it.id =
                       ii.implantToothId

                  WHERE
                    it.implantId =
                      inventoryTransactions.implantId

                    AND ii.inventoryItemId =
                      inventoryTransactions.inventoryItemId
                ),

                implantToothId = (
                  SELECT
                    MIN(ii.implantToothId)

                  FROM implantItems ii

                  INNER JOIN implantTeeth it
                    ON it.id =
                       ii.implantToothId

                  WHERE
                    it.implantId =
                      inventoryTransactions.implantId

                    AND ii.inventoryItemId =
                      inventoryTransactions.inventoryItemId
                )

              WHERE
                implantId IS NOT NULL

                AND implantItemId IS NULL

                AND (
                  SELECT
                    COUNT(*)

                  FROM implantItems ii

                  INNER JOIN implantTeeth it
                    ON it.id =
                       ii.implantToothId

                  WHERE
                    it.implantId =
                      inventoryTransactions.implantId

                    AND ii.inventoryItemId =
                      inventoryTransactions.inventoryItemId
                ) = 1
            `)
            .run();

          markMigration(
            db,
            transactionToothMigrationKey,
          );
        },
      );

    migrate();

    console.log(
      "DentFlow migration: inventory transaction tooth links initialized",
    );
  }

  /* =======================================================
     Migration 3

     舊 implantItems
     → implantPlanItems
  ======================================================= */

  const planMigrationKey =
    "2026-implant-plan-items-v1";

  if (
    !hasMigration(
      db,
      planMigrationKey,
    )
  ) {
    const migratePlans =
      db.transaction(
        () => {
          const legacyItems =
            db
              .prepare(`
                SELECT
                  ii.id
                    AS legacyImplantItemId,

                  ii.implantToothId,

                  ii.quantity,

                  ii.usedQuantity,

                  ii.inventoryItemId,

                  inventory.name,

                  inventory.category,

                  inventory.brand,

                  inventory.model,

                  inventory.specification

                FROM implantItems ii

                INNER JOIN inventory
                  ON inventory.id =
                     ii.inventoryItemId

                ORDER BY
                  ii.id ASC
              `)
              .all() as Array<{
              legacyImplantItemId:
                number;

              implantToothId:
                number;

              quantity:
                number;

              usedQuantity:
                number;

              inventoryItemId:
                number;

              name:
                string;

              category:
                string;

              brand:
                string;

              model:
                string;

              specification:
                string;
            }>;

          const insertPlan =
            db.prepare(`
              INSERT OR IGNORE
              INTO implantPlanItems (
                implantToothId,
                legacyImplantItemId,
                name,
                category,
                brand,
                model,
                specification,
                plannedQuantity,
                note
              )
              VALUES (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ''
              )
            `);

          const getPlan =
            db.prepare(`
              SELECT
                id

              FROM implantPlanItems

              WHERE
                legacyImplantItemId = ?
            `);

          const insertUsage =
            db.prepare(`
              INSERT INTO implantUsageItems (
                implantPlanItemId,
                inventoryItemId,
                quantity,
                note
              )
              VALUES (
                ?,
                ?,
                ?,
                ?
              )
            `);

          for (
            const legacy of
            legacyItems
          ) {
            insertPlan.run(
              legacy.implantToothId,

              legacy.legacyImplantItemId,

              legacy.name,

              legacy.category,

              legacy.brand,

              legacy.model,

              legacy.specification,

              Math.max(
                1,
                legacy.quantity,
              ),
            );

            const plan =
              getPlan.get(
                legacy.legacyImplantItemId,
              ) as
                | {
                    id: number;
                  }
                | undefined;

            if (!plan) {
              continue;
            }

            if (
              legacy.usedQuantity >
              0
            ) {
              insertUsage.run(
                plan.id,

                legacy.inventoryItemId,

                legacy.usedQuantity,

                "由舊版植體使用紀錄轉換",
              );
            }
          }

          markMigration(
            db,
            planMigrationKey,
          );
        },
      );

    migratePlans();

    console.log(
      "DentFlow migration: implantItems → implantPlanItems / implantUsageItems",
    );
  }

  /* =======================================================
     Migration 4

     舊 transaction
     → implantPlanItemId
  ======================================================= */

  const transactionPlanMigrationKey =
    "2026-inventory-transaction-plan-v1";

  if (
    !hasMigration(
      db,
      transactionPlanMigrationKey,
    )
  ) {
    const migrate =
      db.transaction(
        () => {
          db
            .prepare(`
              UPDATE inventoryTransactions

              SET implantPlanItemId = (
                SELECT
                  implantPlanItems.id

                FROM implantPlanItems

                WHERE
                  implantPlanItems.legacyImplantItemId =
                    inventoryTransactions.implantItemId
              )

              WHERE
                implantItemId IS NOT NULL

                AND implantPlanItemId IS NULL
            `)
            .run();

          markMigration(
            db,
            transactionPlanMigrationKey,
          );
        },
      );

    migrate();

    console.log(
      "DentFlow migration: transaction → implantPlanItem links initialized",
    );
  }

  /* =======================================================
     Migration：
     補強 transaction clinicId
  ======================================================= */

  const transactionClinicMigrationKey =
    "2026-inventory-transaction-clinic-v1";

  if (
    !hasMigration(
      db,
      transactionClinicMigrationKey,
    )
  ) {
    const migrate =
      db.transaction(
        () => {
          const defaultClinic =
            getDefaultClinic(
              db,
            );

          db
            .prepare(`
              UPDATE inventoryTransactions

              SET clinicId = (
                SELECT
                  inventory.clinicId

                FROM inventory

                WHERE
                  inventory.id =
                    inventoryTransactions.inventoryItemId
              )

              WHERE
                clinicId IS NULL
            `)
            .run();

          db
            .prepare(`
              UPDATE inventoryTransactions

              SET clinicId = ?

              WHERE
                clinicId IS NULL
            `)
            .run(
              defaultClinic.id,
            );

          markMigration(
            db,
            transactionClinicMigrationKey,
          );
        },
      );

    migrate();

    console.log(
      "DentFlow migration: inventory transaction clinic links initialized",
    );
  }

  /* =======================================================
     Index
  ======================================================= */

  db.exec(`
    /* =========================
       clinics
    ========================= */

    CREATE INDEX IF NOT EXISTS
      idx_clinics_name
      ON clinics(
        name
      );

    CREATE INDEX IF NOT EXISTS
      idx_clinics_isActive
      ON clinics(
        isActive
      );


    /* =========================
       users
    ========================= */

    CREATE INDEX IF NOT EXISTS
      idx_users_name
      ON users(
        name
      );

    CREATE INDEX IF NOT EXISTS
      idx_users_role
      ON users(
        role
      );

    CREATE INDEX IF NOT EXISTS
      idx_users_isActive
      ON users(
        isActive
      );


    /* =========================
       userClinics
    ========================= */

    CREATE INDEX IF NOT EXISTS
      idx_userClinics_userId
      ON userClinics(
        userId
      );

    CREATE INDEX IF NOT EXISTS
      idx_userClinics_clinicId
      ON userClinics(
        clinicId
      );

    CREATE INDEX IF NOT EXISTS
      idx_userClinics_primary
      ON userClinics(
        userId,
        isPrimary
      );


    /* =========================
       patients
    ========================= */

    CREATE INDEX IF NOT EXISTS
      idx_patients_clinicId
      ON patients(
        clinicId
      );

    CREATE INDEX IF NOT EXISTS
      idx_patients_clinic_name
      ON patients(
        clinicId,
        name
      );


    /* =========================
       doctors
    ========================= */

    CREATE INDEX IF NOT EXISTS
      idx_doctors_clinicId
      ON doctors(
        clinicId
      );

    CREATE INDEX IF NOT EXISTS
      idx_doctors_userId
      ON doctors(
        userId
      );

    CREATE INDEX IF NOT EXISTS
      idx_doctors_clinic_active
      ON doctors(
        clinicId,
        isActive
      );


    /* =========================
       doctorClinics
    ========================= */

    CREATE INDEX IF NOT EXISTS
      idx_doctorClinics_doctorId
      ON doctorClinics(
        doctorId
      );

    CREATE INDEX IF NOT EXISTS
      idx_doctorClinics_clinicId
      ON doctorClinics(
        clinicId
      );

    CREATE INDEX IF NOT EXISTS
      idx_doctorClinics_doctor_primary
      ON doctorClinics(
        doctorId,
        isPrimary
      );

    CREATE INDEX IF NOT EXISTS
      idx_doctorClinics_clinic_doctor
      ON doctorClinics(
        clinicId,
        doctorId
      );

    /*
     * SQLite partial unique index：
     *
     * 同一位醫師最多只能有一間 primary clinic。
     */
    CREATE UNIQUE INDEX IF NOT EXISTS
      idx_doctorClinics_one_primary
      ON doctorClinics(
        doctorId
      )
      WHERE
        isPrimary = 1;


    /* =========================
       implants
    ========================= */

    CREATE INDEX IF NOT EXISTS
      idx_implants_clinicId
      ON implants(
        clinicId
      );

    CREATE INDEX IF NOT EXISTS
      idx_implants_patientId
      ON implants(
        patientId
      );

    CREATE INDEX IF NOT EXISTS
      idx_implants_doctorId
      ON implants(
        doctorId
      );

    CREATE INDEX IF NOT EXISTS
      idx_implants_status
      ON implants(
        status
      );

    CREATE INDEX IF NOT EXISTS
      idx_implants_clinic_status
      ON implants(
        clinicId,
        status
      );

    CREATE INDEX IF NOT EXISTS
      idx_implants_clinic_date
      ON implants(
        clinicId,
        implantDate
      );

    /*
     * 多院所 Doctor 查詢：
     *
     * WHERE doctorId = ?
     *   AND clinicId IN (...)
     */
    CREATE INDEX IF NOT EXISTS
      idx_implants_doctor_clinic
      ON implants(
        doctorId,
        clinicId
      );


    /* =========================
       inventory
    ========================= */

    CREATE INDEX IF NOT EXISTS
      idx_inventory_clinicId
      ON inventory(
        clinicId
      );

    CREATE INDEX IF NOT EXISTS
      idx_inventory_category
      ON inventory(
        category
      );

    CREATE INDEX IF NOT EXISTS
      idx_inventory_brand
      ON inventory(
        brand
      );

    CREATE INDEX IF NOT EXISTS
      idx_inventory_model
      ON inventory(
        model
      );

    CREATE INDEX IF NOT EXISTS
      idx_inventory_specification
      ON inventory(
        specification
      );

    CREATE INDEX IF NOT EXISTS
      idx_inventory_refNumber
      ON inventory(
        refNumber
      );

    CREATE INDEX IF NOT EXISTS
      idx_inventory_lotNumber
      ON inventory(
        lotNumber
      );

    CREATE INDEX IF NOT EXISTS
      idx_inventory_clinic_ref
      ON inventory(
        clinicId,
        refNumber
      );

    CREATE INDEX IF NOT EXISTS
      idx_inventory_clinic_lot
      ON inventory(
        clinicId,
        lotNumber
      );

    CREATE INDEX IF NOT EXISTS
      idx_inventory_implant_match
      ON inventory(
        category,
        brand,
        model,
        specification
      );

    CREATE INDEX IF NOT EXISTS
      idx_inventory_clinic_implant_match
      ON inventory(
        clinicId,
        category,
        brand,
        model,
        specification
      );


    /* =========================
       implantTeeth
    ========================= */

    CREATE INDEX IF NOT EXISTS
      idx_implantTeeth_implantId
      ON implantTeeth(
        implantId
      );

    CREATE INDEX IF NOT EXISTS
      idx_implantTeeth_toothPosition
      ON implantTeeth(
        toothPosition
      );


    /* =========================
       legacy implantItems
    ========================= */

    CREATE INDEX IF NOT EXISTS
      idx_implantItems_implantToothId
      ON implantItems(
        implantToothId
      );

    CREATE INDEX IF NOT EXISTS
      idx_implantItems_inventoryItemId
      ON implantItems(
        inventoryItemId
      );


    /* =========================
       implantPlanItems
    ========================= */

    CREATE INDEX IF NOT EXISTS
      idx_implantPlanItems_implantToothId
      ON implantPlanItems(
        implantToothId
      );

    CREATE INDEX IF NOT EXISTS
      idx_implantPlanItems_category
      ON implantPlanItems(
        category
      );

    CREATE INDEX IF NOT EXISTS
      idx_implantPlanItems_spec
      ON implantPlanItems(
        category,
        brand,
        model,
        specification
      );

    CREATE INDEX IF NOT EXISTS
      idx_implantPlanItems_legacy
      ON implantPlanItems(
        legacyImplantItemId
      );


    /* =========================
       implantUsageItems
    ========================= */

    CREATE INDEX IF NOT EXISTS
      idx_implantUsageItems_planItemId
      ON implantUsageItems(
        implantPlanItemId
      );

    CREATE INDEX IF NOT EXISTS
      idx_implantUsageItems_inventoryItemId
      ON implantUsageItems(
        inventoryItemId
      );


    /* =========================
       inventoryTransactions
    ========================= */

    CREATE INDEX IF NOT EXISTS
      idx_inventoryTransactions_clinicId
      ON inventoryTransactions(
        clinicId
      );

    CREATE INDEX IF NOT EXISTS
      idx_inventoryTransactions_inventoryItemId
      ON inventoryTransactions(
        inventoryItemId
      );

    CREATE INDEX IF NOT EXISTS
      idx_inventoryTransactions_implantId
      ON inventoryTransactions(
        implantId
      );

    CREATE INDEX IF NOT EXISTS
      idx_inventoryTransactions_implantToothId
      ON inventoryTransactions(
        implantToothId
      );

    CREATE INDEX IF NOT EXISTS
      idx_inventoryTransactions_implantItemId
      ON inventoryTransactions(
        implantItemId
      );

    CREATE INDEX IF NOT EXISTS
      idx_inventoryTransactions_implantPlanItemId
      ON inventoryTransactions(
        implantPlanItemId
      );

    CREATE INDEX IF NOT EXISTS
      idx_inventoryTransactions_implantUsageItemId
      ON inventoryTransactions(
        implantUsageItemId
      );

    CREATE INDEX IF NOT EXISTS
      idx_inventoryTransactions_createdAt
      ON inventoryTransactions(
        createdAt
      );

    CREATE INDEX IF NOT EXISTS
      idx_inventoryTransactions_clinic_createdAt
      ON inventoryTransactions(
        clinicId,
        createdAt
      );
  `);

  /* =======================================================
     完成
  ======================================================= */

  console.log(
    "DentFlow database:",
    databasePath,
  );

  return db;
}

/* =========================================================
   取得預設院所
========================================================= */

function getDefaultClinic(
  db: Database.Database,
): ClinicRow {
  let clinic =
    db
      .prepare(`
        SELECT
          id,
          code,
          name

        FROM clinics

        WHERE
          code = 'MAIN'
      `)
      .get() as
      | ClinicRow
      | undefined;

  if (clinic) {
    return clinic;
  }

  db
    .prepare(`
      INSERT INTO clinics (
        code,
        name,
        phone,
        address,
        note,
        isActive
      )
      VALUES (
        'MAIN',
        '預設院所',
        '',
        '',
        '由 DentFlow 自動建立',
        1
      )
    `)
    .run();

  clinic =
    db
      .prepare(`
        SELECT
          id,
          code,
          name

        FROM clinics

        WHERE
          code = 'MAIN'
      `)
      .get() as
      | ClinicRow
      | undefined;

  if (!clinic) {
    throw new Error(
      "無法建立 DentFlow 預設院所",
    );
  }

  return clinic;
}

/* =========================================================
   確保欄位存在
========================================================= */

function ensureColumn(
  db: Database.Database,
  tableName: string,
  columnName: string,
  alterSql: string,
) {
  const columns =
    db
      .prepare(
        `PRAGMA table_info(${tableName})`,
      )
      .all() as
      TableColumnInfo[];

  const exists =
    columns.some(
      (
        column,
      ) =>
        column.name ===
        columnName,
    );

  if (exists) {
    return;
  }

  db.exec(
    alterSql,
  );

  console.log(
    `DentFlow migration: ${tableName}.${columnName} added`,
  );
}

/* =========================================================
   是否已執行 Migration
========================================================= */

function hasMigration(
  db: Database.Database,
  key: string,
): boolean {
  const record =
    db
      .prepare(`
        SELECT
          key

        FROM schemaMigrations

        WHERE
          key = ?
      `)
      .get(
        key,
      );

  return Boolean(
    record,
  );
}

/* =========================================================
   Migration 完成
========================================================= */

function markMigration(
  db: Database.Database,
  key: string,
) {
  db
    .prepare(`
      INSERT OR IGNORE
      INTO schemaMigrations (
        key
      )
      VALUES (?)
    `)
    .run(
      key,
    );
}

/* =========================================================
   取得 Database
========================================================= */

export function getDatabase():
  Database.Database {
  if (!database) {
    throw new Error(
      "資料庫尚未初始化",
    );
  }

  return database;
}

const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "care_center.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS elders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      gender TEXT NOT NULL CHECK(gender IN ('男', '女')),
      id_card TEXT UNIQUE NOT NULL,
      age INTEGER NOT NULL,
      health_status TEXT,
      self_care_level TEXT NOT NULL CHECK(self_care_level IN ('自理', '半失能', '失能')),
      status TEXT NOT NULL DEFAULT '待审核' CHECK(status IN ('待审核', '在住', '外出就医', '已复核', '已转出')),
      bed_id INTEGER,
      check_in_date TEXT,
      transfer_reason TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (bed_id) REFERENCES beds(id)
    );

    CREATE TABLE IF NOT EXISTS beds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_number TEXT NOT NULL,
      bed_number TEXT NOT NULL,
      floor INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT '空闲' CHECK(status IN ('空闲', '已分配', '维修中')),
      self_care_level TEXT CHECK(self_care_level IN ('自理', '半失能', '失能')),
      UNIQUE(room_number, bed_number)
    );

    CREATE TABLE IF NOT EXISTS caregivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      gender TEXT NOT NULL CHECK(gender IN ('男', '女')),
      phone TEXT NOT NULL,
      employee_id TEXT UNIQUE NOT NULL,
      care_level TEXT NOT NULL CHECK(care_level IN ('自理', '半失能', '失能')),
      shift TEXT NOT NULL CHECK(shift IN ('早班', '中班', '晚班')),
      status TEXT NOT NULL DEFAULT '在岗' CHECK(status IN ('在岗', '休假', '离职')),
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS caregiver_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      caregiver_id INTEGER NOT NULL,
      elder_id INTEGER NOT NULL,
      assigned_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (caregiver_id) REFERENCES caregivers(id),
      FOREIGN KEY (elder_id) REFERENCES elders(id),
      UNIQUE(caregiver_id, elder_id)
    );

    CREATE TABLE IF NOT EXISTS care_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      elder_id INTEGER NOT NULL,
      caregiver_id INTEGER NOT NULL,
      shift TEXT NOT NULL CHECK(shift IN ('早班', '中班', '晚班')),
      daily_life TEXT,
      medication TEXT,
      diet TEXT,
      physical_condition TEXT,
      is_abnormal INTEGER DEFAULT 0,
      abnormal_description TEXT,
      reported_to TEXT,
      record_date TEXT DEFAULT (date('now', 'localtime')),
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (elder_id) REFERENCES elders(id),
      FOREIGN KEY (caregiver_id) REFERENCES caregivers(id)
    );

    CREATE TABLE IF NOT EXISTS qualification_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      elder_id INTEGER NOT NULL,
      review_date TEXT DEFAULT (date('now', 'localtime')),
      reviewer TEXT NOT NULL,
      result TEXT NOT NULL CHECK(result IN ('符合', '不符合')),
      notes TEXT,
      next_review_date TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (elder_id) REFERENCES elders(id)
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      caregiver_id INTEGER NOT NULL,
      shift_date TEXT NOT NULL,
      shift TEXT NOT NULL CHECK(shift IN ('早班', '中班', '晚班')),
      status TEXT NOT NULL DEFAULT '正常' CHECK(status IN ('正常', '请假', '调休', '替班')),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (caregiver_id) REFERENCES caregivers(id),
      UNIQUE(caregiver_id, shift_date, shift)
    );

    CREATE TABLE IF NOT EXISTS shift_handovers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_date TEXT NOT NULL,
      shift TEXT NOT NULL CHECK(shift IN ('早班', '中班', '晚班')),
      outgoing_caregiver_id INTEGER NOT NULL,
      incoming_caregiver_id INTEGER,
      status TEXT NOT NULL DEFAULT '待交接' CHECK(status IN ('待交接', '已交接', '已签收', '异常', '无人接班')),
      handover_time TEXT,
      confirm_time TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (outgoing_caregiver_id) REFERENCES caregivers(id),
      FOREIGN KEY (incoming_caregiver_id) REFERENCES caregivers(id)
    );

    CREATE TABLE IF NOT EXISTS handover_elder_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      handover_id INTEGER NOT NULL,
      elder_id INTEGER NOT NULL,
      care_record_id INTEGER,
      medication_summary TEXT,
      physical_condition TEXT,
      has_abnormal INTEGER DEFAULT 0,
      abnormal_description TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (handover_id) REFERENCES shift_handovers(id),
      FOREIGN KEY (elder_id) REFERENCES elders(id),
      FOREIGN KEY (care_record_id) REFERENCES care_records(id)
    );

    CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      elder_id INTEGER NOT NULL,
      meal_date TEXT NOT NULL,
      meal_shift TEXT NOT NULL CHECK(meal_shift IN ('早餐', '午餐', '晚餐')),
      diet_type TEXT NOT NULL CHECK(diet_type IN ('普食', '软食', '糖尿病餐', '低盐餐', '低脂餐', '流质饮食', '鼻饲饮食')),
      dietary_restrictions TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (elder_id) REFERENCES elders(id),
      UNIQUE(elder_id, meal_date, meal_shift)
    );
  `);

  console.log("数据库初始化完成");
}

module.exports = { db, initDatabase };

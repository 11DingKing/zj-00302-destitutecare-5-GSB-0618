const { db, initDatabase } = require("../database");

function isDatabaseEmpty() {
  const elderCount = db.prepare("SELECT COUNT(*) as cnt FROM elders").get().cnt;
  const bedCount = db.prepare("SELECT COUNT(*) as cnt FROM beds").get().cnt;
  const caregiverCount = db
    .prepare("SELECT COUNT(*) as cnt FROM caregivers")
    .get().cnt;
  return elderCount === 0 && bedCount === 0 && caregiverCount === 0;
}

function clearAll() {
  const tables = [
    "handover_elder_items",
    "shift_handovers",
    "schedules",
    "care_records",
    "qualification_reviews",
    "caregiver_assignments",
    "meals",
    "elders",
    "caregivers",
    "beds",
  ];
  tables.forEach((table) => db.prepare(`DELETE FROM ${table}`).run());
  db.prepare(
    "DELETE FROM sqlite_sequence WHERE name IN ('elders','beds','caregivers','caregiver_assignments','care_records','qualification_reviews','schedules','shift_handovers','handover_elder_items','meals')",
  ).run();
  console.log("已清空所有数据");
}

function seedBeds() {
  const beds = [
    { room: "101", bed: "1", floor: 1, level: "自理" },
    { room: "101", bed: "2", floor: 1, level: "自理" },
    { room: "102", bed: "1", floor: 1, level: "自理" },
    { room: "102", bed: "2", floor: 1, level: "自理" },
    { room: "103", bed: "1", floor: 1, level: "自理" },
    { room: "201", bed: "1", floor: 2, level: "半失能" },
    { room: "201", bed: "2", floor: 2, level: "半失能" },
    { room: "202", bed: "1", floor: 2, level: "半失能" },
    { room: "202", bed: "2", floor: 2, level: "半失能" },
    { room: "301", bed: "1", floor: 3, level: "失能" },
    { room: "301", bed: "2", floor: 3, level: "失能" },
    { room: "302", bed: "1", floor: 3, level: "失能" },
    { room: "302", bed: "2", floor: 3, level: "失能" },
    { room: "303", bed: "1", floor: 3, level: "失能" },
  ];

  const stmt = db.prepare(
    "INSERT INTO beds (room_number, bed_number, floor, self_care_level, status) VALUES (?, ?, ?, ?, ?)",
  );
  beds.forEach((b) => stmt.run(b.room, b.bed, b.floor, b.level, "空闲"));
  console.log(`已创建 ${beds.length} 个床位`);
}

function seedCaregivers() {
  const caregivers = [
    {
      name: "王秀兰",
      gender: "女",
      phone: "13800000001",
      empId: "CG001",
      level: "自理",
      shift: "早班",
    },
    {
      name: "张桂芳",
      gender: "女",
      phone: "13800000002",
      empId: "CG002",
      level: "自理",
      shift: "中班",
    },
    {
      name: "李秀英",
      gender: "女",
      phone: "13800000003",
      empId: "CG003",
      level: "自理",
      shift: "晚班",
    },
    {
      name: "刘淑珍",
      gender: "女",
      phone: "13800000004",
      empId: "CG004",
      level: "半失能",
      shift: "早班",
    },
    {
      name: "陈玉兰",
      gender: "女",
      phone: "13800000005",
      empId: "CG005",
      level: "半失能",
      shift: "中班",
    },
    {
      name: "杨美玲",
      gender: "女",
      phone: "13800000006",
      empId: "CG006",
      level: "半失能",
      shift: "晚班",
    },
    {
      name: "赵晓燕",
      gender: "女",
      phone: "13800000007",
      empId: "CG007",
      level: "失能",
      shift: "早班",
    },
    {
      name: "孙丽娟",
      gender: "女",
      phone: "13800000008",
      empId: "CG008",
      level: "失能",
      shift: "中班",
    },
    {
      name: "周玉梅",
      gender: "女",
      phone: "13800000009",
      empId: "CG009",
      level: "失能",
      shift: "晚班",
    },
    {
      name: "吴凤英",
      gender: "女",
      phone: "13800000010",
      empId: "CG010",
      level: "失能",
      shift: "早班",
    },
  ];

  const stmt = db.prepare(
    "INSERT INTO caregivers (name, gender, phone, employee_id, care_level, shift) VALUES (?, ?, ?, ?, ?, ?)",
  );
  caregivers.forEach((c) =>
    stmt.run(c.name, c.gender, c.phone, c.empId, c.level, c.shift),
  );
  console.log(`已创建 ${caregivers.length} 名护理人员`);
}

function seedElders() {
  const elders = [
    {
      name: "陈德顺",
      gender: "男",
      idCard: "330102193501011234",
      age: 89,
      health: "高血压，日常服药控制",
      level: "自理",
      status: "在住",
      room: "101",
      bed: "1",
      caregivers: ["CG001"],
      checkInDate: "2024-03-15",
    },
    {
      name: "王福根",
      gender: "男",
      idCard: "330102193805122345",
      age: 86,
      health: "身体康健，无慢性病",
      level: "自理",
      status: "在住",
      room: "101",
      bed: "2",
      caregivers: ["CG001", "CG002"],
      checkInDate: "2024-06-20",
    },
    {
      name: "沈阿妹",
      gender: "女",
      idCard: "330102194008153456",
      age: 84,
      health: "轻度骨质疏松",
      level: "自理",
      status: "在住",
      room: "102",
      bed: "1",
      caregivers: ["CG002"],
      checkInDate: "2025-01-10",
    },
    {
      name: "张桂花",
      gender: "女",
      idCard: "330102193711204567",
      age: 87,
      health: "糖尿病、高血压，需协助用药",
      level: "半失能",
      status: "在住",
      room: "201",
      bed: "1",
      caregivers: ["CG004", "CG005"],
      checkInDate: "2024-09-05",
    },
    {
      name: "李金生",
      gender: "男",
      idCard: "330102193304185678",
      age: 91,
      health: "脑梗后遗症，左侧肢体行动不便",
      level: "半失能",
      status: "在住",
      room: "201",
      bed: "2",
      caregivers: ["CG004", "CG006"],
      checkInDate: "2024-07-22",
    },
    {
      name: "蒋招娣",
      gender: "女",
      idCard: "330102194202256789",
      age: 82,
      health: "关节炎，行走需助行器，洗浴需协助",
      level: "半失能",
      status: "在住",
      room: "202",
      bed: "1",
      caregivers: ["CG005"],
      checkInDate: "2025-03-08",
    },
    {
      name: "郑阿公",
      gender: "男",
      idCard: "330102193009307890",
      age: 94,
      health: "阿尔茨海默症中期，完全依赖照护",
      level: "失能",
      status: "在住",
      room: "301",
      bed: "1",
      caregivers: ["CG007", "CG008", "CG009"],
      checkInDate: "2023-11-12",
    },
    {
      name: "林美云",
      gender: "女",
      idCard: "330102193603178901",
      age: 88,
      health: "中风后瘫痪卧床，鼻饲进食",
      level: "失能",
      status: "在住",
      room: "301",
      bed: "2",
      caregivers: ["CG007", "CG008", "CG010"],
      checkInDate: "2024-02-28",
    },
    {
      name: "黄炳荣",
      gender: "男",
      idCard: "330102192906059012",
      age: 95,
      health: "多种慢性病，卧床不起，需24小时监护",
      level: "失能",
      status: "在住",
      room: "302",
      bed: "1",
      caregivers: ["CG007", "CG009", "CG010"],
      checkInDate: "2023-08-15",
    },
    {
      name: "许奶奶",
      gender: "女",
      idCard: "330102193212120123",
      age: 92,
      health: "帕金森晚期，完全失能",
      level: "失能",
      status: "外出就医",
      room: "302",
      bed: "2",
      caregivers: ["CG008", "CG009", "CG010"],
      checkInDate: "2024-04-30",
    },
    {
      name: "待审核老人1",
      gender: "男",
      idCard: "330102194501011111",
      age: 80,
      health: "基础健康状况待评估",
      level: "半失能",
      status: "待审核",
      room: null,
      bed: null,
      caregivers: [],
      checkInDate: null,
    },
  ];

  const tx = db.transaction(() => {
    elders.forEach((elder) => {
      let bedId = null;
      if (elder.room && elder.bed) {
        const bed = db
          .prepare(
            "SELECT * FROM beds WHERE room_number = ? AND bed_number = ?",
          )
          .get(elder.room, elder.bed);
        if (bed) {
          bedId = bed.id;
          db.prepare("UPDATE beds SET status = '已分配' WHERE id = ?").run(
            bedId,
          );
        }
      }

      const elderResult = db
        .prepare(
          `
        INSERT INTO elders (name, gender, id_card, age, health_status, self_care_level, status, bed_id, check_in_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          elder.name,
          elder.gender,
          elder.idCard,
          elder.age,
          elder.health,
          elder.level,
          elder.status,
          bedId,
          elder.checkInDate,
        );

      const elderId = elderResult.lastInsertRowid;

      if (elder.caregivers && elder.caregivers.length > 0) {
        elder.caregivers.forEach((empId) => {
          const cg = db
            .prepare("SELECT * FROM caregivers WHERE employee_id = ?")
            .get(empId);
          if (cg) {
            db.prepare(
              "INSERT INTO caregiver_assignments (caregiver_id, elder_id) VALUES (?, ?)",
            ).run(cg.id, elderId);
          }
        });
      }
    });
  });

  tx();
  console.log(`已创建 ${elders.length} 位老人档案`);
}

function seedReviews() {
  const elders = db
    .prepare("SELECT * FROM elders WHERE status IN ('在住', '已复核')")
    .all();
  const reviewer = "李主任";
  const today = new Date();

  const tx = db.transaction(() => {
    elders.forEach((elder, idx) => {
      if (idx % 3 !== 0) {
        const reviewDate = new Date(today);
        reviewDate.setMonth(
          reviewDate.getMonth() - Math.floor(Math.random() * 6) - 1,
        );
        const nextDate = new Date(reviewDate);
        nextDate.setMonth(nextDate.getMonth() + 6);

        db.prepare(
          `
          INSERT INTO qualification_reviews (elder_id, review_date, reviewer, result, notes, next_review_date)
          VALUES (?, ?, ?, '符合', '资格复核通过，符合特困供养条件', ?)
        `,
        ).run(
          elder.id,
          reviewDate.toISOString().split("T")[0],
          reviewer,
          nextDate.toISOString().split("T")[0],
        );

        if (idx % 2 === 0) {
          db.prepare("UPDATE elders SET status = '已复核' WHERE id = ?").run(
            elder.id,
          );
        }
      }
    });
  });

  tx();
  console.log("已创建资格复核记录");
}

function seedSchedules() {
  const caregivers = db
    .prepare("SELECT * FROM caregivers WHERE status = '在岗'")
    .all();
  const today = new Date();
  const schedules = [];

  for (let day = 0; day < 7; day++) {
    const date = new Date(today);
    date.setDate(date.getDate() - day + 1);
    const dateStr = date.toISOString().split("T")[0];

    caregivers.forEach((cg) => {
      const dayOfWeek = date.getDay();
      let hasSchedule = true;
      let status = "正常";

      if (dayOfWeek === 0 && cg.id % 3 === 0) {
        hasSchedule = false;
      }
      if (day === 3 && cg.id === 5) {
        status = "请假";
      }

      if (hasSchedule) {
        schedules.push({
          caregiver_id: cg.id,
          shift_date: dateStr,
          shift: cg.shift,
          status,
        });
      }
    });
  }

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO schedules (caregiver_id, shift_date, shift, status)
    VALUES (?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    schedules.forEach((s) =>
      stmt.run(s.caregiver_id, s.shift_date, s.shift, s.status),
    );
  });

  tx();
  console.log(`已创建 ${schedules.length} 条排班记录`);
}

function seedHandovers() {
  const today = new Date();
  const handovers = [];
  const items = [];

  for (let day = 1; day <= 2; day++) {
    const date = new Date(today);
    date.setDate(date.getDate() - day);
    const dateStr = date.toISOString().split("T")[0];

    const shifts = ["早班", "中班", "晚班"];
    shifts.forEach((shift, shiftIdx) => {
      const outgoingCg = db
        .prepare(
          `
        SELECT c.* FROM caregivers c
        JOIN schedules s ON c.id = s.caregiver_id
        WHERE s.shift_date = ? AND s.shift = ? AND s.status = '正常'
        LIMIT 1
      `,
        )
        .get(dateStr, shift);

      if (!outgoingCg) return;

      const nextShift = shifts[(shiftIdx + 1) % 3];
      const nextDate =
        shift === "晚班"
          ? (() => {
              const d = new Date(date);
              d.setDate(d.getDate() + 1);
              return d.toISOString().split("T")[0];
            })()
          : dateStr;

      const incomingCg = db
        .prepare(
          `
        SELECT c.* FROM caregivers c
        JOIN schedules s ON c.id = s.caregiver_id
        WHERE s.shift_date = ? AND s.shift = ? AND s.status = '正常'
        LIMIT 1
      `,
        )
        .get(nextDate, nextShift);

      let status = "已签收";
      let handoverTime = null;
      let confirmTime = null;

      if (day === 1 && shiftIdx >= 1) {
        status = shiftIdx === 1 ? "已交接" : "待交接";
      }

      if (status !== "待交接") {
        handoverTime = `${dateStr} ${["14:00", "22:00", "06:00"][shiftIdx]}:00`;
      }
      if (status === "已签收") {
        confirmTime = handoverTime;
      }

      handovers.push({
        shift_date: dateStr,
        shift,
        outgoing_caregiver_id: outgoingCg.id,
        incoming_caregiver_id: incomingCg ? incomingCg.id : null,
        status,
        handover_time: handoverTime,
        confirm_time: confirmTime,
      });

      const handoverIdx = handovers.length - 1;

      const elders = db
        .prepare(
          `
        SELECT e.* FROM elders e
        JOIN caregiver_assignments ca ON e.id = ca.elder_id
        WHERE ca.caregiver_id = ? AND e.status != '已转出'
      `,
        )
        .all(outgoingCg.id);

      elders.forEach((elder) => {
        const careRecord = db
          .prepare(
            `
          SELECT * FROM care_records
          WHERE elder_id = ? AND caregiver_id = ? AND shift = ? AND record_date = ?
          LIMIT 1
        `,
          )
          .get(elder.id, outgoingCg.id, shift, dateStr);

        items.push({
          handover_idx: handoverIdx,
          elder_id: elder.id,
          care_record_id: careRecord ? careRecord.id : null,
          medication_summary: careRecord ? careRecord.medication : "无特殊用药",
          physical_condition: careRecord
            ? careRecord.physical_condition
            : "身体状况良好",
          has_abnormal: careRecord ? careRecord.is_abnormal : 0,
          abnormal_description: careRecord
            ? careRecord.abnormal_description
            : "",
          notes: careRecord ? "详见当班护理记录" : "",
        });
      });
    });
  }

  const handoverStmt = db.prepare(`
    INSERT INTO shift_handovers (shift_date, shift, outgoing_caregiver_id, incoming_caregiver_id, status, handover_time, confirm_time)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const itemStmt = db.prepare(`
    INSERT INTO handover_elder_items (handover_id, elder_id, care_record_id, medication_summary, physical_condition, has_abnormal, abnormal_description, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    handovers.forEach((h, idx) => {
      const result = handoverStmt.run(
        h.shift_date,
        h.shift,
        h.outgoing_caregiver_id,
        h.incoming_caregiver_id,
        h.status,
        h.handover_time,
        h.confirm_time,
      );
      const handoverId = result.lastInsertRowid;

      items
        .filter((item) => item.handover_idx === idx)
        .forEach((item) => {
          itemStmt.run(
            handoverId,
            item.elder_id,
            item.care_record_id,
            item.medication_summary,
            item.physical_condition,
            item.has_abnormal,
            item.abnormal_description,
            item.notes,
          );
        });
    });
  });

  tx();
  console.log(`已创建 ${handovers.length} 条交接班记录`);
}

function seedCareRecords() {
  const caregivers = db
    .prepare("SELECT * FROM caregivers WHERE status = '在岗'")
    .all();
  const records = [];
  const today = new Date();

  const shiftMap = {
    早班: "06:00-14:00",
    中班: "14:00-22:00",
    晚班: "22:00-06:00",
  };

  for (let day = 0; day < 3; day++) {
    const recordDate = new Date(today);
    recordDate.setDate(recordDate.getDate() - day);
    const dateStr = recordDate.toISOString().split("T")[0];

    caregivers.forEach((cg) => {
      const assignments = db
        .prepare(
          `
        SELECT e.* FROM elders e
        JOIN caregiver_assignments ca ON e.id = ca.elder_id
        WHERE ca.caregiver_id = ? AND e.status != '已转出'
      `,
        )
        .all(cg.id);

      assignments.forEach((elder) => {
        const dailyLife =
          cg.care_level === "自理"
            ? "协助整理内务，老人自主完成洗漱用餐"
            : cg.care_level === "半失能"
              ? "协助穿衣、洗漱、就餐，搀扶如厕"
              : "晨间护理：口腔清洁、面部清洁、翻身拍背、协助进食";

        const medication =
          elder.health && elder.health.includes("高血压")
            ? "硝苯地平缓释片 30mg 每日一次"
            : elder.health && elder.health.includes("糖尿病")
              ? "二甲双胍 500mg 每日两次"
              : cg.care_level === "失能"
                ? "多种药物按时投喂"
                : "无特殊用药";

        const diet =
          cg.care_level === "失能"
            ? "流质饮食，鼻饲进食 250ml/次，每日5次"
            : cg.care_level === "半失能"
              ? "软食，协助用餐，食欲良好"
              : "普通饮食，自主用餐，食量正常";

        const physical =
          cg.care_level === "失能"
            ? "生命体征平稳，皮肤完整，无压疮"
            : cg.care_level === "半失能"
              ? "精神尚可，肢体活动受限"
              : "精神状态良好，活动自如";

        const isAbnormal = day === 0 && elder.id % 5 === 0 ? 1 : 0;
        const abnormalDesc = isAbnormal
          ? "午餐后血糖偏高，测量值 12.8mmol/L"
          : "";
        const reportedTo = isAbnormal ? "值班张医生" : "";

        records.push({
          elder_id: elder.id,
          caregiver_id: cg.id,
          shift: cg.shift,
          daily_life: dailyLife,
          medication: medication,
          diet: diet,
          physical_condition: physical,
          is_abnormal: isAbnormal,
          abnormal_description: abnormalDesc,
          reported_to: reportedTo,
          record_date: dateStr,
        });
      });
    });
  }

  const stmt = db.prepare(`
    INSERT INTO care_records (elder_id, caregiver_id, shift, daily_life, medication, diet, physical_condition, is_abnormal, abnormal_description, reported_to, record_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    records.forEach((r) =>
      stmt.run(
        r.elder_id,
        r.caregiver_id,
        r.shift,
        r.daily_life,
        r.medication,
        r.diet,
        r.physical_condition,
        r.is_abnormal,
        r.abnormal_description,
        r.reported_to,
        r.record_date,
      ),
    );
  });

  tx();
  console.log(`已创建 ${records.length} 条护理记录`);
}

function seedMeals() {
  const elders = db
    .prepare(
      "SELECT * FROM elders WHERE status IN ('在住', '外出就医', '已复核')",
    )
    .all();
  const today = new Date();
  const records = [];

  const dietMap = {
    自理: "普食",
    半失能: "软食",
    失能: "流质饮食",
  };

  for (let day = 0; day < 3; day++) {
    const date = new Date(today);
    date.setDate(date.getDate() - day);
    const dateStr = date.toISOString().split("T")[0];

    elders.forEach((elder) => {
      const baseDiet = dietMap[elder.self_care_level] || "普食";

      const mealShifts = ["早餐", "午餐", "晚餐"];
      mealShifts.forEach((shift) => {
        let dietType = baseDiet;
        let restrictions = "";

        if (elder.health_status && elder.health_status.includes("糖尿病")) {
          dietType = "糖尿病餐";
          restrictions = "控制碳水摄入";
        }
        if (elder.health_status && elder.health_status.includes("高血压")) {
          dietType = "低盐餐";
          restrictions = "低盐饮食";
        }
        if (elder.health_status && elder.health_status.includes("瘫痪")) {
          dietType = "鼻饲饮食";
          restrictions = "鼻饲进食，250ml/次";
        }
        if (elder.health_status && elder.health_status.includes("阿尔茨海默")) {
          dietType = "软食";
          restrictions = "防误咽，食物细碎";
        }
        if (elder.health_status && elder.health_status.includes("帕金森")) {
          dietType = "软食";
          restrictions = "防误咽，食物细碎";
        }

        if (shift === "早餐") {
          restrictions += restrictions ? "；" : "";
          restrictions += "清淡为主";
        }

        records.push({
          elder_id: elder.id,
          meal_date: dateStr,
          meal_shift: shift,
          diet_type: dietType,
          dietary_restrictions: restrictions,
        });
      });
    });
  }

  const stmt = db.prepare(`
    INSERT INTO meals (elder_id, meal_date, meal_shift, diet_type, dietary_restrictions)
    VALUES (?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    records.forEach((r) =>
      stmt.run(
        r.elder_id,
        r.meal_date,
        r.meal_shift,
        r.diet_type,
        r.dietary_restrictions,
      ),
    );
  });

  tx();
  console.log(`已创建 ${records.length} 条膳食记录`);
}

function seedAll() {
  seedBeds();
  seedCaregivers();
  seedElders();
  seedReviews();
  seedCareRecords();
  seedSchedules();
  seedHandovers();
  seedMeals();
  console.log("\n已创建示例数据：");
  console.log("  - 14 个床位（自理/半失能/失能分区）");
  console.log("  - 10 名护理人员（按等级分配）");
  console.log("  - 11 位老人（含自理3人、半失能3人、失能4人、待审核1人）");
  console.log("  - 资格复核记录");
  console.log("  - 近3天护理记录（含异常上报示例）");
  console.log("  - 7天排班记录");
  console.log("  - 交接班记录及老人交接明细");
  console.log("  - 近3天膳食安排记录");
}

function run() {
  console.log("开始初始化数据库（完整重置模式）...");
  initDatabase();
  clearAll();
  seedAll();
  console.log("\n✅ 数据初始化完成！");
}

function initIfEmpty() {
  initDatabase();
  if (isDatabaseEmpty()) {
    console.log("检测到空数据库，正在填充示例数据...");
    seedAll();
    console.log("\n✅ 示例数据填充完成！");
    return true;
  } else {
    console.log("数据库已有数据，跳过初始化");
    return false;
  }
}

if (require.main === module) {
  run();
}

module.exports = { run, initIfEmpty, isDatabaseEmpty };

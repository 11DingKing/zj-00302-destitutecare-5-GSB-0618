const express = require("express");
const router = express.Router();
const { db } = require("../database");
const {
  STATUS_FLOW,
  SELF_CARE_LEVELS,
  ACTIVE_STATUSES,
  canTransitionStatus,
} = require("../config/constants");

router.get("/", (req, res) => {
  const { status, self_care_level } = req.query;
  let sql = "SELECT * FROM elders WHERE 1=1";
  const params = [];

  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  if (self_care_level) {
    sql += " AND self_care_level = ?";
    params.push(self_care_level);
  }
  sql += " ORDER BY created_at DESC";

  const elders = db.prepare(sql).all(...params);

  const result = elders.map((elder) => {
    let bedInfo = null;
    let caregivers = [];
    if (elder.bed_id) {
      bedInfo = db.prepare("SELECT * FROM beds WHERE id = ?").get(elder.bed_id);
    }
    const assignments = db
      .prepare(
        `
      SELECT c.* FROM caregivers c
      JOIN caregiver_assignments ca ON c.id = ca.caregiver_id
      WHERE ca.elder_id = ?
    `,
      )
      .all(elder.id);
    caregivers = assignments;
    return { ...elder, bed: bedInfo, caregivers };
  });

  res.json(result);
});

router.get("/:id", (req, res) => {
  const elder = db
    .prepare("SELECT * FROM elders WHERE id = ?")
    .get(req.params.id);
  if (!elder) {
    return res.status(404).json({ error: "老人信息不存在" });
  }

  let bedInfo = null;
  if (elder.bed_id) {
    bedInfo = db.prepare("SELECT * FROM beds WHERE id = ?").get(elder.bed_id);
  }

  const caregivers = db
    .prepare(
      `
    SELECT c.* FROM caregivers c
    JOIN caregiver_assignments ca ON c.id = ca.caregiver_id
    WHERE ca.elder_id = ?
  `,
    )
    .all(elder.id);

  const reviews = db
    .prepare(
      "SELECT * FROM qualification_reviews WHERE elder_id = ? ORDER BY review_date DESC",
    )
    .all(elder.id);
  const careRecords = db
    .prepare(
      "SELECT * FROM care_records WHERE elder_id = ? ORDER BY record_date DESC LIMIT 20",
    )
    .all(elder.id);

  res.json({ ...elder, bed: bedInfo, caregivers, reviews, careRecords });
});

router.post("/", (req, res) => {
  const { name, gender, id_card, age, health_status, self_care_level } =
    req.body;

  if (!name || !gender || !id_card || !age || !self_care_level) {
    return res.status(400).json({ error: "请填写必填信息" });
  }

  const exists = db
    .prepare("SELECT id FROM elders WHERE id_card = ?")
    .get(id_card);
  if (exists) {
    return res.status(400).json({ error: "该身份证号已存在" });
  }

  const stmt = db.prepare(`
    INSERT INTO elders (name, gender, id_card, age, health_status, self_care_level, status)
    VALUES (?, ?, ?, ?, ?, ?, '待审核')
  `);

  const result = stmt.run(
    name,
    gender,
    id_card,
    age,
    health_status || "",
    self_care_level,
  );
  const elder = db
    .prepare("SELECT * FROM elders WHERE id = ?")
    .get(result.lastInsertRowid);

  res.status(201).json(elder);
});

router.put("/:id", (req, res) => {
  const elder = db
    .prepare("SELECT * FROM elders WHERE id = ?")
    .get(req.params.id);
  if (!elder) {
    return res.status(404).json({ error: "老人信息不存在" });
  }

  const { name, gender, age, health_status, self_care_level } = req.body;
  const levelChanged =
    self_care_level && self_care_level !== elder.self_care_level;

  db.prepare(
    `
    UPDATE elders SET 
      name = COALESCE(?, name),
      gender = COALESCE(?, gender),
      age = COALESCE(?, age),
      health_status = COALESCE(?, health_status),
      self_care_level = COALESCE(?, self_care_level),
      updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `,
  ).run(name, gender, age, health_status, self_care_level, req.params.id);

  const updated = db
    .prepare("SELECT * FROM elders WHERE id = ?")
    .get(req.params.id);

  if (
    levelChanged &&
    updated.status !== "已转出" &&
    updated.status !== "待审核"
  ) {
    const warnings = [];

    if (updated.bed_id) {
      const bed = db
        .prepare("SELECT * FROM beds WHERE id = ?")
        .get(updated.bed_id);
      if (
        bed &&
        bed.self_care_level &&
        bed.self_care_level !== updated.self_care_level
      ) {
        warnings.push({
          type: "bed_mismatch",
          message: `当前床位「${bed.room_number}-${bed.bed_number}」为${bed.self_care_level}床位，与老人新等级${updated.self_care_level}不匹配，请及时调床`,
          current_bed: bed,
        });
      }
    }

    const caregivers = db
      .prepare(
        `
      SELECT c.* FROM caregivers c
      JOIN caregiver_assignments ca ON c.id = ca.caregiver_id
      WHERE ca.elder_id = ?
    `,
      )
      .all(updated.id);

    const mismatchedCaregivers = caregivers.filter(
      (c) => c.care_level !== updated.self_care_level,
    );
    if (mismatchedCaregivers.length > 0) {
      warnings.push({
        type: "caregiver_mismatch",
        message: `有 ${mismatchedCaregivers.length} 名护理员等级与老人新等级不匹配，请重新分配护理员`,
        mismatched_caregivers: mismatchedCaregivers,
      });
    }

    if (warnings.length > 0) {
      return res.json({
        ...updated,
        level_changed: true,
        warnings,
      });
    }

    return res.json({ ...updated, level_changed: true, warnings: [] });
  }

  res.json(updated);
});

router.post("/:id/change-bed", (req, res) => {
  const elder = db
    .prepare("SELECT * FROM elders WHERE id = ?")
    .get(req.params.id);
  if (!elder) {
    return res.status(404).json({ error: "老人信息不存在" });
  }

  if (elder.status === "已转出" || elder.status === "待审核") {
    return res
      .status(400)
      .json({ error: `当前状态「${elder.status}」无法调床` });
  }

  const { new_bed_id } = req.body;
  if (!new_bed_id) {
    return res.status(400).json({ error: "请指定新床位" });
  }

  const newBed = db.prepare("SELECT * FROM beds WHERE id = ?").get(new_bed_id);
  if (!newBed) {
    return res.status(404).json({ error: "目标床位不存在" });
  }

  if (newBed.status !== "空闲") {
    return res.status(400).json({ error: "目标床位已被占用" });
  }

  if (
    newBed.self_care_level &&
    newBed.self_care_level !== elder.self_care_level
  ) {
    return res.status(400).json({
      error: `目标床位类型「${newBed.self_care_level}」与老人自理等级「${elder.self_care_level}」不匹配`,
    });
  }

  const oldBedId = elder.bed_id;

  const tx = db.transaction(() => {
    if (oldBedId) {
      db.prepare("UPDATE beds SET status = ? WHERE id = ?").run(
        "空闲",
        oldBedId,
      );
    }
    db.prepare("UPDATE beds SET status = ? WHERE id = ?").run(
      "已分配",
      new_bed_id,
    );
    db.prepare(
      `
      UPDATE elders SET bed_id = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `,
    ).run(new_bed_id, req.params.id);
  });

  tx();

  const updated = db
    .prepare("SELECT * FROM elders WHERE id = ?")
    .get(req.params.id);
  const newBedInfo = db
    .prepare("SELECT * FROM beds WHERE id = ?")
    .get(new_bed_id);

  res.json({
    message: "调床成功",
    elder: updated,
    old_bed_id: oldBedId,
    new_bed: newBedInfo,
  });
});

router.post("/:id/reassign-caregivers", (req, res) => {
  const elder = db
    .prepare("SELECT * FROM elders WHERE id = ?")
    .get(req.params.id);
  if (!elder) {
    return res.status(404).json({ error: "老人信息不存在" });
  }

  if (elder.status === "已转出") {
    return res.status(400).json({ error: "已转出老人无法分配护理员" });
  }

  const { caregiver_ids } = req.body;
  if (!caregiver_ids || !Array.isArray(caregiver_ids)) {
    return res.status(400).json({ error: "请指定护理员ID列表" });
  }

  for (const cid of caregiver_ids) {
    const cg = db.prepare("SELECT * FROM caregivers WHERE id = ?").get(cid);
    if (!cg) {
      return res.status(400).json({ error: `护理员 ID ${cid} 不存在` });
    }
    if (cg.status !== "在岗") {
      return res.status(400).json({
        error: `护理员「${cg.name}」当前状态为${cg.status}，无法分配`,
      });
    }
    if (cg.care_level !== elder.self_care_level) {
      return res.status(400).json({
        error: `护理员「${cg.name}」等级「${cg.care_level}」与老人等级「${elder.self_care_level}」不匹配`,
      });
    }
  }

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM caregiver_assignments WHERE elder_id = ?").run(
      req.params.id,
    );
    const assignStmt = db.prepare(
      "INSERT OR IGNORE INTO caregiver_assignments (caregiver_id, elder_id) VALUES (?, ?)",
    );
    caregiver_ids.forEach((cid) => assignStmt.run(cid, req.params.id));
  });

  tx();

  const caregivers = db
    .prepare(
      `
    SELECT c.* FROM caregivers c
    JOIN caregiver_assignments ca ON c.id = ca.caregiver_id
    WHERE ca.elder_id = ?
  `,
    )
    .all(req.params.id);

  res.json({
    message: "护理员重新分配成功",
    caregivers,
  });
});

router.post("/:id/check-in", (req, res) => {
  const elder = db
    .prepare("SELECT * FROM elders WHERE id = ?")
    .get(req.params.id);
  if (!elder) {
    return res.status(404).json({ error: "老人信息不存在" });
  }

  if (!canTransitionStatus(elder.status, "在住")) {
    return res
      .status(400)
      .json({ error: `当前状态「${elder.status}」无法办理入住` });
  }

  const { bed_id, caregiver_ids } = req.body;

  if (!bed_id) {
    return res.status(400).json({ error: "请分配床位" });
  }

  const bed = db.prepare("SELECT * FROM beds WHERE id = ?").get(bed_id);
  if (!bed || bed.status !== "空闲") {
    return res.status(400).json({ error: "床位不可用" });
  }

  if (bed.self_care_level && bed.self_care_level !== elder.self_care_level) {
    return res.status(400).json({
      error: `床位类型「${bed.self_care_level}」与老人自理等级不匹配`,
    });
  }

  const tx = db.transaction(() => {
    db.prepare("UPDATE beds SET status = ? WHERE id = ?").run("已分配", bed_id);
    db.prepare(
      `
      UPDATE elders SET status = ?, bed_id = ?, check_in_date = date('now', 'localtime'), updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `,
    ).run("在住", bed_id, req.params.id);

    if (caregiver_ids && caregiver_ids.length > 0) {
      const assignStmt = db.prepare(
        "INSERT OR IGNORE INTO caregiver_assignments (caregiver_id, elder_id) VALUES (?, ?)",
      );
      caregiver_ids.forEach((cid) => assignStmt.run(cid, req.params.id));
    }
  });

  tx();

  const updated = db
    .prepare("SELECT * FROM elders WHERE id = ?")
    .get(req.params.id);
  res.json({ message: "入住办理成功", elder: updated });
});

router.post("/:id/change-status", (req, res) => {
  const elder = db
    .prepare("SELECT * FROM elders WHERE id = ?")
    .get(req.params.id);
  if (!elder) {
    return res.status(404).json({ error: "老人信息不存在" });
  }

  const { new_status, reason } = req.body;

  if (!canTransitionStatus(elder.status, new_status)) {
    return res
      .status(400)
      .json({ error: `无法从「${elder.status}」流转到「${new_status}」` });
  }

  const tx = db.transaction(() => {
    if (new_status === "已转出") {
      if (elder.bed_id) {
        db.prepare("UPDATE beds SET status = ? WHERE id = ?").run(
          "空闲",
          elder.bed_id,
        );
      }
      db.prepare("DELETE FROM caregiver_assignments WHERE elder_id = ?").run(
        req.params.id,
      );
      db.prepare(
        `
        UPDATE elders SET status = ?, bed_id = NULL, transfer_reason = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `,
      ).run(new_status, reason || "", req.params.id);
    } else {
      db.prepare(
        `
        UPDATE elders SET status = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `,
      ).run(new_status, req.params.id);
    }
  });

  tx();

  const updated = db
    .prepare("SELECT * FROM elders WHERE id = ?")
    .get(req.params.id);
  res.json({ message: "状态更新成功", elder: updated });
});

router.delete("/:id", (req, res) => {
  const elder = db
    .prepare("SELECT * FROM elders WHERE id = ?")
    .get(req.params.id);
  if (!elder) {
    return res.status(404).json({ error: "老人信息不存在" });
  }

  const tx = db.transaction(() => {
    if (elder.bed_id) {
      db.prepare("UPDATE beds SET status = ? WHERE id = ?").run(
        "空闲",
        elder.bed_id,
      );
    }
    db.prepare("DELETE FROM caregiver_assignments WHERE elder_id = ?").run(
      req.params.id,
    );
    db.prepare("DELETE FROM care_records WHERE elder_id = ?").run(
      req.params.id,
    );
    db.prepare("DELETE FROM qualification_reviews WHERE elder_id = ?").run(
      req.params.id,
    );
    db.prepare("DELETE FROM elders WHERE id = ?").run(req.params.id);
  });

  tx();

  res.json({ message: "删除成功" });
});

router.get("/mismatch/list", (req, res) => {
  const { type } = req.query;

  const elders = db
    .prepare(
      `
    SELECT e.* FROM elders e
    WHERE e.status IN ('在住', '外出就医', '已复核')
    ORDER BY e.created_at DESC
  `,
    )
    .all();

  const result = [];

  for (const elder of elders) {
    let bedMismatch = false;
    let caregiverMismatch = false;
    let bedInfo = null;
    let mismatchedCaregivers = [];

    if (elder.bed_id) {
      const bed = db
        .prepare("SELECT * FROM beds WHERE id = ?")
        .get(elder.bed_id);
      if (bed) {
        bedInfo = bed;
        if (
          bed.self_care_level &&
          bed.self_care_level !== elder.self_care_level
        ) {
          bedMismatch = true;
        }
      }
    }

    const caregivers = db
      .prepare(
        `
      SELECT c.* FROM caregivers c
      JOIN caregiver_assignments ca ON c.id = ca.caregiver_id
      WHERE ca.elder_id = ?
    `,
      )
      .all(elder.id);

    mismatchedCaregivers = caregivers.filter(
      (c) => c.care_level !== elder.self_care_level,
    );
    caregiverMismatch = mismatchedCaregivers.length > 0;

    const hasMismatch = bedMismatch || caregiverMismatch;

    if (
      !type ||
      (type === "bed" && bedMismatch) ||
      (type === "caregiver" && caregiverMismatch) ||
      (type === "all" && hasMismatch)
    ) {
      result.push({
        elder: {
          id: elder.id,
          name: elder.name,
          gender: elder.gender,
          age: elder.age,
          self_care_level: elder.self_care_level,
          status: elder.status,
        },
        bed_mismatch: bedMismatch,
        caregiver_mismatch: caregiverMismatch,
        current_bed: bedInfo,
        mismatched_caregivers: mismatchedCaregivers,
        total_caregivers: caregivers.length,
      });
    }
  }

  res.json({
    total: result.length,
    bed_mismatch_count: result.filter((r) => r.bed_mismatch).length,
    caregiver_mismatch_count: result.filter((r) => r.caregiver_mismatch).length,
    items: result,
  });
});

module.exports = router;

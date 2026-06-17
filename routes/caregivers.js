const express = require("express");
const router = express.Router();
const { db } = require("../database");
const { CARE_RATIO, SELF_CARE_LEVELS } = require("../config/constants");

router.get("/", (req, res) => {
  const { care_level, shift, status } = req.query;
  let sql = "SELECT * FROM caregivers WHERE 1=1";
  const params = [];

  if (care_level) {
    sql += " AND care_level = ?";
    params.push(care_level);
  }
  if (shift) {
    sql += " AND shift = ?";
    params.push(shift);
  }
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  sql += " ORDER BY created_at DESC";

  const caregivers = db.prepare(sql).all(...params);

  const result = caregivers.map((cg) => {
    const elders = db
      .prepare(
        `
      SELECT e.id, e.name, e.self_care_level, e.status FROM elders e
      JOIN caregiver_assignments ca ON e.id = ca.elder_id
      WHERE ca.caregiver_id = ? AND e.status != '已转出'
    `,
      )
      .all(cg.id);
    return { ...cg, elders, elder_count: elders.length };
  });

  res.json(result);
});

router.get("/:id", (req, res) => {
  const caregiver = db
    .prepare("SELECT * FROM caregivers WHERE id = ?")
    .get(req.params.id);
  if (!caregiver) {
    return res.status(404).json({ error: "护理人员不存在" });
  }

  const elders = db
    .prepare(
      `
    SELECT e.* FROM elders e
    JOIN caregiver_assignments ca ON e.id = ca.elder_id
    WHERE ca.caregiver_id = ?
  `,
    )
    .all(caregiver.id);

  const records = db
    .prepare(
      `
    SELECT cr.*, e.name as elder_name FROM care_records cr
    JOIN elders e ON cr.elder_id = e.id
    WHERE cr.caregiver_id = ?
    ORDER BY cr.record_date DESC, cr.created_at DESC
    LIMIT 50
  `,
    )
    .all(caregiver.id);

  res.json({ ...caregiver, elders, records });
});

router.post("/", (req, res) => {
  const { name, gender, phone, employee_id, care_level, shift } = req.body;

  if (!name || !gender || !phone || !employee_id || !care_level || !shift) {
    return res.status(400).json({ error: "请填写必填信息" });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO caregivers (name, gender, phone, employee_id, care_level, shift)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      name,
      gender,
      phone,
      employee_id,
      care_level,
      shift,
    );
    const caregiver = db
      .prepare("SELECT * FROM caregivers WHERE id = ?")
      .get(result.lastInsertRowid);
    res.status(201).json(caregiver);
  } catch (err) {
    if (err.message.includes("UNIQUE")) {
      return res.status(400).json({ error: "员工编号已存在" });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", (req, res) => {
  const caregiver = db
    .prepare("SELECT * FROM caregivers WHERE id = ?")
    .get(req.params.id);
  if (!caregiver) {
    return res.status(404).json({ error: "护理人员不存在" });
  }

  const { name, gender, phone, care_level, shift, status } = req.body;

  db.prepare(
    `
    UPDATE caregivers SET
      name = COALESCE(?, name),
      gender = COALESCE(?, gender),
      phone = COALESCE(?, phone),
      care_level = COALESCE(?, care_level),
      shift = COALESCE(?, shift),
      status = COALESCE(?, status)
    WHERE id = ?
  `,
  ).run(name, gender, phone, care_level, shift, status, req.params.id);

  const updated = db
    .prepare("SELECT * FROM caregivers WHERE id = ?")
    .get(req.params.id);
  res.json(updated);
});

router.post("/:id/assign", (req, res) => {
  const caregiver = db
    .prepare("SELECT * FROM caregivers WHERE id = ?")
    .get(req.params.id);
  if (!caregiver) {
    return res.status(404).json({ error: "护理人员不存在" });
  }

  const { elder_id } = req.body;
  if (!elder_id) {
    return res.status(400).json({ error: "请指定老人ID" });
  }

  const elder = db.prepare("SELECT * FROM elders WHERE id = ?").get(elder_id);
  if (!elder) {
    return res.status(404).json({ error: "老人不存在" });
  }

  if (elder.self_care_level !== caregiver.care_level) {
    return res
      .status(400)
      .json({
        error: `护理员等级「${caregiver.care_level}」与老人自理等级「${elder.self_care_level}」不匹配`,
      });
  }

  try {
    db.prepare(
      "INSERT OR IGNORE INTO caregiver_assignments (caregiver_id, elder_id) VALUES (?, ?)",
    ).run(req.params.id, elder_id);
    res.json({ message: "分配成功" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/unassign", (req, res) => {
  const { elder_id } = req.body;
  if (!elder_id) {
    return res.status(400).json({ error: "请指定老人ID" });
  }

  db.prepare(
    "DELETE FROM caregiver_assignments WHERE caregiver_id = ? AND elder_id = ?",
  ).run(req.params.id, elder_id);
  res.json({ message: "取消分配成功" });
});

router.delete("/:id", (req, res) => {
  const caregiver = db
    .prepare("SELECT * FROM caregivers WHERE id = ?")
    .get(req.params.id);
  if (!caregiver) {
    return res.status(404).json({ error: "护理人员不存在" });
  }

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM caregiver_assignments WHERE caregiver_id = ?").run(
      req.params.id,
    );
    db.prepare("DELETE FROM caregivers WHERE id = ?").run(req.params.id);
  });

  tx();
  res.json({ message: "删除成功" });
});

module.exports = router;

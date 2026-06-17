const express = require("express");
const router = express.Router();
const { db } = require("../database");
const { MEAL_TYPES, DIET_TYPES } = require("../config/constants");

router.get("/", (req, res) => {
  const {
    elder_id,
    meal_date,
    meal_type,
    diet_type,
    start_date,
    end_date,
  } = req.query;

  let sql = `
    SELECT m.*, e.name as elder_name, e.gender, e.age, e.self_care_level
    FROM meal_records m
    JOIN elders e ON m.elder_id = e.id
    WHERE 1=1
  `;
  const params = [];

  if (elder_id) {
    sql += " AND m.elder_id = ?";
    params.push(elder_id);
  }
  if (meal_date) {
    sql += " AND m.meal_date = ?";
    params.push(meal_date);
  }
  if (meal_type) {
    sql += " AND m.meal_type = ?";
    params.push(meal_type);
  }
  if (diet_type) {
    sql += " AND m.diet_type = ?";
    params.push(diet_type);
  }
  if (start_date) {
    sql += " AND m.meal_date >= ?";
    params.push(start_date);
  }
  if (end_date) {
    sql += " AND m.meal_date <= ?";
    params.push(end_date);
  }
  sql += " ORDER BY m.meal_date DESC, m.meal_type DESC, m.created_at DESC LIMIT 200";

  const records = db.prepare(sql).all(...params);
  res.json(records);
});

router.get("/daily", (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split("T")[0];

  const records = db
    .prepare(
      `
    SELECT m.*, e.name as elder_name, e.gender, e.age, e.self_care_level,
           b.room_number, b.bed_number
    FROM meal_records m
    JOIN elders e ON m.elder_id = e.id
    LEFT JOIN beds b ON e.bed_id = b.id
    WHERE m.meal_date = ?
    ORDER BY e.name ASC, m.meal_type ASC
  `,
    )
    .all(targetDate);

  const byElder = {};
  records.forEach((r) => {
    if (!byElder[r.elder_id]) {
      byElder[r.elder_id] = {
        elder_id: r.elder_id,
        elder_name: r.elder_name,
        gender: r.gender,
        age: r.age,
        self_care_level: r.self_care_level,
        room_number: r.room_number,
        bed_number: r.bed_number,
        meals: {},
      };
    }
    byElder[r.elder_id].meals[r.meal_type] = {
      id: r.id,
      diet_type: r.diet_type,
      notes: r.notes,
      created_at: r.created_at,
    };
  });

  res.json({
    date: targetDate,
    meal_types: MEAL_TYPES,
    diet_types: DIET_TYPES,
    items: Object.values(byElder),
  });
});

router.get("/:id", (req, res) => {
  const record = db
    .prepare(
      `
    SELECT m.*, e.name as elder_name, e.gender, e.age, e.self_care_level
    FROM meal_records m
    JOIN elders e ON m.elder_id = e.id
    WHERE m.id = ?
  `,
    )
    .get(req.params.id);

  if (!record) {
    return res.status(404).json({ error: "膳食记录不存在" });
  }

  res.json(record);
});

router.post("/", (req, res) => {
  const { elder_id, meal_date, meal_type, diet_type, notes } = req.body;

  if (!elder_id || !meal_date || !meal_type || !diet_type) {
    return res
      .status(400)
      .json({ error: "请填写必填信息（老人、日期、餐次、膳食类型）" });
  }

  if (!MEAL_TYPES.includes(meal_type)) {
    return res
      .status(400)
      .json({ error: `餐次必须是以下值之一：${MEAL_TYPES.join("、")}` });
  }

  if (!DIET_TYPES.includes(diet_type)) {
    return res
      .status(400)
      .json({ error: `膳食类型必须是以下值之一：${DIET_TYPES.join("、")}` });
  }

  const elder = db.prepare("SELECT * FROM elders WHERE id = ?").get(elder_id);
  if (!elder) {
    return res.status(404).json({ error: "老人不存在" });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO meal_records (elder_id, meal_date, meal_type, diet_type, notes)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      elder_id,
      meal_date,
      meal_type,
      diet_type,
      notes || "",
    );

    const record = db
      .prepare(
        `
      SELECT m.*, e.name as elder_name
      FROM meal_records m
      JOIN elders e ON m.elder_id = e.id
      WHERE m.id = ?
    `,
      )
      .get(result.lastInsertRowid);

    res.status(201).json(record);
  } catch (err) {
    if (err.message.includes("UNIQUE")) {
      return res
        .status(400)
        .json({ error: "该老人此日此餐次已有膳食记录" });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post("/bulk", (req, res) => {
  const { records } = req.body;

  if (!records || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: "请提供膳食记录数据" });
  }

  for (const r of records) {
    if (!r.elder_id || !r.meal_date || !r.meal_type || !r.diet_type) {
      return res
        .status(400)
        .json({ error: "每条记录必须包含老人、日期、餐次、膳食类型" });
    }
    if (!MEAL_TYPES.includes(r.meal_type)) {
      return res
        .status(400)
        .json({ error: `餐次必须是以下值之一：${MEAL_TYPES.join("、")}` });
    }
    if (!DIET_TYPES.includes(r.diet_type)) {
      return res
        .status(400)
        .json({ error: `膳食类型必须是以下值之一：${DIET_TYPES.join("、")}` });
    }
    const elder = db.prepare("SELECT id FROM elders WHERE id = ?").get(r.elder_id);
    if (!elder) {
      return res.status(400).json({ error: `老人 ID ${r.elder_id} 不存在` });
    }
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO meal_records (elder_id, meal_date, meal_type, diet_type, notes)
    VALUES (?, ?, ?, ?, ?)
  `);

  try {
    const tx = db.transaction(() => {
      records.forEach((r) => {
        stmt.run(r.elder_id, r.meal_date, r.meal_type, r.diet_type, r.notes || "");
      });
    });
    tx();
    res.json({ message: "批量登记成功", count: records.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", (req, res) => {
  const record = db
    .prepare("SELECT * FROM meal_records WHERE id = ?")
    .get(req.params.id);
  if (!record) {
    return res.status(404).json({ error: "膳食记录不存在" });
  }

  const { meal_type, diet_type, notes } = req.body;

  if (meal_type && !MEAL_TYPES.includes(meal_type)) {
    return res
      .status(400)
      .json({ error: `餐次必须是以下值之一：${MEAL_TYPES.join("、")}` });
  }

  if (diet_type && !DIET_TYPES.includes(diet_type)) {
    return res
      .status(400)
      .json({ error: `膳食类型必须是以下值之一：${DIET_TYPES.join("、")}` });
  }

  try {
    db.prepare(
      `
      UPDATE meal_records SET
        meal_type = COALESCE(?, meal_type),
        diet_type = COALESCE(?, diet_type),
        notes = COALESCE(?, notes),
        updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `,
    ).run(meal_type, diet_type, notes, req.params.id);

    const updated = db
      .prepare(
        `
      SELECT m.*, e.name as elder_name
      FROM meal_records m
      JOIN elders e ON m.elder_id = e.id
      WHERE m.id = ?
    `,
      )
      .get(req.params.id);

    res.json(updated);
  } catch (err) {
    if (err.message.includes("UNIQUE")) {
      return res
        .status(400)
        .json({ error: "该老人此日此餐次已有膳食记录" });
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", (req, res) => {
  const record = db
    .prepare("SELECT * FROM meal_records WHERE id = ?")
    .get(req.params.id);
  if (!record) {
    return res.status(404).json({ error: "膳食记录不存在" });
  }

  db.prepare("DELETE FROM meal_records WHERE id = ?").run(req.params.id);
  res.json({ message: "删除成功" });
});

module.exports = router;

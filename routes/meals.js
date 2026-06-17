const express = require("express");
const router = express.Router();
const { db } = require("../database");
const { MEAL_TYPES, MEAL_SHIFTS } = require("../config/constants");

router.get("/", (req, res) => {
  const { elder_id, meal_date, meal_shift, diet_type } = req.query;
  let sql = `
    SELECT m.*, e.name as elder_name
    FROM meals m
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
  if (meal_shift) {
    sql += " AND m.meal_shift = ?";
    params.push(meal_shift);
  }
  if (diet_type) {
    sql += " AND m.diet_type = ?";
    params.push(diet_type);
  }
  sql += " ORDER BY m.meal_date DESC, m.meal_shift ASC";

  const records = db.prepare(sql).all(...params);
  res.json(records);
});

router.get("/:id", (req, res) => {
  const record = db
    .prepare(
      `
    SELECT m.*, e.name as elder_name
    FROM meals m
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
  const { elder_id, meal_date, meal_shift, diet_type, dietary_restrictions } =
    req.body;

  if (!elder_id || !meal_date || !meal_shift || !diet_type) {
    return res.status(400).json({ error: "请填写必填信息" });
  }

  if (!MEAL_SHIFTS.includes(meal_shift)) {
    return res.status(400).json({
      error: `餐次无效，可选值：${MEAL_SHIFTS.join("、")}`,
    });
  }

  if (!MEAL_TYPES.includes(diet_type)) {
    return res.status(400).json({
      error: `膳食类型无效，可选值：${MEAL_TYPES.join("、")}`,
    });
  }

  const elder = db.prepare("SELECT * FROM elders WHERE id = ?").get(elder_id);
  if (!elder) {
    return res.status(404).json({ error: "老人不存在" });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO meals (elder_id, meal_date, meal_shift, diet_type, dietary_restrictions)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      elder_id,
      meal_date,
      meal_shift,
      diet_type,
      dietary_restrictions || "",
    );

    const record = db
      .prepare(
        `
      SELECT m.*, e.name as elder_name
      FROM meals m
      JOIN elders e ON m.elder_id = e.id
      WHERE m.id = ?
    `,
      )
      .get(result.lastInsertRowid);

    res.status(201).json(record);
  } catch (err) {
    if (err.message && err.message.includes("UNIQUE")) {
      return res.status(409).json({
        error: `该老人在 ${meal_date} 的${meal_shift}已存在膳食记录，不可重复登记`,
      });
    }
    throw err;
  }
});

router.put("/:id", (req, res) => {
  const record = db
    .prepare("SELECT * FROM meals WHERE id = ?")
    .get(req.params.id);
  if (!record) {
    return res.status(404).json({ error: "膳食记录不存在" });
  }

  const { diet_type, dietary_restrictions } = req.body;

  if (diet_type && !MEAL_TYPES.includes(diet_type)) {
    return res.status(400).json({
      error: `膳食类型无效，可选值：${MEAL_TYPES.join("、")}`,
    });
  }

  db.prepare(
    `
    UPDATE meals SET
      diet_type = COALESCE(?, diet_type),
      dietary_restrictions = COALESCE(?, dietary_restrictions),
      updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `,
  ).run(diet_type, dietary_restrictions, req.params.id);

  const updated = db
    .prepare(
      `
    SELECT m.*, e.name as elder_name
    FROM meals m
    JOIN elders e ON m.elder_id = e.id
    WHERE m.id = ?
  `,
    )
    .get(req.params.id);

  res.json(updated);
});

router.delete("/:id", (req, res) => {
  const record = db
    .prepare("SELECT * FROM meals WHERE id = ?")
    .get(req.params.id);
  if (!record) {
    return res.status(404).json({ error: "膳食记录不存在" });
  }

  db.prepare("DELETE FROM meals WHERE id = ?").run(req.params.id);
  res.json({ message: "删除成功" });
});

module.exports = router;

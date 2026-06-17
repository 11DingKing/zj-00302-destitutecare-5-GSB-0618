const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { MEAL_TYPES, DIETARY_TYPES } = require('../config/constants');

router.get('/', (req, res) => {
  const { elder_id, meal_date, meal_type, dietary_type } = req.query;
  let sql = `
    SELECT dr.*, e.name as elder_name
    FROM dietary_records dr
    JOIN elders e ON dr.elder_id = e.id
    WHERE 1=1
  `;
  const params = [];

  if (elder_id) {
    sql += ' AND dr.elder_id = ?';
    params.push(elder_id);
  }
  if (meal_date) {
    sql += ' AND dr.meal_date = ?';
    params.push(meal_date);
  }
  if (meal_type) {
    sql += ' AND dr.meal_type = ?';
    params.push(meal_type);
  }
  if (dietary_type) {
    sql += ' AND dr.dietary_type = ?';
    params.push(dietary_type);
  }
  sql += ' ORDER BY dr.meal_date DESC, dr.meal_type DESC LIMIT 200';

  const records = db.prepare(sql).all(...params);
  res.json(records);
});

router.get('/:id', (req, res) => {
  const record = db.prepare(`
    SELECT dr.*, e.name as elder_name
    FROM dietary_records dr
    JOIN elders e ON dr.elder_id = e.id
    WHERE dr.id = ?
  `).get(req.params.id);

  if (!record) {
    return res.status(404).json({ error: '膳食记录不存在' });
  }

  res.json(record);
});

router.post('/', (req, res) => {
  const { elder_id, meal_date, meal_type, dietary_type, notes } = req.body;

  if (!elder_id || !meal_date || !meal_type || !dietary_type) {
    return res.status(400).json({ error: '请填写必填信息' });
  }

  if (!MEAL_TYPES.includes(meal_type)) {
    return res.status(400).json({ error: `餐次必须是：${MEAL_TYPES.join('、')}` });
  }

  if (!DIETARY_TYPES.includes(dietary_type)) {
    return res.status(400).json({ error: `膳食类型必须是：${DIETARY_TYPES.join('、')}` });
  }

  const elder = db.prepare('SELECT * FROM elders WHERE id = ?').get(elder_id);
  if (!elder) {
    return res.status(404).json({ error: '老人不存在' });
  }

  const existing = db.prepare(`
    SELECT id FROM dietary_records WHERE elder_id = ? AND meal_date = ? AND meal_type = ?
  `).get(elder_id, meal_date, meal_type);
  if (existing) {
    return res.status(400).json({ error: '该老人在该日期该餐次已有膳食记录' });
  }

  const stmt = db.prepare(`
    INSERT INTO dietary_records (elder_id, meal_date, meal_type, dietary_type, notes)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(elder_id, meal_date, meal_type, dietary_type, notes || '');

  const record = db.prepare(`
    SELECT dr.*, e.name as elder_name
    FROM dietary_records dr
    JOIN elders e ON dr.elder_id = e.id
    WHERE dr.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(record);
});

router.put('/:id', (req, res) => {
  const record = db.prepare('SELECT * FROM dietary_records WHERE id = ?').get(req.params.id);
  if (!record) {
    return res.status(404).json({ error: '膳食记录不存在' });
  }

  const { meal_date, meal_type, dietary_type, notes } = req.body;

  if (meal_type !== undefined && !MEAL_TYPES.includes(meal_type)) {
    return res.status(400).json({ error: `餐次必须是：${MEAL_TYPES.join('、')}` });
  }

  if (dietary_type !== undefined && !DIETARY_TYPES.includes(dietary_type)) {
    return res.status(400).json({ error: `膳食类型必须是：${DIETARY_TYPES.join('、')}` });
  }

  const newMealDate = meal_date || record.meal_date;
  const newMealType = meal_type || record.meal_type;

  if (meal_date !== undefined || meal_type !== undefined) {
    const existing = db.prepare(`
      SELECT id FROM dietary_records 
      WHERE elder_id = ? AND meal_date = ? AND meal_type = ? AND id != ?
    `).get(record.elder_id, newMealDate, newMealType, req.params.id);
    if (existing) {
      return res.status(400).json({ error: '该老人在该日期该餐次已有膳食记录' });
    }
  }

  db.prepare(`
    UPDATE dietary_records SET
      meal_date = COALESCE(?, meal_date),
      meal_type = COALESCE(?, meal_type),
      dietary_type = COALESCE(?, dietary_type),
      notes = COALESCE(?, notes),
      updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(meal_date, meal_type, dietary_type, notes, req.params.id);

  const updated = db.prepare(`
    SELECT dr.*, e.name as elder_name
    FROM dietary_records dr
    JOIN elders e ON dr.elder_id = e.id
    WHERE dr.id = ?
  `).get(req.params.id);

  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const record = db.prepare('SELECT * FROM dietary_records WHERE id = ?').get(req.params.id);
  if (!record) {
    return res.status(404).json({ error: '膳食记录不存在' });
  }

  db.prepare('DELETE FROM dietary_records WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { db } = require('../database');

router.get('/', (req, res) => {
  const { elder_id, caregiver_id, shift, record_date, is_abnormal } = req.query;
  let sql = `
    SELECT cr.*, e.name as elder_name, c.name as caregiver_name
    FROM care_records cr
    JOIN elders e ON cr.elder_id = e.id
    JOIN caregivers c ON cr.caregiver_id = c.id
    WHERE 1=1
  `;
  const params = [];
  
  if (elder_id) {
    sql += ' AND cr.elder_id = ?';
    params.push(elder_id);
  }
  if (caregiver_id) {
    sql += ' AND cr.caregiver_id = ?';
    params.push(caregiver_id);
  }
  if (shift) {
    sql += ' AND cr.shift = ?';
    params.push(shift);
  }
  if (record_date) {
    sql += ' AND cr.record_date = ?';
    params.push(record_date);
  }
  if (is_abnormal !== undefined) {
    sql += ' AND cr.is_abnormal = ?';
    params.push(is_abnormal ? 1 : 0);
  }
  sql += ' ORDER BY cr.record_date DESC, cr.created_at DESC LIMIT 200';
  
  const records = db.prepare(sql).all(...params);
  res.json(records);
});

router.get('/abnormal', (req, res) => {
  const records = db.prepare(`
    SELECT cr.*, e.name as elder_name, b.room_number, b.bed_number, c.name as caregiver_name
    FROM care_records cr
    JOIN elders e ON cr.elder_id = e.id
    LEFT JOIN beds b ON e.bed_id = b.id
    JOIN caregivers c ON cr.caregiver_id = c.id
    WHERE cr.is_abnormal = 1
    ORDER BY cr.created_at DESC
    LIMIT 100
  `).all();
  res.json(records);
});

router.get('/:id', (req, res) => {
  const record = db.prepare(`
    SELECT cr.*, e.name as elder_name, c.name as caregiver_name
    FROM care_records cr
    JOIN elders e ON cr.elder_id = e.id
    JOIN caregivers c ON cr.caregiver_id = c.id
    WHERE cr.id = ?
  `).get(req.params.id);
  
  if (!record) {
    return res.status(404).json({ error: '记录不存在' });
  }
  
  res.json(record);
});

router.post('/', (req, res) => {
  const { elder_id, caregiver_id, shift, daily_life, medication, diet, physical_condition, is_abnormal, abnormal_description, reported_to } = req.body;
  
  if (!elder_id || !caregiver_id || !shift) {
    return res.status(400).json({ error: '请填写必填信息' });
  }
  
  const elder = db.prepare('SELECT * FROM elders WHERE id = ?').get(elder_id);
  if (!elder) {
    return res.status(404).json({ error: '老人不存在' });
  }
  
  const caregiver = db.prepare('SELECT * FROM caregivers WHERE id = ?').get(caregiver_id);
  if (!caregiver) {
    return res.status(404).json({ error: '护理人员不存在' });
  }
  
  const hasAssignment = db.prepare('SELECT 1 FROM caregiver_assignments WHERE caregiver_id = ? AND elder_id = ?').get(caregiver_id, elder_id);
  if (!hasAssignment) {
    return res.status(400).json({ error: '该护理员未分配给此老人' });
  }
  
  const stmt = db.prepare(`
    INSERT INTO care_records (elder_id, caregiver_id, shift, daily_life, medication, diet, physical_condition, is_abnormal, abnormal_description, reported_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const abnormal = is_abnormal ? 1 : 0;
  const result = stmt.run(elder_id, caregiver_id, shift, daily_life || '', medication || '', diet || '', physical_condition || '', abnormal, abnormal ? (abnormal_description || '') : '', abnormal ? (reported_to || '') : '');
  
  const record = db.prepare(`
    SELECT cr.*, e.name as elder_name, c.name as caregiver_name
    FROM care_records cr
    JOIN elders e ON cr.elder_id = e.id
    JOIN caregivers c ON cr.caregiver_id = c.id
    WHERE cr.id = ?
  `).get(result.lastInsertRowid);
  
  res.status(201).json(record);
});

router.put('/:id', (req, res) => {
  const record = db.prepare('SELECT * FROM care_records WHERE id = ?').get(req.params.id);
  if (!record) {
    return res.status(404).json({ error: '记录不存在' });
  }
  
  const { daily_life, medication, diet, physical_condition, is_abnormal, abnormal_description, reported_to } = req.body;
  
  const abnormal = is_abnormal !== undefined ? (is_abnormal ? 1 : 0) : record.is_abnormal;
  
  db.prepare(`
    UPDATE care_records SET
      daily_life = COALESCE(?, daily_life),
      medication = COALESCE(?, medication),
      diet = COALESCE(?, diet),
      physical_condition = COALESCE(?, physical_condition),
      is_abnormal = ?,
      abnormal_description = COALESCE(?, abnormal_description),
      reported_to = COALESCE(?, reported_to)
    WHERE id = ?
  `).run(daily_life, medication, diet, physical_condition, abnormal, abnormal_description, reported_to, req.params.id);
  
  const updated = db.prepare(`
    SELECT cr.*, e.name as elder_name, c.name as caregiver_name
    FROM care_records cr
    JOIN elders e ON cr.elder_id = e.id
    JOIN caregivers c ON cr.caregiver_id = c.id
    WHERE cr.id = ?
  `).get(req.params.id);
  
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const record = db.prepare('SELECT * FROM care_records WHERE id = ?').get(req.params.id);
  if (!record) {
    return res.status(404).json({ error: '记录不存在' });
  }
  
  db.prepare('DELETE FROM care_records WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

module.exports = router;

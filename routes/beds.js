const express = require('express');
const router = express.Router();
const { db } = require('../database');

router.get('/', (req, res) => {
  const { status, self_care_level, floor } = req.query;
  let sql = 'SELECT * FROM beds WHERE 1=1';
  const params = [];
  
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (self_care_level) {
    sql += ' AND self_care_level = ?';
    params.push(self_care_level);
  }
  if (floor) {
    sql += ' AND floor = ?';
    params.push(floor);
  }
  sql += ' ORDER BY floor, room_number, bed_number';
  
  const beds = db.prepare(sql).all(...params);
  
  const result = beds.map(bed => {
    let elder = null;
    if (bed.status === '已分配') {
      elder = db.prepare('SELECT id, name, self_care_level, status FROM elders WHERE bed_id = ?').get(bed.id);
    }
    return { ...bed, elder };
  });
  
  res.json(result);
});

router.get('/:id', (req, res) => {
  const bed = db.prepare('SELECT * FROM beds WHERE id = ?').get(req.params.id);
  if (!bed) {
    return res.status(404).json({ error: '床位不存在' });
  }
  
  let elder = null;
  if (bed.status === '已分配') {
    elder = db.prepare('SELECT * FROM elders WHERE bed_id = ?').get(bed.id);
  }
  
  res.json({ ...bed, elder });
});

router.post('/', (req, res) => {
  const { room_number, bed_number, floor, self_care_level } = req.body;
  
  if (!room_number || !bed_number || !floor) {
    return res.status(400).json({ error: '请填写必填信息' });
  }
  
  try {
    const stmt = db.prepare(`
      INSERT INTO beds (room_number, bed_number, floor, self_care_level)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(room_number, bed_number, floor, self_care_level || null);
    const bed = db.prepare('SELECT * FROM beds WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(bed);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: '该房间床位号已存在' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  const bed = db.prepare('SELECT * FROM beds WHERE id = ?').get(req.params.id);
  if (!bed) {
    return res.status(404).json({ error: '床位不存在' });
  }
  
  const { room_number, bed_number, floor, self_care_level, status } = req.body;
  
  try {
    db.prepare(`
      UPDATE beds SET
        room_number = COALESCE(?, room_number),
        bed_number = COALESCE(?, bed_number),
        floor = COALESCE(?, floor),
        self_care_level = COALESCE(?, self_care_level),
        status = COALESCE(?, status)
      WHERE id = ?
    `).run(room_number, bed_number, floor, self_care_level, status, req.params.id);
    
    const updated = db.prepare('SELECT * FROM beds WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: '该房间床位号已存在' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  const bed = db.prepare('SELECT * FROM beds WHERE id = ?').get(req.params.id);
  if (!bed) {
    return res.status(404).json({ error: '床位不存在' });
  }
  
  if (bed.status === '已分配') {
    return res.status(400).json({ error: '该床位已分配，无法删除' });
  }
  
  db.prepare('DELETE FROM beds WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

module.exports = router;

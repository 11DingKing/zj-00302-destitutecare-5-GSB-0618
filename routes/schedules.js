const express = require("express");
const router = express.Router();
const { db } = require("../database");
const {
  SHIFT_TIMES,
  SHIFTS,
  CAREGIVER_STATUSES,
} = require("../config/constants");

router.get("/", (req, res) => {
  const { caregiver_id, shift_date, shift, status, start_date, end_date } =
    req.query;
  let sql = `
    SELECT s.*, c.name as caregiver_name, c.employee_id, c.care_level, c.phone
    FROM schedules s
    JOIN caregivers c ON s.caregiver_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (caregiver_id) {
    sql += " AND s.caregiver_id = ?";
    params.push(caregiver_id);
  }
  if (shift_date) {
    sql += " AND s.shift_date = ?";
    params.push(shift_date);
  }
  if (shift) {
    sql += " AND s.shift = ?";
    params.push(shift);
  }
  if (status) {
    sql += " AND s.status = ?";
    params.push(status);
  }
  if (start_date) {
    sql += " AND s.shift_date >= ?";
    params.push(start_date);
  }
  if (end_date) {
    sql += " AND s.shift_date <= ?";
    params.push(end_date);
  }
  sql += " ORDER BY s.shift_date ASC, s.shift ASC, c.name ASC";

  const schedules = db.prepare(sql).all(...params);

  const result = schedules.map((s) => ({
    ...s,
    shift_time: SHIFT_TIMES[s.shift],
  }));

  res.json(result);
});

router.get("/weekly", (req, res) => {
  const { date } = req.query;
  const baseDate = date ? new Date(date) : new Date();
  const dayOfWeek = baseDate.getDay();
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const startDate = monday.toISOString().split("T")[0];
  const endDate = sunday.toISOString().split("T")[0];

  const schedules = db
    .prepare(
      `
    SELECT s.*, c.name as caregiver_name, c.employee_id, c.care_level
    FROM schedules s
    JOIN caregivers c ON s.caregiver_id = c.id
    WHERE s.shift_date BETWEEN ? AND ?
    ORDER BY s.shift_date ASC, s.shift ASC, c.name ASC
  `,
    )
    .all(startDate, endDate);

  const byDate = {};
  const shifts = ["早班", "中班", "晚班"];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    byDate[dateStr] = {
      date: dateStr,
      weekday: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
        d.getDay()
      ],
      shifts: {},
    };
    shifts.forEach((shift) => {
      byDate[dateStr].shifts[shift] = [];
    });
  }

  schedules.forEach((s) => {
    if (byDate[s.shift_date] && byDate[s.shift_date].shifts[s.shift]) {
      byDate[s.shift_date].shifts[s.shift].push({
        id: s.id,
        caregiver_id: s.caregiver_id,
        caregiver_name: s.caregiver_name,
        employee_id: s.employee_id,
        care_level: s.care_level,
        status: s.status,
        shift_time: SHIFT_TIMES[s.shift],
      });
    }
  });

  res.json({
    week_start: startDate,
    week_end: endDate,
    shift_times: SHIFT_TIMES,
    schedule_by_date: byDate,
  });
});

router.get("/:id", (req, res) => {
  const schedule = db
    .prepare(
      `
    SELECT s.*, c.name as caregiver_name, c.employee_id, c.care_level, c.phone
    FROM schedules s
    JOIN caregivers c ON s.caregiver_id = c.id
    WHERE s.id = ?
  `,
    )
    .get(req.params.id);

  if (!schedule) {
    return res.status(404).json({ error: "排班记录不存在" });
  }

  const elders = db
    .prepare(
      `
    SELECT e.id, e.name, e.self_care_level, e.status
    FROM elders e
    JOIN caregiver_assignments ca ON e.id = ca.elder_id
    WHERE ca.caregiver_id = ? AND e.status != '已转出'
  `,
    )
    .all(schedule.caregiver_id);

  res.json({
    ...schedule,
    shift_time: SHIFT_TIMES[schedule.shift],
    elders,
  });
});

router.post("/", (req, res) => {
  const { caregiver_id, shift_date, shift, status, notes } = req.body;

  if (!caregiver_id || !shift_date || !shift) {
    return res
      .status(400)
      .json({ error: "请填写必填信息（护理员、日期、班次）" });
  }

  const caregiver = db
    .prepare("SELECT * FROM caregivers WHERE id = ?")
    .get(caregiver_id);
  if (!caregiver) {
    return res.status(404).json({ error: "护理人员不存在" });
  }

  if (caregiver.status !== "在岗") {
    return res.status(400).json({ error: "该护理员不在岗，无法排班" });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO schedules (caregiver_id, shift_date, shift, status, notes)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      caregiver_id,
      shift_date,
      shift,
      status || "正常",
      notes || "",
    );
    const schedule = db
      .prepare(
        `
      SELECT s.*, c.name as caregiver_name, c.employee_id
      FROM schedules s
      JOIN caregivers c ON s.caregiver_id = c.id
      WHERE s.id = ?
    `,
      )
      .get(result.lastInsertRowid);
    res
      .status(201)
      .json({ ...schedule, shift_time: SHIFT_TIMES[schedule.shift] });
  } catch (err) {
    if (err.message.includes("UNIQUE")) {
      return res.status(400).json({ error: "该护理员此日此班次已有排班" });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post("/bulk", (req, res) => {
  const { schedules } = req.body;

  if (!schedules || !Array.isArray(schedules) || schedules.length === 0) {
    return res.status(400).json({ error: "请提供排班数据" });
  }

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO schedules (caregiver_id, shift_date, shift, status, notes)
    VALUES (?, ?, ?, ?, ?)
  `);

  try {
    const tx = db.transaction(() => {
      schedules.forEach((s) => {
        stmt.run(
          s.caregiver_id,
          s.shift_date,
          s.shift,
          s.status || "正常",
          s.notes || "",
        );
      });
    });
    tx();
    res.json({ message: "批量排班成功", count: schedules.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", (req, res) => {
  const schedule = db
    .prepare("SELECT * FROM schedules WHERE id = ?")
    .get(req.params.id);
  if (!schedule) {
    return res.status(404).json({ error: "排班记录不存在" });
  }

  const { shift, status, notes } = req.body;

  db.prepare(
    `
    UPDATE schedules SET
      shift = COALESCE(?, shift),
      status = COALESCE(?, status),
      notes = COALESCE(?, notes)
    WHERE id = ?
  `,
  ).run(shift, status, notes, req.params.id);

  const updated = db
    .prepare(
      `
    SELECT s.*, c.name as caregiver_name, c.employee_id
    FROM schedules s
    JOIN caregivers c ON s.caregiver_id = c.id
    WHERE s.id = ?
  `,
    )
    .get(req.params.id);

  res.json({ ...updated, shift_time: SHIFT_TIMES[updated.shift] });
});

router.delete("/:id", (req, res) => {
  const schedule = db
    .prepare("SELECT * FROM schedules WHERE id = ?")
    .get(req.params.id);
  if (!schedule) {
    return res.status(404).json({ error: "排班记录不存在" });
  }

  db.prepare("DELETE FROM schedules WHERE id = ?").run(req.params.id);
  res.json({ message: "删除成功" });
});

module.exports = router;

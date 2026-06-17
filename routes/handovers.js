const express = require("express");
const router = express.Router();
const { db } = require("../database");
const { SHIFT_TIMES, SHIFTS } = require("../config/constants");

router.get("/", (req, res) => {
  const {
    shift_date,
    shift,
    status,
    outgoing_caregiver_id,
    incoming_caregiver_id,
  } = req.query;
  let sql = `
    SELECT sh.*,
      oc.name as outgoing_caregiver_name,
      oc.employee_id as outgoing_employee_id,
      ic.name as incoming_caregiver_name,
      ic.employee_id as incoming_employee_id
    FROM shift_handovers sh
    JOIN caregivers oc ON sh.outgoing_caregiver_id = oc.id
    LEFT JOIN caregivers ic ON sh.incoming_caregiver_id = ic.id
    WHERE 1=1
  `;
  const params = [];

  if (shift_date) {
    sql += " AND sh.shift_date = ?";
    params.push(shift_date);
  }
  if (shift) {
    sql += " AND sh.shift = ?";
    params.push(shift);
  }
  if (status) {
    sql += " AND sh.status = ?";
    params.push(status);
  }
  if (outgoing_caregiver_id) {
    sql += " AND sh.outgoing_caregiver_id = ?";
    params.push(outgoing_caregiver_id);
  }
  if (incoming_caregiver_id) {
    sql += " AND sh.incoming_caregiver_id = ?";
    params.push(incoming_caregiver_id);
  }
  sql +=
    " ORDER BY sh.shift_date DESC, sh.shift DESC, sh.created_at DESC LIMIT 100";

  const handovers = db.prepare(sql).all(...params);

  const result = handovers.map((h) => ({
    ...h,
    shift_time: SHIFT_TIMES[h.shift],
    is_abnormal:
      h.status === "异常" || h.status === "无人接班" || h.status === "待交接",
  }));

  res.json(result);
});

router.get("/pending", (req, res) => {
  const { caregiver_id, role } = req.query;
  let sql = `
    SELECT sh.*,
      oc.name as outgoing_caregiver_name,
      oc.employee_id as outgoing_employee_id,
      ic.name as incoming_caregiver_name,
      ic.employee_id as incoming_employee_id
    FROM shift_handovers sh
    JOIN caregivers oc ON sh.outgoing_caregiver_id = oc.id
    LEFT JOIN caregivers ic ON sh.incoming_caregiver_id = ic.id
    WHERE 1=1
  `;
  const params = [];

  if (caregiver_id && role) {
    if (role === "outgoing") {
      sql += " AND sh.outgoing_caregiver_id = ? AND sh.status = ?";
      params.push(caregiver_id, "待交接");
    } else if (role === "incoming") {
      sql += " AND sh.incoming_caregiver_id = ? AND sh.status = ?";
      params.push(caregiver_id, "已交接");
    }
  } else {
    sql += " AND sh.status IN (?, ?, ?)";
    params.push("待交接", "已交接", "异常");
  }

  sql += " ORDER BY sh.shift_date ASC, sh.shift ASC";

  const pending = db.prepare(sql).all(...params);

  const result = pending.map((h) => ({
    ...h,
    shift_time: SHIFT_TIMES[h.shift],
    urgency: calculateUrgency(h),
  }));

  res.json(result);
});

router.get("/abnormal", (req, res) => {
  const today = new Date().toISOString().split("T")[0];

  const abnormalHandovers = db
    .prepare(
      `
    SELECT sh.*,
      oc.name as outgoing_caregiver_name,
      oc.employee_id as outgoing_employee_id,
      oc.phone as outgoing_phone,
      ic.name as incoming_caregiver_name,
      ic.employee_id as incoming_employee_id,
      ic.phone as incoming_phone
    FROM shift_handovers sh
    JOIN caregivers oc ON sh.outgoing_caregiver_id = oc.id
    LEFT JOIN caregivers ic ON sh.incoming_caregiver_id = ic.id
    WHERE sh.status IN ('待交接', '异常', '无人接班')
    OR (sh.status = '已交接' AND sh.shift_date = ?)
    ORDER BY sh.shift_date DESC, sh.shift DESC
  `,
    )
    .all(today);

  const scheduledMissing = db
    .prepare(
      `
    SELECT s.*, c.name as caregiver_name, c.employee_id, c.phone, c.care_level
    FROM schedules s
    JOIN caregivers c ON s.caregiver_id = c.id
    WHERE s.shift_date = ? AND s.status = '正常'
    AND NOT EXISTS (
      SELECT 1 FROM shift_handovers sh
      WHERE sh.shift_date = s.shift_date
      AND sh.shift = s.shift
      AND sh.outgoing_caregiver_id = s.caregiver_id
    )
  `,
    )
    .all(today);

  const result = {
    abnormal_handovers: abnormalHandovers.map((h) => ({
      ...h,
      shift_time: SHIFT_TIMES[h.shift],
      alert_level: getAlertLevel(h),
    })),
    missing_handovers: scheduledMissing.map((s) => ({
      ...s,
      shift_time: SHIFT_TIMES[s.shift],
      alert_level: "warning",
      alert_reason: "该班次已有排班但未生成交接记录",
    })),
    summary: {
      total_abnormal: abnormalHandovers.length + scheduledMissing.length,
      pending_handover: abnormalHandovers.filter((h) => h.status === "待交接")
        .length,
      pending_confirm: abnormalHandovers.filter((h) => h.status === "已交接")
        .length,
      no_successor: abnormalHandovers.filter((h) => h.status === "无人接班")
        .length,
      missing_count: scheduledMissing.length,
    },
  };

  res.json(result);
});

router.get("/:id", (req, res) => {
  const handover = db
    .prepare(
      `
    SELECT sh.*,
      oc.name as outgoing_caregiver_name,
      oc.employee_id as outgoing_employee_id,
      oc.phone as outgoing_phone,
      ic.name as incoming_caregiver_name,
      ic.employee_id as incoming_employee_id,
      ic.phone as incoming_phone
    FROM shift_handovers sh
    JOIN caregivers oc ON sh.outgoing_caregiver_id = oc.id
    LEFT JOIN caregivers ic ON sh.incoming_caregiver_id = ic.id
    WHERE sh.id = ?
  `,
    )
    .get(req.params.id);

  if (!handover) {
    return res.status(404).json({ error: "交接班记录不存在" });
  }

  const items = db
    .prepare(
      `
    SELECT hi.*,
      e.name as elder_name,
      e.self_care_level,
      e.health_status,
      b.room_number,
      b.bed_number,
      cr.daily_life,
      cr.medication as record_medication,
      cr.diet,
      cr.physical_condition as record_physical_condition,
      cr.is_abnormal as record_is_abnormal,
      cr.abnormal_description as record_abnormal_description
    FROM handover_elder_items hi
    JOIN elders e ON hi.elder_id = e.id
    LEFT JOIN beds b ON e.bed_id = b.id
    LEFT JOIN care_records cr ON hi.care_record_id = cr.id
    WHERE hi.handover_id = ?
    ORDER BY hi.id ASC
  `,
    )
    .all(req.params.id);

  res.json({
    ...handover,
    shift_time: SHIFT_TIMES[handover.shift],
    elder_items: items,
    elder_count: items.length,
    abnormal_count: items.filter((i) => i.has_abnormal).length,
  });
});

router.post("/", (req, res) => {
  const {
    shift_date,
    shift,
    outgoing_caregiver_id,
    incoming_caregiver_id,
    notes,
    elder_items,
  } = req.body;

  if (!shift_date || !shift || !outgoing_caregiver_id) {
    return res
      .status(400)
      .json({ error: "请填写必填信息（日期、班次、交班人）" });
  }

  const outgoingCg = db
    .prepare("SELECT * FROM caregivers WHERE id = ?")
    .get(outgoing_caregiver_id);
  if (!outgoingCg) {
    return res.status(404).json({ error: "交班护理员不存在" });
  }

  if (incoming_caregiver_id) {
    const incomingCg = db
      .prepare("SELECT * FROM caregivers WHERE id = ?")
      .get(incoming_caregiver_id);
    if (!incomingCg) {
      return res.status(404).json({ error: "接班护理员不存在" });
    }
  }

  if (!elder_items || !Array.isArray(elder_items) || elder_items.length === 0) {
    return res.status(400).json({ error: "请添加老人交接明细" });
  }

  const hasAbnormal = elder_items.some((item) => item.has_abnormal);
  const status = incoming_caregiver_id ? "已交接" : "无人接班";

  try {
    const tx = db.transaction(() => {
      const handoverStmt = db.prepare(`
        INSERT INTO shift_handovers (shift_date, shift, outgoing_caregiver_id, incoming_caregiver_id, status, handover_time, notes)
        VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), ?)
      `);
      const result = handoverStmt.run(
        shift_date,
        shift,
        outgoing_caregiver_id,
        incoming_caregiver_id || null,
        status,
        notes || "",
      );
      const handoverId = result.lastInsertRowid;

      const itemStmt = db.prepare(`
        INSERT INTO handover_elder_items (handover_id, elder_id, care_record_id, medication_summary, physical_condition, has_abnormal, abnormal_description, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      elder_items.forEach((item) => {
        itemStmt.run(
          handoverId,
          item.elder_id,
          item.care_record_id || null,
          item.medication_summary || "",
          item.physical_condition || "",
          item.has_abnormal ? 1 : 0,
          item.has_abnormal ? item.abnormal_description || "" : "",
          item.notes || "",
        );
      });

      return handoverId;
    });

    const handoverId = tx();

    const handover = db
      .prepare(
        `
      SELECT sh.*,
        oc.name as outgoing_caregiver_name,
        ic.name as incoming_caregiver_name
      FROM shift_handovers sh
      JOIN caregivers oc ON sh.outgoing_caregiver_id = oc.id
      LEFT JOIN caregivers ic ON sh.incoming_caregiver_id = ic.id
      WHERE sh.id = ?
    `,
      )
      .get(handoverId);

    const items = db
      .prepare(
        `
      SELECT hi.*, e.name as elder_name
      FROM handover_elder_items hi
      JOIN elders e ON hi.elder_id = e.id
      WHERE hi.handover_id = ?
      ORDER BY hi.id ASC
    `,
      )
      .all(handoverId);

    res.status(201).json({
      ...handover,
      shift_time: SHIFT_TIMES[handover.shift],
      elder_items: items,
      has_abnormal: hasAbnormal,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/confirm", (req, res) => {
  const handover = db
    .prepare("SELECT * FROM shift_handovers WHERE id = ?")
    .get(req.params.id);
  if (!handover) {
    return res.status(404).json({ error: "交接班记录不存在" });
  }

  if (handover.status !== "已交接") {
    return res
      .status(400)
      .json({ error: `当前状态「${handover.status}」无法确认签收` });
  }

  const { incoming_caregiver_id, notes } = req.body;

  if (!incoming_caregiver_id) {
    return res.status(400).json({ error: "请指定接班护理员" });
  }

  const incomingCg = db
    .prepare("SELECT * FROM caregivers WHERE id = ?")
    .get(incoming_caregiver_id);
  if (!incomingCg) {
    return res.status(404).json({ error: "接班护理员不存在" });
  }

  if (
    handover.incoming_caregiver_id &&
    handover.incoming_caregiver_id !== incoming_caregiver_id
  ) {
    return res.status(400).json({ error: "接班护理员与预设不符" });
  }

  db.prepare(
    `
    UPDATE shift_handovers SET
      status = '已签收',
      incoming_caregiver_id = ?,
      confirm_time = datetime('now', 'localtime'),
      notes = COALESCE(?, notes)
    WHERE id = ?
  `,
  ).run(incoming_caregiver_id, notes || null, req.params.id);

  const updated = db
    .prepare(
      `
    SELECT sh.*,
      oc.name as outgoing_caregiver_name,
      ic.name as incoming_caregiver_name
    FROM shift_handovers sh
    JOIN caregivers oc ON sh.outgoing_caregiver_id = oc.id
    JOIN caregivers ic ON sh.incoming_caregiver_id = ic.id
    WHERE sh.id = ?
  `,
    )
    .get(req.params.id);

  const items = db
    .prepare(
      `
    SELECT hi.*, e.name as elder_name
    FROM handover_elder_items hi
    JOIN elders e ON hi.elder_id = e.id
    WHERE hi.handover_id = ?
    ORDER BY hi.id ASC
  `,
    )
    .all(req.params.id);

  res.json({
    ...updated,
    shift_time: SHIFT_TIMES[updated.shift],
    elder_items: items,
  });
});

router.post("/:id/abnormal", (req, res) => {
  const handover = db
    .prepare("SELECT * FROM shift_handovers WHERE id = ?")
    .get(req.params.id);
  if (!handover) {
    return res.status(404).json({ error: "交接班记录不存在" });
  }

  const { reason } = req.body;

  db.prepare(
    `
    UPDATE shift_handovers SET
      status = '异常',
      notes = COALESCE(?, notes)
    WHERE id = ?
  `,
  ).run(reason || null, req.params.id);

  const updated = db
    .prepare("SELECT * FROM shift_handovers WHERE id = ?")
    .get(req.params.id);
  res.json({ ...updated, shift_time: SHIFT_TIMES[updated.shift] });
});

router.put("/:id/items/:itemId", (req, res) => {
  const handover = db
    .prepare("SELECT * FROM shift_handovers WHERE id = ?")
    .get(req.params.id);
  if (!handover) {
    return res.status(404).json({ error: "交接班记录不存在" });
  }

  const item = db
    .prepare(
      "SELECT * FROM handover_elder_items WHERE id = ? AND handover_id = ?",
    )
    .get(req.params.itemId, req.params.id);
  if (!item) {
    return res.status(404).json({ error: "交接明细不存在" });
  }

  const {
    medication_summary,
    physical_condition,
    has_abnormal,
    abnormal_description,
    notes,
  } = req.body;

  const abnormal =
    has_abnormal !== undefined ? (has_abnormal ? 1 : 0) : item.has_abnormal;

  db.prepare(
    `
    UPDATE handover_elder_items SET
      medication_summary = COALESCE(?, medication_summary),
      physical_condition = COALESCE(?, physical_condition),
      has_abnormal = ?,
      abnormal_description = COALESCE(?, abnormal_description),
      notes = COALESCE(?, notes)
    WHERE id = ?
  `,
  ).run(
    medication_summary,
    physical_condition,
    abnormal,
    abnormal_description,
    notes,
    req.params.itemId,
  );

  const updated = db
    .prepare("SELECT * FROM handover_elder_items WHERE id = ?")
    .get(req.params.itemId);
  res.json(updated);
});

function calculateUrgency(handover) {
  if (handover.status === "异常" || handover.status === "无人接班") {
    return "high";
  }
  if (handover.status === "待交接") {
    return "medium";
  }
  return "low";
}

function getAlertLevel(handover) {
  if (handover.status === "异常" || handover.status === "无人接班") {
    return "danger";
  }
  if (handover.status === "待交接") {
    return "warning";
  }
  if (handover.status === "已交接") {
    return "info";
  }
  return "normal";
}

module.exports = router;

const express = require("express");
const router = express.Router();
const { db } = require("../database");
const {
  CARE_RATIO,
  SELF_CARE_LEVELS,
  ELDER_STATUSES,
  ACTIVE_STATUSES,
  SHIFTS,
  getCareRatioInfo,
  isReviewDue,
} = require("../config/constants");

router.get("/overview", (req, res) => {
  const totalElders = db
    .prepare("SELECT COUNT(*) as count FROM elders WHERE status != '已转出'")
    .get().count;
  const inHouse = db
    .prepare("SELECT COUNT(*) as count FROM elders WHERE status = '在住'")
    .get().count;
  const pending = db
    .prepare("SELECT COUNT(*) as count FROM elders WHERE status = '待审核'")
    .get().count;
  const medical = db
    .prepare("SELECT COUNT(*) as count FROM elders WHERE status = '外出就医'")
    .get().count;
  const reviewed = db
    .prepare("SELECT COUNT(*) as count FROM elders WHERE status = '已复核'")
    .get().count;
  const transferred = db
    .prepare("SELECT COUNT(*) as count FROM elders WHERE status = '已转出'")
    .get().count;

  const totalCaregivers = db
    .prepare("SELECT COUNT(*) as count FROM caregivers WHERE status = '在岗'")
    .get().count;
  const totalBeds = db
    .prepare("SELECT COUNT(*) as count FROM beds")
    .get().count;
  const usedBeds = db
    .prepare("SELECT COUNT(*) as count FROM beds WHERE status = '已分配'")
    .get().count;

  const abnormalToday = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM care_records 
    WHERE is_abnormal = 1 AND record_date = date('now', 'localtime')
  `,
    )
    .get().count;

  res.json({
    elders: {
      total: totalElders,
      in_house: inHouse,
      pending,
      medical,
      reviewed,
      transferred,
    },
    caregivers: {
      total: totalCaregivers,
    },
    beds: {
      total: totalBeds,
      used: usedBeds,
      available: totalBeds - usedBeds,
      occupancy_rate:
        totalBeds > 0 ? ((usedBeds / totalBeds) * 100).toFixed(1) + "%" : "0%",
    },
    abnormal_today: abnormalToday,
  });
});

router.get("/by-self-care-level", (req, res) => {
  const levels = SELF_CARE_LEVELS;
  const result = {};

  levels.forEach((level) => {
    const inHouse = db
      .prepare(
        "SELECT COUNT(*) as count FROM elders WHERE self_care_level = ? AND status = '在住'",
      )
      .get(level).count;
    const pending = db
      .prepare(
        "SELECT COUNT(*) as count FROM elders WHERE self_care_level = ? AND status = '待审核'",
      )
      .get(level).count;
    const total = db
      .prepare(
        "SELECT COUNT(*) as count FROM elders WHERE self_care_level = ? AND status != '已转出'",
      )
      .get(level).count;
    result[level] = { in_house: inHouse, pending, total };
  });

  res.json(result);
});

router.get("/care-ratio", (req, res) => {
  const levels = SELF_CARE_LEVELS;
  const result = {};

  levels.forEach((level) => {
    const elderCount = db
      .prepare(
        "SELECT COUNT(*) as count FROM elders WHERE self_care_level = ? AND status IN ('在住', '外出就医', '已复核')",
      )
      .get(level).count;
    const caregiverCount = db
      .prepare(
        "SELECT COUNT(DISTINCT c.id) as count FROM caregivers c WHERE c.care_level = ? AND c.status = '在岗'",
      )
      .get(level).count;

    const ratioInfo = getCareRatioInfo(elderCount, caregiverCount, level);

    const mismatchedElders = db
      .prepare(
        `
      SELECT DISTINCT e.id, e.name, e.self_care_level, e.status
      FROM elders e
      JOIN caregiver_assignments ca ON e.id = ca.elder_id
      JOIN caregivers c ON ca.caregiver_id = c.id
      WHERE e.self_care_level = ? 
        AND e.status IN ('在住', '外出就医', '已复核')
        AND c.care_level != e.self_care_level
      ORDER BY e.name
    `,
      )
      .all(level);

    const mismatchedCaregivers = db
      .prepare(
        `
      SELECT DISTINCT c.id, c.name, c.care_level, c.shift
      FROM caregivers c
      JOIN caregiver_assignments ca ON c.id = ca.caregiver_id
      JOIN elders e ON ca.elder_id = e.id
      WHERE c.care_level = ? 
        AND c.status = '在岗'
        AND e.self_care_level != c.care_level
      ORDER BY c.name
    `,
      )
      .all(level);

    result[level] = {
      ...ratioInfo,
      mismatched_elder_count: mismatchedElders.length,
      mismatched_caregiver_count: mismatchedCaregivers.length,
      mismatched_elders: mismatchedElders,
      mismatched_caregivers: mismatchedCaregivers,
    };
  });

  const overallElderCount = db
    .prepare(
      "SELECT COUNT(*) as count FROM elders WHERE status IN ('在住', '外出就医', '已复核')",
    )
    .get().count;
  let overallRequired = 0;
  let overallActual = 0;
  let overallMismatchedElders = 0;
  let overallMismatchedCaregivers = 0;
  levels.forEach((level) => {
    const levelData = result[level];
    overallRequired += levelData.required_caregivers;
    overallActual += levelData.caregiver_count;
    overallMismatchedElders += levelData.mismatched_elder_count;
    overallMismatchedCaregivers += levelData.mismatched_caregiver_count;
  });
  const overallCompliance =
    overallRequired > 0
      ? ((overallActual / overallRequired) * 100).toFixed(1) + "%"
      : "100%";

  const bedMismatchCount = db
    .prepare(
      `
    SELECT COUNT(*) as count
    FROM elders e
    JOIN beds b ON e.bed_id = b.id
    WHERE e.status IN ('在住', '外出就医', '已复核')
      AND b.self_care_level IS NOT NULL
      AND b.self_care_level != e.self_care_level
  `,
    )
    .get().count;

  res.json({
    by_level: result,
    overall: {
      elder_count: overallElderCount,
      caregiver_count: overallActual,
      required_caregivers: overallRequired,
      compliance_rate: overallCompliance,
      mismatched_elder_count: overallMismatchedElders,
      mismatched_caregiver_count: overallMismatchedCaregivers,
      bed_mismatch_count: bedMismatchCount,
      has_mismatch: overallMismatchedElders > 0 || bedMismatchCount > 0,
    },
  });
});

router.get("/review-completion", (req, res) => {
  const thisYear = new Date().getFullYear();
  const startDate = `${thisYear}-01-01`;
  const endDate = `${thisYear}-12-31`;

  const totalElders = db
    .prepare(
      "SELECT COUNT(*) as count FROM elders WHERE status IN ('在住', '外出就医', '已复核')",
    )
    .get().count;

  const reviewedThisYear = db
    .prepare(
      `
    SELECT COUNT(DISTINCT elder_id) as count 
    FROM qualification_reviews 
    WHERE review_date BETWEEN ? AND ? AND result = '符合'
  `,
    )
    .get(startDate, endDate).count;

  const pendingReview = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM elders e
    LEFT JOIN qualification_reviews qr ON e.id = qr.elder_id
    WHERE e.status IN ('在住', '已复核', '外出就医')
    GROUP BY e.id
    HAVING (MAX(qr.next_review_date) IS NULL OR MAX(qr.next_review_date) <= date('now', 'localtime'))
  `,
    )
    .all().length;

  const totalReviews = db
    .prepare(
      `SELECT COUNT(*) as count FROM qualification_reviews WHERE review_date BETWEEN ? AND ?`,
    )
    .get(startDate, endDate).count;
  const passedReviews = db
    .prepare(
      `SELECT COUNT(*) as count FROM qualification_reviews WHERE review_date BETWEEN ? AND ? AND result = '符合'`,
    )
    .get(startDate, endDate).count;
  const failedReviews = db
    .prepare(
      `SELECT COUNT(*) as count FROM qualification_reviews WHERE review_date BETWEEN ? AND ? AND result = '不符合'`,
    )
    .get(startDate, endDate).count;

  res.json({
    year: thisYear,
    total_elders: totalElders,
    reviewed_count: reviewedThisYear,
    pending_review: pendingReview,
    completion_rate:
      totalElders > 0
        ? ((reviewedThisYear / totalElders) * 100).toFixed(1) + "%"
        : "100%",
    total_reviews: totalReviews,
    passed_reviews: passedReviews,
    failed_reviews: failedReviews,
    pass_rate:
      totalReviews > 0
        ? ((passedReviews / totalReviews) * 100).toFixed(1) + "%"
        : "0%",
  });
});

router.get("/status-distribution", (req, res) => {
  const statuses = ELDER_STATUSES;
  const result = {};

  statuses.forEach((status) => {
    result[status] = db
      .prepare("SELECT COUNT(*) as count FROM elders WHERE status = ?")
      .get(status).count;
  });

  res.json(result);
});

router.get("/handover-completion", (req, res) => {
  const { start_date, end_date } = req.query;
  const today = new Date();
  const defaultEnd = today.toISOString().split("T")[0];
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6);
  const defaultStart = weekAgo.toISOString().split("T")[0];

  const startDate = start_date || defaultStart;
  const endDate = end_date || defaultEnd;

  const shifts = SHIFTS;
  const byShift = {};

  shifts.forEach((shift) => {
    const totalScheduled = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM schedules
      WHERE shift_date BETWEEN ? AND ? AND shift = ? AND status = '正常'
    `,
      )
      .get(startDate, endDate, shift).count;

    const totalHandovers = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM shift_handovers
      WHERE shift_date BETWEEN ? AND ? AND shift = ?
    `,
      )
      .get(startDate, endDate, shift).count;

    const completed = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM shift_handovers
      WHERE shift_date BETWEEN ? AND ? AND shift = ? AND status = '已签收'
    `,
      )
      .get(startDate, endDate, shift).count;

    const submitted = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM shift_handovers
      WHERE shift_date BETWEEN ? AND ? AND shift = ? AND status IN ('已交接', '已签收')
    `,
      )
      .get(startDate, endDate, shift).count;

    const abnormal = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM shift_handovers
      WHERE shift_date BETWEEN ? AND ? AND shift = ? AND status IN ('异常', '无人接班')
    `,
      )
      .get(startDate, endDate, shift).count;

    const handoverRate =
      totalScheduled > 0
        ? ((totalHandovers / totalScheduled) * 100).toFixed(1) + "%"
        : "0%";
    const completionRate =
      totalHandovers > 0
        ? ((completed / totalHandovers) * 100).toFixed(1) + "%"
        : "0%";

    byShift[shift] = {
      scheduled_count: totalScheduled,
      handover_count: totalHandovers,
      completed_count: completed,
      submitted_count: submitted,
      abnormal_count: abnormal,
      handover_rate: handoverRate,
      completion_rate: completionRate,
    };
  });

  const totalScheduled = Object.values(byShift).reduce(
    (sum, s) => sum + s.scheduled_count,
    0,
  );
  const totalHandovers = Object.values(byShift).reduce(
    (sum, s) => sum + s.handover_count,
    0,
  );
  const totalCompleted = Object.values(byShift).reduce(
    (sum, s) => sum + s.completed_count,
    0,
  );
  const totalAbnormal = Object.values(byShift).reduce(
    (sum, s) => sum + s.abnormal_count,
    0,
  );

  const abnormalItems = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM handover_elder_items hi
    JOIN shift_handovers sh ON hi.handover_id = sh.id
    WHERE sh.shift_date BETWEEN ? AND ? AND hi.has_abnormal = 1
  `,
    )
    .get(startDate, endDate).count;

  const overallHandoverRate =
    totalScheduled > 0
      ? ((totalHandovers / totalScheduled) * 100).toFixed(1) + "%"
      : "0%";
  const overallCompletionRate =
    totalHandovers > 0
      ? ((totalCompleted / totalHandovers) * 100).toFixed(1) + "%"
      : "0%";

  const byDate = db
    .prepare(
      `
    SELECT shift_date,
      COUNT(*) as total_count,
      SUM(CASE WHEN status = '已签收' THEN 1 ELSE 0 END) as completed_count,
      SUM(CASE WHEN status IN ('异常', '无人接班') THEN 1 ELSE 0 END) as abnormal_count
    FROM shift_handovers
    WHERE shift_date BETWEEN ? AND ?
    GROUP BY shift_date
    ORDER BY shift_date ASC
  `,
    )
    .all(startDate, endDate);

  const dailyStats = byDate.map((d) => ({
    date: d.shift_date,
    total: d.total_count,
    completed: d.completed_count,
    abnormal: d.abnormal_count,
    completion_rate:
      d.total_count > 0
        ? ((d.completed_count / d.total_count) * 100).toFixed(1) + "%"
        : "0%",
  }));

  res.json({
    period: {
      start_date: startDate,
      end_date: endDate,
    },
    by_shift: byShift,
    overall: {
      scheduled_count: totalScheduled,
      handover_count: totalHandovers,
      completed_count: totalCompleted,
      abnormal_count: totalAbnormal,
      abnormal_item_count: abnormalItems,
      handover_rate: overallHandoverRate,
      completion_rate: overallCompletionRate,
    },
    daily: dailyStats,
  });
});

router.get("/handover-by-caregiver", (req, res) => {
  const { start_date, end_date, care_level } = req.query;
  const today = new Date();
  const defaultEnd = today.toISOString().split("T")[0];
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6);
  const defaultStart = weekAgo.toISOString().split("T")[0];

  const startDate = start_date || defaultStart;
  const endDate = end_date || defaultEnd;

  let caregiverSql = "SELECT * FROM caregivers WHERE status = ?";
  const cgParams = ["在岗"];

  if (care_level) {
    caregiverSql += " AND care_level = ?";
    cgParams.push(care_level);
  }
  caregiverSql += " ORDER BY care_level, name";

  const caregivers = db.prepare(caregiverSql).all(...cgParams);

  const scheduleStmt = db.prepare(`
    SELECT COUNT(*) as count FROM schedules
    WHERE caregiver_id = ? AND shift_date BETWEEN ? AND ? AND status = '正常'
  `);

  const handoverStmt = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = '已签收' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status IN ('异常', '无人接班') THEN 1 ELSE 0 END) as abnormal
    FROM shift_handovers
    WHERE outgoing_caregiver_id = ? AND shift_date BETWEEN ? AND ?
  `);

  const result = caregivers.map((cg) => {
    const schedCount = scheduleStmt.get(cg.id, startDate, endDate).count;
    const handoverStats = handoverStmt.get(cg.id, startDate, endDate);
    const handoverCount = handoverStats.total || 0;
    const completedCount = handoverStats.completed || 0;
    const abnormalCount = handoverStats.abnormal || 0;

    return {
      id: cg.id,
      name: cg.name,
      employee_id: cg.employee_id,
      care_level: cg.care_level,
      scheduled_count: schedCount,
      handover_count: handoverCount,
      completed_count: completedCount,
      abnormal_count: abnormalCount,
      handover_rate:
        schedCount > 0
          ? ((handoverCount / schedCount) * 100).toFixed(1) + "%"
          : "0%",
      completion_rate:
        handoverCount > 0
          ? ((completedCount / handoverCount) * 100).toFixed(1) + "%"
          : "-",
    };
  });

  res.json(result);
});

module.exports = router;

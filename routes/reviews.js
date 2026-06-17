const express = require("express");
const router = express.Router();
const { db } = require("../database");
const {
  ACTIVE_STATUSES,
  REVIEW_RESULTS,
  isReviewDue,
} = require("../config/constants");

router.get("/", (req, res) => {
  const { elder_id, result, review_date } = req.query;
  let sql = `
    SELECT qr.*, e.name as elder_name, e.id_card, e.self_care_level, e.status as elder_status
    FROM qualification_reviews qr
    JOIN elders e ON qr.elder_id = e.id
    WHERE 1=1
  `;
  const params = [];

  if (elder_id) {
    sql += " AND qr.elder_id = ?";
    params.push(elder_id);
  }
  if (result) {
    sql += " AND qr.result = ?";
    params.push(result);
  }
  if (review_date) {
    sql += " AND qr.review_date = ?";
    params.push(review_date);
  }
  sql += " ORDER BY qr.review_date DESC, qr.created_at DESC";

  const reviews = db.prepare(sql).all(...params);
  res.json(reviews);
});

router.get("/pending", (req, res) => {
  const today = new Date().toISOString().split("T")[0];

  const eldersWithReviews = db
    .prepare(
      `
    SELECT e.*, MAX(qr.review_date) as last_review_date, MAX(qr.next_review_date) as next_review_date
    FROM elders e
    LEFT JOIN qualification_reviews qr ON e.id = qr.elder_id
    WHERE e.status IN ('在住', '已复核', '外出就医')
    GROUP BY e.id
    HAVING (next_review_date IS NULL OR next_review_date <= ?)
  `,
    )
    .all(today);

  res.json(eldersWithReviews);
});

router.get("/:id", (req, res) => {
  const review = db
    .prepare(
      `
    SELECT qr.*, e.name as elder_name, e.id_card, e.self_care_level
    FROM qualification_reviews qr
    JOIN elders e ON qr.elder_id = e.id
    WHERE qr.id = ?
  `,
    )
    .get(req.params.id);

  if (!review) {
    return res.status(404).json({ error: "复核记录不存在" });
  }

  res.json(review);
});

router.post("/", (req, res) => {
  const { elder_id, reviewer, result, notes, next_review_date, review_date } =
    req.body;

  if (!elder_id || !reviewer || !result) {
    return res.status(400).json({ error: "请填写必填信息" });
  }

  const elder = db.prepare("SELECT * FROM elders WHERE id = ?").get(elder_id);
  if (!elder) {
    return res.status(404).json({ error: "老人不存在" });
  }

  const tx = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO qualification_reviews (elder_id, reviewer, result, notes, next_review_date, review_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const useDate = review_date || new Date().toISOString().split("T")[0];
    stmt.run(
      elder_id,
      reviewer,
      result,
      notes || "",
      next_review_date || null,
      useDate,
    );

    if (result === "符合") {
      db.prepare(
        `UPDATE elders SET status = '已复核', updated_at = datetime('now', 'localtime') WHERE id = ?`,
      ).run(elder_id);
    } else if (result === "不符合") {
      if (elder.bed_id) {
        db.prepare("UPDATE beds SET status = ? WHERE id = ?").run(
          "空闲",
          elder.bed_id,
        );
      }
      db.prepare("DELETE FROM caregiver_assignments WHERE elder_id = ?").run(
        elder_id,
      );
      db.prepare(
        `
        UPDATE elders SET status = '已转出', bed_id = NULL, transfer_reason = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `,
      ).run("资格复核不符合", elder_id);
    }
  });

  tx();

  res.status(201).json({ message: "复核记录已创建" });
});

router.put("/:id", (req, res) => {
  const review = db
    .prepare("SELECT * FROM qualification_reviews WHERE id = ?")
    .get(req.params.id);
  if (!review) {
    return res.status(404).json({ error: "复核记录不存在" });
  }

  const { reviewer, result, notes, next_review_date } = req.body;

  db.prepare(
    `
    UPDATE qualification_reviews SET
      reviewer = COALESCE(?, reviewer),
      result = COALESCE(?, result),
      notes = COALESCE(?, notes),
      next_review_date = COALESCE(?, next_review_date)
    WHERE id = ?
  `,
  ).run(reviewer, result, notes, next_review_date, req.params.id);

  const updated = db
    .prepare("SELECT * FROM qualification_reviews WHERE id = ?")
    .get(req.params.id);
  res.json(updated);
});

router.delete("/:id", (req, res) => {
  const review = db
    .prepare("SELECT * FROM qualification_reviews WHERE id = ?")
    .get(req.params.id);
  if (!review) {
    return res.status(404).json({ error: "复核记录不存在" });
  }

  db.prepare("DELETE FROM qualification_reviews WHERE id = ?").run(
    req.params.id,
  );
  res.json({ message: "删除成功" });
});

module.exports = router;

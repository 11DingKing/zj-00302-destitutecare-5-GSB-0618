const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { initIfEmpty } = require("./scripts/initData");

const eldersRouter = require("./routes/elders");
const bedsRouter = require("./routes/beds");
const caregiversRouter = require("./routes/caregivers");
const careRecordsRouter = require("./routes/careRecords");
const reviewsRouter = require("./routes/reviews");
const statisticsRouter = require("./routes/statistics");
const schedulesRouter = require("./routes/schedules");
const handoversRouter = require("./routes/handovers");
const dietaryRecordsRouter = require("./routes/dietaryRecords");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

initIfEmpty();

app.get("/", (req, res) => {
  res.json({
    name: "特困人员集中供养中心管理系统",
    version: "1.1.0",
    description: "后端 API 服务",
    endpoints: {
      elders: "/api/elders - 老人管理",
      beds: "/api/beds - 床位管理",
      caregivers: "/api/caregivers - 护理人员管理",
      care_records: "/api/care-records - 护理记录",
      reviews: "/api/reviews - 资格复核",
      schedules: "/api/schedules - 排班管理",
      handovers: "/api/handovers - 交接班管理",
      dietary_records: "/api/dietary-records - 膳食管理",
      statistics: "/api/statistics - 统计报表",
    },
  });
});

app.use("/api/elders", eldersRouter);
app.use("/api/beds", bedsRouter);
app.use("/api/caregivers", caregiversRouter);
app.use("/api/care-records", careRecordsRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/schedules", schedulesRouter);
app.use("/api/handovers", handoversRouter);
app.use("/api/dietary-records", dietaryRecordsRouter);
app.use("/api/statistics", statisticsRouter);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || "服务器内部错误" });
});

app.listen(PORT, () => {
  console.log(`\n🏠 特困人员集中供养中心管理系统已启动`);
  console.log(`📍 服务地址: http://localhost:${PORT}`);
  console.log(`\n📋 API 文档:`);
  console.log(`   GET  /api/elders           - 获取老人列表`);
  console.log(`   POST /api/elders           - 新增老人档案`);
  console.log(
    `   PUT  /api/elders/:id       - 更新老人档案（等级变更自动检测匹配性）`,
  );
  console.log(`   POST /api/elders/:id/check-in - 办理入住`);
  console.log(`   POST /api/elders/:id/change-status - 状态流转`);
  console.log(
    `   POST /api/elders/:id/change-bed - 调床（等级变更后更换匹配床位）`,
  );
  console.log(`   POST /api/elders/:id/reassign-caregivers - 重新分配护理员`);
  console.log(`   GET  /api/elders/mismatch/list - 床位/护理员不匹配老人列表`);
  console.log(`   GET  /api/beds             - 获取床位列表`);
  console.log(`   GET  /api/caregivers       - 获取护理人员列表`);
  console.log(`   GET  /api/care-records     - 获取护理记录`);
  console.log(`   GET  /api/care-records/abnormal - 异常记录`);
  console.log(`   GET  /api/reviews/pending  - 待复核老人`);
  console.log(`   GET  /api/schedules        - 获取排班列表`);
  console.log(`   GET  /api/schedules/weekly - 周排班表`);
  console.log(`   POST /api/schedules        - 创建排班`);
  console.log(`   POST /api/schedules/bulk   - 批量排班`);
  console.log(`   GET  /api/handovers        - 获取交接班记录`);
  console.log(`   GET  /api/handovers/pending - 待交接/待签收列表`);
  console.log(`   GET  /api/handovers/abnormal - 异常交接提醒`);
  console.log(`   POST /api/handovers        - 提交交接班`);
  console.log(`   POST /api/handovers/:id/confirm - 确认签收`);
  console.log(`   GET  /api/dietary-records  - 获取膳食记录`);
  console.log(`   POST /api/dietary-records  - 新增膳食记录`);
  console.log(`   PUT  /api/dietary-records/:id - 更新膳食记录`);
  console.log(`   DELETE /api/dietary-records/:id - 删除膳食记录`);
  console.log(`   GET  /api/statistics/overview - 总览统计`);
  console.log(`   GET  /api/statistics/by-self-care-level - 按自理等级统计`);
  console.log(
    `   GET  /api/statistics/care-ratio - 护理配比统计（含不匹配明细）`,
  );
  console.log(`   GET  /api/statistics/review-completion - 复核完成率`);
  console.log(`   GET  /api/statistics/handover-completion - 交接完成率\n`);
});

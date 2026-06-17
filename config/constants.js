const SELF_CARE_LEVELS = ["自理", "半失能", "失能"];

const CARE_RATIO = {
  自理: 12,
  半失能: 6,
  失能: 3,
};

const ELDER_STATUSES = ["待审核", "在住", "外出就医", "已复核", "已转出"];

const ACTIVE_STATUSES = ["在住", "外出就医", "已复核"];

const STATUS_FLOW = {
  待审核: ["在住", "已转出"],
  在住: ["外出就医", "已复核", "已转出"],
  外出就医: ["在住", "已转出"],
  已复核: ["在住", "已转出"],
  已转出: [],
};

const CAREGIVER_STATUSES = ["在岗", "休假", "离职"];

const SHIFTS = ["早班", "中班", "晚班"];

const SHIFT_TIMES = {
  早班: "06:00-14:00",
  中班: "14:00-22:00",
  晚班: "22:00-06:00",
};

const REVIEW_RESULTS = ["符合", "不符合"];

function canTransitionStatus(fromStatus, toStatus) {
  const allowed = STATUS_FLOW[fromStatus];
  return allowed ? allowed.includes(toStatus) : false;
}

function getRequiredCaregivers(elderCount, careLevel) {
  const ratio = CARE_RATIO[careLevel];
  if (!ratio || elderCount <= 0) return 0;
  return Math.ceil(elderCount / ratio);
}

function getCareRatioInfo(elderCount, caregiverCount, careLevel) {
  const standardRatio = CARE_RATIO[careLevel];
  const requiredCaregivers = getRequiredCaregivers(elderCount, careLevel);
  const actualRatio =
    caregiverCount > 0 ? (elderCount / caregiverCount).toFixed(1) : "-";
  const isCompliant = caregiverCount >= requiredCaregivers;
  const complianceRate =
    requiredCaregivers > 0
      ? ((caregiverCount / requiredCaregivers) * 100).toFixed(1) + "%"
      : elderCount === 0
        ? "100%"
        : "0%";

  return {
    elder_count: elderCount,
    caregiver_count: caregiverCount,
    standard_ratio: `1:${standardRatio}`,
    actual_ratio: actualRatio !== "-" ? `1:${actualRatio}` : "-",
    required_caregivers: requiredCaregivers,
    is_compliant: isCompliant,
    compliance_rate: complianceRate,
  };
}

function isReviewDue(nextReviewDate) {
  if (!nextReviewDate) return true;
  const today = new Date().toISOString().split("T")[0];
  return nextReviewDate <= today;
}

module.exports = {
  SELF_CARE_LEVELS,
  CARE_RATIO,
  ELDER_STATUSES,
  ACTIVE_STATUSES,
  STATUS_FLOW,
  CAREGIVER_STATUSES,
  SHIFTS,
  SHIFT_TIMES,
  REVIEW_RESULTS,
  canTransitionStatus,
  getRequiredCaregivers,
  getCareRatioInfo,
  isReviewDue,
};

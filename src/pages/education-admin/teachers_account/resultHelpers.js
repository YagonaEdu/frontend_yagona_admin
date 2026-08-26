import { formatDate } from "@/utils/format";

export function scoreTone(pct) {
  if (pct == null) return "neutral";
  if (pct >= 85) return "good";
  if (pct >= 70) return "ok";
  return "low";
}

export function percentOfMax(score, maxScore) {
  if (score == null) return null;
  const max = Number(maxScore);
  if (max > 0) return Math.min(100, Math.round((Number(score) / max) * 100));
  const raw = Math.round(Number(score));
  return raw > 100 ? 100 : raw;
}

export function averageScore(graded = []) {
  if (!graded.length) return null;
  const values = graded
    .map((row) => percentOfMax(row.score, row.maxScore ?? row.max_score))
    .filter((value) => value != null);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Real trend only with enough graded history (4+). */
export function computeTrend(gradedSortedAsc = []) {
  if (gradedSortedAsc.length < 4) return null;
  const mid = Math.floor(gradedSortedAsc.length / 2);
  const first = gradedSortedAsc.slice(0, mid);
  const second = gradedSortedAsc.slice(mid);
  const a = averageScore(first);
  const b = averageScore(second);
  if (a == null || b == null) return null;
  const delta = b - a;
  if (Math.abs(delta) < 3) return { delta: 0, label: "→ без изменений", tone: "neutral" };
  if (delta > 0) return { delta, label: `↑ +${delta}%`, tone: "good" };
  return { delta, label: `↓ ${delta}%`, tone: "low" };
}

export function periodRange(period) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  if (period === "7d") {
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  if (period === "30d") {
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  if (period === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  return { start: null, end: null };
}

export function inPeriod(iso, range) {
  if (!range?.start) return true;
  if (!iso) return false;
  const d = new Date(iso).getTime();
  return d >= range.start.getTime() && d <= range.end.getTime();
}

export function studentResultReasons({
  avg,
  missingCount,
  attendancePct,
  trend,
  gradedCount,
}) {
  const reasons = [];
  if (gradedCount === 0) {
    reasons.push("Недостаточно данных");
    return reasons;
  }
  if (avg != null && avg < 60) reasons.push("Низкий средний балл");
  if (missingCount > 0) {
    reasons.push(missingCount === 1 ? "1 задание не сдано" : `${missingCount} задания не сданы`);
  }
  if (attendancePct != null && attendancePct < 75) reasons.push("Низкая посещаемость");
  if (trend && trend.delta < -5) reasons.push("Результат снизился");
  return reasons;
}

export function reasonChipTone(text = "") {
  const value = text.toLowerCase();
  if (value.includes("низк") || value.includes("сниз")) return "warn";
  if (value.includes("не сдан")) return "warn";
  if (value.includes("данных")) return "muted";
  return "info";
}

export function hardAssignments(assignments = [], submissions = [], range) {
  return assignments
    .filter((row) => row.status === "published" || row.status === "closed")
    .map((assignment) => {
      const rows = submissions.filter(
        (sub) =>
          String(sub.assignment) === String(assignment.id) &&
          sub.status === "graded" &&
          sub.score != null &&
          inPeriod(sub.graded_at || sub.submitted_at, range),
      );
      if (rows.length < 3) return null;
      const withMax = rows.map((row) => ({
        ...row,
        maxScore: assignment.max_score,
      }));
      const avg = averageScore(withMax);
      const below60 = withMax.filter((row) => percentOfMax(row.score, assignment.max_score) < 60).length;
      const missing = Number(assignment.missing_count || 0);
      if (avg == null) return null;
      if (avg >= 70 && below60 < Math.ceil(rows.length * 0.35) && missing === 0) return null;
      return {
        id: assignment.id,
        title: assignment.title,
        group: assignment.group,
        avg,
        below60,
        totalGraded: rows.length,
        missing,
        assignment,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 5);
}

export function formatScoreLabel(score, maxScore) {
  if (score == null) return "—";
  if (maxScore) return `${score} / ${maxScore}`;
  return String(score);
}

export function formatGradedWhen(iso) {
  if (!iso) return "—";
  return formatDate(iso);
}

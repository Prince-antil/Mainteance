// ================================================================
// CCPL CMMS — Analytics & Auto-Calculation Engine
// Pure functions over store state. Nothing here is hardcoded —
// every KPI, trend, notification and AI insight is derived live
// from machines / breakdowns / PMs / energy logs. Components call
// these inside useMemo keyed on the reactive store version.
// ================================================================

export const HOURS_PER_MONTH = 720; // 30-day operating window per machine

// ---------------- date helpers ----------------
export const monthKey = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
};

export function lastNMonths(n = 6) {
  const out = [];
  const nowD = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(nowD.getFullYear(), nowD.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-GB', { month: 'short' }),
      full: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    });
  }
  return out;
}

const isThisMonth = (d) => d && monthKey(d) === monthKey(new Date());
const isToday = (d) => d && new Date(d).toDateString() === new Date().toDateString();
const daysBetween = (a, b) => (new Date(a) - new Date(b)) / 86400000;

// ---------------- machine health ----------------
/**
 * Health % per machine: starts at 100, penalised by recent breakdowns
 * (last 90 days), accumulated downtime and overdue PMs.
 */
export function machineHealth(machine, breakdowns, pms) {
  const cutoff = Date.now() - 90 * 86400000;
  const recent = breakdowns.filter(
    (b) => b.machineId === machine.id && new Date(b.createdAt).getTime() > cutoff
  );
  const downtime = recent.reduce((s, b) => s + (b.totalDowntimeHrs || 0), 0);
  const overdue = pms.filter(
    (p) => p.machineId === machine.id && p.status !== 'completed' && new Date(p.pmDate) < new Date()
  ).length;
  let health = 100 - recent.length * 8 - downtime * 1.5 - overdue * 6;
  if (machine.status === 'breakdown') health -= 15;
  return Math.max(5, Math.min(100, Math.round(health)));
}

export const healthBand = (h) => (h >= 75 ? 'good' : h >= 50 ? 'fair' : 'poor');

// ---------------- reliability metrics ----------------
/** MTTR (hrs) = total downtime / closed breakdowns, over an optional month key. */
export function computeMTTR(breakdowns, mKey = null) {
  const closed = breakdowns.filter(
    (b) => b.status === 'closed' && (!mKey || monthKey(b.createdAt) === mKey)
  );
  if (!closed.length) return 0;
  const total = closed.reduce((s, b) => s + (b.totalDowntimeHrs || 0), 0);
  return Math.round((total / closed.length) * 10) / 10;
}

/** MTBF (hrs) = (operating hours − downtime) / breakdown count for the period. */
export function computeMTBF(breakdowns, machineCount, mKey = null) {
  const list = breakdowns.filter((b) => !mKey || monthKey(b.createdAt) === mKey);
  if (!list.length || !machineCount) return 0;
  const downtime = list.reduce((s, b) => s + (b.totalDowntimeHrs || 0), 0);
  const operating = machineCount * HOURS_PER_MONTH - downtime;
  return Math.max(0, Math.round(operating / list.length));
}

/** Availability % = (planned hours − downtime) / planned hours for the period. */
export function computeAvailability(breakdowns, machineCount, mKey = null) {
  if (!machineCount) return 100;
  const planned = machineCount * HOURS_PER_MONTH;
  const downtime = breakdowns
    .filter((b) => !mKey || monthKey(b.createdAt) === mKey)
    .reduce((s, b) => s + (b.totalDowntimeHrs || 0), 0);
  return Math.max(0, Math.round(((planned - downtime) / planned) * 1000) / 10);
}

// ---------------- PM statistics ----------------
export function pmStats(pms) {
  const nowD = new Date();
  const in7 = new Date(Date.now() + 7 * 86400000);
  const completed = pms.filter((p) => p.status === 'completed');
  const pending = pms.filter((p) => p.status !== 'completed');
  const overdue = pending.filter((p) => new Date(p.pmDate) < nowD);
  const upcoming = pending.filter((p) => {
    const d = new Date(p.pmDate);
    return d >= nowD && d <= in7;
  });
  const dueThisMonth = pms.filter((p) => isThisMonth(p.pmDate));
  const doneThisMonth = dueThisMonth.filter((p) => p.status === 'completed');
  const compliance = dueThisMonth.length
    ? Math.round((doneThisMonth.length / dueThisMonth.length) * 100)
    : 100;
  return {
    total: pms.length,
    completed: completed.length,
    pending: pending.length,
    overdue,
    upcoming,
    dueThisMonth: dueThisMonth.length,
    compliance,
  };
}

// ---------------- dashboard KPIs ----------------
export function computeKPIs(state, totalDocuments = 0) {
  const { machines, breakdowns, pms, energy } = state;
  const running = machines.filter((m) => m.status === 'running').length;
  const maint = machines.filter((m) => m.status === 'maintenance').length;
  const down = machines.filter((m) => m.status === 'breakdown').length;
  const openBDs = breakdowns.filter((b) => b.status === 'open');
  const pm = pmStats(pms);
  const energyToday = energy
    .filter((e) => isToday(e.date || e.createdAt))
    .reduce((s, e) => s + (e.kwh || 0), 0);
  const machineDocs = machines.reduce((s, m) => s + (m.docs?.length || 0), 0);
  return {
    machineCount: machines.length,
    running,
    underMaintenance: maint,
    breakdown: down,
    pmDue: pm.pending,
    pmCompleted: pm.completed,
    pmPending: pm.pending,
    pmOverdue: pm.overdue.length,
    pmCompliance: pm.compliance,
    availability: computeAvailability(breakdowns, machines.length, monthKey(new Date())),
    mttr: computeMTTR(breakdowns),
    mtbf: computeMTBF(breakdowns, machines.length, monthKey(new Date())),
    totalDocuments: totalDocuments + machineDocs,
    energyToday: Math.round(energyToday),
    openWorkOrders: openBDs.length + pm.pending,
    breakdownsThisMonth: breakdowns.filter((b) => isThisMonth(b.createdAt)).length,
    avgDowntime: computeMTTR(breakdowns), // avg repair time == MTTR by definition here
  };
}

// ---------------- chart series (all 10 charts) ----------------
export function monthlyBreakdownTrend(breakdowns, n = 6) {
  return lastNMonths(n).map((m) => ({
    label: m.label,
    count: breakdowns.filter((b) => monthKey(b.createdAt) === m.key).length,
    downtime:
      Math.round(
        breakdowns
          .filter((b) => monthKey(b.createdAt) === m.key)
          .reduce((s, b) => s + (b.totalDowntimeHrs || 0), 0) * 10
      ) / 10,
  }));
}

export function monthlyPMCompletion(pms, n = 6) {
  return lastNMonths(n).map((m) => {
    const due = pms.filter((p) => monthKey(p.pmDate) === m.key);
    return {
      label: m.label,
      completed: due.filter((p) => p.status === 'completed').length,
      pending: due.filter((p) => p.status !== 'completed').length,
    };
  });
}

export function equipmentWiseBreakdown(breakdowns, machines) {
  const counts = {};
  breakdowns.forEach((b) => {
    counts[b.machineId] = (counts[b.machineId] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([id, count]) => ({
      label: machines.find((m) => m.id === id)?.name || 'Removed machine',
      count,
      downtime:
        Math.round(
          breakdowns
            .filter((b) => b.machineId === id)
            .reduce((s, b) => s + (b.totalDowntimeHrs || 0), 0) * 10
        ) / 10,
    }))
    .sort((a, b) => b.count - a.count);
}

/** Pareto: top-10 machines by breakdown count + cumulative % line. */
export function paretoTop10(breakdowns, machines) {
  const rows = equipmentWiseBreakdown(breakdowns, machines).slice(0, 10);
  const total = rows.reduce((s, r) => s + r.count, 0) || 1;
  let cum = 0;
  return rows.map((r) => {
    cum += r.count;
    return { ...r, cumulative: Math.round((cum / total) * 100) };
  });
}

export function breakdownByDepartment(breakdowns, machines) {
  const counts = {};
  breakdowns.forEach((b) => {
    const m = machines.find((x) => x.id === b.machineId);
    const dept = b.department || m?.department || m?.section || 'Unassigned';
    counts[dept] = (counts[dept] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function monthlyEnergy(energy, n = 6) {
  return lastNMonths(n).map((m) => ({
    label: m.label,
    kwh: Math.round(
      energy
        .filter((e) => monthKey(e.date || e.createdAt) === m.key)
        .reduce((s, e) => s + (e.kwh || 0), 0)
    ),
  }));
}

export function healthDistribution(machines, breakdowns, pms) {
  const bands = { good: 0, fair: 0, poor: 0 };
  machines.forEach((m) => {
    bands[healthBand(machineHealth(m, breakdowns, pms))] += 1;
  });
  return [
    { label: 'Healthy (75-100%)', value: bands.good, color: '#10B981' },
    { label: 'Fair (50-74%)', value: bands.fair, color: '#F59E0B' },
    { label: 'Poor (<50%)', value: bands.poor, color: '#EF4444' },
  ];
}

export function availabilityTrend(breakdowns, machineCount, n = 6) {
  return lastNMonths(n).map((m) => ({
    label: m.label,
    value: computeAvailability(breakdowns, machineCount, m.key),
  }));
}

export function mttrTrend(breakdowns, n = 6) {
  return lastNMonths(n).map((m) => ({ label: m.label, value: computeMTTR(breakdowns, m.key) }));
}

export function mtbfTrend(breakdowns, machineCount, n = 6) {
  return lastNMonths(n).map((m) => ({
    label: m.label,
    value: computeMTBF(breakdowns, machineCount, m.key),
  }));
}

// ---------------- notifications ----------------
export function buildNotifications(state) {
  const { machines, breakdowns, pms } = state;
  const notifs = [];
  const pm = pmStats(pms);

  pm.overdue.forEach((p) =>
    notifs.push({
      id: `n-pmover-${p.id}`,
      type: 'danger',
      title: 'PM Overdue',
      detail: `${machines.find((m) => m.id === p.machineId)?.name || 'Machine'} · ${p.frequency} PM was due ${new Date(p.pmDate).toLocaleDateString('en-GB')}`,
      ts: p.pmDate,
    })
  );
  pm.upcoming.forEach((p) =>
    notifs.push({
      id: `n-pmup-${p.id}`,
      type: 'info',
      title: 'Upcoming PM',
      detail: `${machines.find((m) => m.id === p.machineId)?.name || 'Machine'} · ${p.frequency} PM due ${new Date(p.pmDate).toLocaleDateString('en-GB')}`,
      ts: p.pmDate,
    })
  );
  breakdowns
    .filter((b) => b.status === 'open')
    .forEach((b) =>
      notifs.push({
        id: `n-bd-${b.id}`,
        type: 'danger',
        title: 'Open Breakdown',
        detail: `${b.complaintNo} · ${machines.find((m) => m.id === b.machineId)?.name || ''} — ${b.problem || 'reported'}`,
        ts: b.createdAt,
      })
    );
  machines.forEach((m) => {
    const h = machineHealth(m, breakdowns, pms);
    if (h < 50)
      notifs.push({
        id: `n-health-${m.id}`,
        type: 'warning',
        title: 'Low Machine Health',
        detail: `${m.name} health has dropped to ${h}% — inspection recommended`,
        ts: new Date().toISOString(),
      });
  });
  const avail = computeAvailability(breakdowns, machines.length, monthKey(new Date()));
  if (avail < 90 && machines.length)
    notifs.push({
      id: 'n-avail',
      type: 'warning',
      title: 'Low Plant Availability',
      detail: `Plant availability is ${avail}% this month — review open downtime events`,
      ts: new Date().toISOString(),
    });
  return notifs.sort((a, b) => new Date(b.ts) - new Date(a.ts));
}

// ---------------- AI insights & recommendations ----------------
const FAULT_HINTS = [
  { rx: /bearing|vibrat/i, tip: 'checking bearings and lubrication schedule' },
  { rx: /gear|align/i, tip: 'checking gearbox alignment and coupling wear' },
  { rx: /motor|winding|burn/i, tip: 'megger-testing the motor windings and verifying overload settings' },
  { rx: /belt|chain/i, tip: 'inspecting belt/chain tension and sprocket wear' },
  { rx: /heat|temp/i, tip: 'verifying cooling circuits and thermal overload calibration' },
  { rx: /leak|seal/i, tip: 'replacing seals and pressure-testing the circuit' },
  { rx: /sensor|plc|electr/i, tip: 'auditing sensors, wiring terminations and PLC I/O' },
];

function faultTip(texts) {
  for (const { rx, tip } of FAULT_HINTS) if (texts.some((t) => rx.test(t))) return tip;
  return 'a detailed root-cause analysis with the OEM checklist';
}

/**
 * Rule-based analytics: scans live data and produces ranked insights
 * with actionable recommendations, mimicking an AI reliability analyst.
 */
export function buildInsights(state) {
  const { machines, breakdowns, pms } = state;
  const insights = [];
  if (!machines.length) return insights;

  const equip = equipmentWiseBreakdown(breakdowns, machines);
  const monthBDs = breakdowns.filter((b) => isThisMonth(b.createdAt));

  // 1. Most problematic machine (this month first, else overall)
  const problemCounts = {};
  (monthBDs.length ? monthBDs : breakdowns).forEach((b) => {
    problemCounts[b.machineId] = (problemCounts[b.machineId] || 0) + 1;
  });
  const worstId = Object.keys(problemCounts).sort((a, b) => problemCounts[b] - problemCounts[a])[0];
  if (worstId && problemCounts[worstId] >= 2) {
    const m = machines.find((x) => x.id === worstId);
    const its = breakdowns.filter((b) => b.machineId === worstId);
    const tip = faultTip(its.map((b) => `${b.problem || ''} ${b.rootCause || ''}`));
    insights.push({
      id: 'ai-problematic',
      severity: 'high',
      title: 'Most Problematic Machine',
      text: `${m?.name || 'A machine'} has experienced ${problemCounts[worstId]} breakdowns ${monthBDs.length ? 'this month' : 'to date'}. Recommend ${tip}.`,
    });
  }

  // 2. Highest downtime machine
  const byDowntime = [...equip].sort((a, b) => b.downtime - a.downtime)[0];
  if (byDowntime && byDowntime.downtime > 0) {
    insights.push({
      id: 'ai-downtime',
      severity: 'high',
      title: 'Highest Downtime',
      text: `${byDowntime.label} has accumulated ${byDowntime.downtime} hrs of downtime. Prioritise it in the next planned maintenance window.`,
    });
  }

  // 3. Recurring fault pattern across the plant
  const causes = {};
  breakdowns.forEach((b) => {
    const c = (b.rootCause || '').trim().toLowerCase();
    if (c) causes[c] = (causes[c] || 0) + 1;
  });
  const topCause = Object.keys(causes).sort((a, b) => causes[b] - causes[a])[0];
  if (topCause && causes[topCause] >= 2) {
    insights.push({
      id: 'ai-cause',
      severity: 'medium',
      title: 'Recurring Root Cause',
      text: `"${topCause}" appears in ${causes[topCause]} breakdown reports. Consider a plant-wide corrective action and operator training on this failure mode.`,
    });
  }

  // 4. Lowest availability / replacement candidate via health score
  const scored = machines
    .map((m) => ({ m, h: machineHealth(m, breakdowns, pms) }))
    .sort((a, b) => a.h - b.h);
  const weakest = scored[0];
  if (weakest && weakest.h < 50) {
    insights.push({
      id: 'ai-replace',
      severity: 'high',
      title: 'Replacement / Overhaul Candidate',
      text: `${weakest.m.name} health is down to ${weakest.h}%. Repeated failures suggest evaluating a major overhaul or replacement in the next CAPEX cycle.`,
    });
  } else if (weakest && weakest.h < 75) {
    insights.push({
      id: 'ai-watch',
      severity: 'medium',
      title: 'Machine on Watchlist',
      text: `${weakest.m.name} health is ${weakest.h}% — schedule a condition-monitoring check before it degrades further.`,
    });
  }

  // 5. PM discipline
  const pm = pmStats(pms);
  if (pm.overdue.length) {
    const names = pm.overdue
      .slice(0, 3)
      .map((p) => machines.find((m) => m.id === p.machineId)?.name || 'machine')
      .join(', ');
    insights.push({
      id: 'ai-pmoverdue',
      severity: 'medium',
      title: 'PM Overdue',
      text: `${pm.overdue.length} preventive task${pm.overdue.length > 1 ? 's are' : ' is'} overdue (${names}). Overdue PM is the leading driver of unplanned downtime.`,
    });
  }

  // 6. Monthly performance summary
  const avail = computeAvailability(breakdowns, machines.length, monthKey(new Date()));
  const mttr = computeMTTR(breakdowns, monthKey(new Date()));
  insights.push({
    id: 'ai-summary',
    severity: 'info',
    title: 'Monthly Performance Summary',
    text: `${monthBDs.length} breakdown${monthBDs.length === 1 ? '' : 's'} logged this month · plant availability ${avail}% · MTTR ${mttr} hrs · PM compliance ${pm.compliance}%. ${
      avail >= 95 && pm.compliance >= 90
        ? 'Plant reliability is on target — maintain the current PM cadence.'
        : 'Focus on closing open work orders and clearing the PM backlog to lift availability.'
    }`,
  });

  return insights;
}

import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store.js';
import {
  machineHealth, equipmentWiseBreakdown, paretoTop10, availabilityTrend,
  mttrTrend, mtbfTrend, monthlyBreakdownTrend, monthlyEnergy, pmStats,
  computeKPIs, monthKey, lastNMonths,
} from '../analytics.js';
import { api } from '../api.js';
import EmptyState from '../components/EmptyState.jsx';
import { exportToCSV } from '../utils.js';
import { COMPANY_NAME } from '../constants.js';
import {
  FileBarChart2, Download, FileSpreadsheet, FileText, Printer,
  Factory, ClipboardCheck, AlertOctagon, Zap, History, Lightbulb,
  ShieldCheck, Timer, Gauge, TimerReset, TrendingUp, CalendarRange, CalendarDays,
} from 'lucide-react';

// ---------- export engines ----------
const cellValue = (col, row) => String(col.value ? col.value(row) : row[col.key] ?? '');

function tableHTML(title, columns, rows) {
  const head = columns.map((c) => `<th>${c.label}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${columns.map((c) => `<td>${cellValue(c, r).replace(/</g, '&lt;')}</td>`).join('')}</tr>`)
    .join('');
  return `
    <h2 style="font-family:Arial;margin-bottom:2px;">${title}</h2>
    <p style="font-family:Arial;font-size:11px;color:#555;margin-top:0;">${COMPANY_NAME} — Nathupur Unit · Generated ${new Date().toLocaleString('en-GB')}</p>
    <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-family:Arial;font-size:12px;width:100%;">
      <thead style="background:#0F766E;color:#fff;"><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

function exportExcel(title, columns, rows, filename) {
  const blob = new Blob(
    ['\uFEFF<html><head><meta charset="utf-8" /></head><body>' + tableHTML(title, columns, rows) + '</body></html>'],
    { type: 'application/vnd.ms-excel' }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPDF(title, columns, rows) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(
    `<html><head><title>${title}</title><style>@media print { @page { size: landscape; margin: 12mm; } } tr:nth-child(even){background:#f4f7f7;}</style></head><body>` +
    tableHTML(title, columns, rows) +
    '</body></html>'
  );
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');

export default function Reports() {
  const store = useStore();
  const { machines, breakdowns, pms, energy } = store;
  const [active, setActive] = useState('equipment');
  const [serverDocs, setServerDocs] = useState([]);

  useEffect(() => {
    api.getReports({ limit: 500 }).then((r) => setServerDocs(r.data || [])).catch(() => {});
  }, []);

  const machineName = (id) => machines.find((m) => m.id === id)?.name || '—';

  // Every report definition builds its rows live from stored data
  const REPORTS = useMemo(() => {
    const stats = pmStats(pms);
    const kpi = computeKPIs(store, serverDocs.length);
    const docRows = (cat) => serverDocs
      .filter((d) => d.category_name === cat)
      .map((d) => ({ filename: d.filename, section: d.plant_section, month: `${d.reporting_month} ${d.reporting_year}`, by: d.uploader_name, on: fmtDate(d.uploaded_at) }));
    const DOC_COLS = [
      { key: 'filename', label: 'Document' }, { key: 'section', label: 'Plant Section' },
      { key: 'month', label: 'Reporting Period' }, { key: 'by', label: 'Uploaded By' }, { key: 'on', label: 'Uploaded On' },
    ];
    const TREND_COLS = (label) => [
      { key: 'label', label: 'Month' }, { key: 'value', label },
    ];
    const summaryRows = (months) => months.map((m) => {
      const bds = breakdowns.filter((b) => monthKey(b.createdAt) === m.key);
      const due = pms.filter((p) => monthKey(p.pmDate) === m.key);
      const done = due.filter((p) => p.status === 'completed');
      return {
        month: m.full,
        breakdowns: bds.length,
        downtime: Math.round(bds.reduce((s, b) => s + (b.totalDowntimeHrs || 0), 0) * 10) / 10,
        pmDue: due.length,
        pmDone: done.length,
        compliance: due.length ? Math.round((done.length / due.length) * 100) + '%' : '—',
        energy: Math.round(energy.filter((e) => monthKey(e.date || e.createdAt) === m.key).reduce((s, e) => s + e.kwh, 0)),
      };
    });
    const SUMMARY_COLS = [
      { key: 'month', label: 'Period' }, { key: 'breakdowns', label: 'Breakdowns' },
      { key: 'downtime', label: 'Downtime (hrs)' }, { key: 'pmDue', label: 'PM Due' },
      { key: 'pmDone', label: 'PM Completed' }, { key: 'compliance', label: 'PM Compliance' },
      { key: 'energy', label: 'Energy (kWh)' },
    ];

    return [
      {
        id: 'equipment', label: 'Equipment Report', icon: Factory, desc: 'Full asset register with specs & health',
        columns: [
          { key: 'machineCode', label: 'Machine ID' }, { key: 'name', label: 'Machine' },
          { key: 'section', label: 'Section' }, { key: 'department', label: 'Department' },
          { key: 'manufacturer', label: 'Manufacturer' }, { key: 'model', label: 'Model' },
          { key: 'status', label: 'Status' }, { key: 'runningHours', label: 'Run Hrs' },
          { label: 'Health %', value: (m) => machineHealth(m, breakdowns, pms) },
        ],
        rows: machines,
      },
      {
        id: 'pm', label: 'PM Report', icon: ClipboardCheck, desc: `Compliance ${stats.compliance}% · ${stats.overdue.length} overdue`,
        columns: [
          { label: 'Machine', value: (p) => machineName(p.machineId) },
          { key: 'frequency', label: 'Frequency' },
          { label: 'PM Date', value: (p) => fmtDate(p.pmDate) },
          { key: 'engineer', label: 'Engineer' }, { key: 'status', label: 'Status' },
          { label: 'Completion %', value: (p) => p.completionPct ?? (p.status === 'completed' ? 100 : 0) },
          { key: 'timeTakenHrs', label: 'Time (hrs)' }, { key: 'remarks', label: 'Remarks' },
        ],
        rows: pms,
      },
      {
        id: 'breakdown', label: 'Breakdown Report', icon: AlertOctagon, desc: 'All corrective work orders with RCA',
        columns: [
          { key: 'complaintNo', label: 'Complaint No' },
          { label: 'Machine', value: (b) => machineName(b.machineId) },
          { key: 'department', label: 'Department' }, { key: 'problem', label: 'Problem' },
          { key: 'engineer', label: 'Engineer' }, { key: 'priority', label: 'Priority' },
          { key: 'rootCause', label: 'Root Cause' }, { key: 'actionTaken', label: 'Action Taken' },
          { key: 'totalDowntimeHrs', label: 'Downtime (hrs)' }, { key: 'status', label: 'Status' },
        ],
        rows: breakdowns,
      },
      {
        id: 'energy', label: 'Energy Report', icon: Zap, desc: 'DG / solar / grid consumption logs',
        columns: [
          { label: 'Date', value: (e) => fmtDate(e.date) }, { key: 'source', label: 'Source' },
          { key: 'kwh', label: 'kWh' }, { key: 'remarks', label: 'Remarks' },
        ],
        rows: energy,
      },
      {
        id: 'history', label: 'Machine History', icon: History, desc: 'Lifetime service record per machine',
        columns: [
          { key: 'machine', label: 'Machine' }, { key: 'event', label: 'Event' },
          { key: 'date', label: 'Date' }, { key: 'detail', label: 'Detail' },
        ],
        rows: [
          ...breakdowns.map((b) => ({ machine: machineName(b.machineId), event: `Breakdown ${b.complaintNo}`, date: fmtDate(b.createdAt), detail: `${b.problem || ''} — ${b.status === 'closed' ? `${b.totalDowntimeHrs} hrs · ${b.actionTaken || ''}` : 'open'}` })),
          ...pms.filter((p) => p.status === 'completed').map((p) => ({ machine: machineName(p.machineId), event: `${p.frequency} PM`, date: fmtDate(p.completedAt || p.pmDate), detail: `${p.engineer || ''} · ${p.timeTakenHrs || 0} hrs` })),
        ],
      },
      {
        id: 'downtime', label: 'Downtime Report', icon: Timer, desc: 'Downtime hours accumulated per machine',
        columns: [
          { key: 'label', label: 'Machine' }, { key: 'count', label: 'Breakdowns' }, { key: 'downtime', label: 'Downtime (hrs)' },
        ],
        rows: equipmentWiseBreakdown(breakdowns, machines),
      },
      {
        id: 'availability', label: 'Availability Report', icon: Gauge, desc: `Current month ${kpi.availability}%`,
        columns: TREND_COLS('Availability %'), rows: availabilityTrend(breakdowns, machines.length, 12),
      },
      {
        id: 'mtbf', label: 'MTBF Report', icon: TrendingUp, desc: `Current ${kpi.mtbf} hrs between failures`,
        columns: TREND_COLS('MTBF (hrs)'), rows: mtbfTrend(breakdowns, machines.length, 12),
      },
      {
        id: 'mttr', label: 'MTTR Report', icon: TimerReset, desc: `Current avg repair ${kpi.mttr} hrs`,
        columns: TREND_COLS('MTTR (hrs)'), rows: mttrTrend(breakdowns, 12),
      },
      {
        id: 'top10', label: 'Top 10 Breakdown Report', icon: FileBarChart2, desc: 'Pareto ranking with cumulative %',
        columns: [
          { key: 'label', label: 'Machine' }, { key: 'count', label: 'Breakdowns' },
          { key: 'downtime', label: 'Downtime (hrs)' }, { label: 'Cumulative %', value: (r) => `${r.cumulative}%` },
        ],
        rows: paretoTop10(breakdowns, machines),
      },
      {
        id: 'monthly', label: 'Monthly Report', icon: CalendarDays, desc: 'Month-by-month plant performance',
        columns: SUMMARY_COLS, rows: summaryRows(lastNMonths(12)),
      },
      {
        id: 'yearly', label: 'Yearly Report', icon: CalendarRange, desc: 'Annual consolidated summary',
        columns: [
          { key: 'year', label: 'Year' }, { key: 'breakdowns', label: 'Breakdowns' },
          { key: 'downtime', label: 'Downtime (hrs)' }, { key: 'pmDone', label: 'PM Completed' },
          { key: 'energy', label: 'Energy (kWh)' },
        ],
        rows: [...new Set([
          ...breakdowns.map((b) => new Date(b.createdAt).getFullYear()),
          ...pms.map((p) => new Date(p.pmDate).getFullYear()),
          ...energy.map((e) => new Date(e.date || e.createdAt).getFullYear()),
        ])].sort().map((year) => ({
          year,
          breakdowns: breakdowns.filter((b) => new Date(b.createdAt).getFullYear() === year).length,
          downtime: Math.round(breakdowns.filter((b) => new Date(b.createdAt).getFullYear() === year).reduce((s, b) => s + (b.totalDowntimeHrs || 0), 0) * 10) / 10,
          pmDone: pms.filter((p) => p.status === 'completed' && new Date(p.pmDate).getFullYear() === year).length,
          energy: Math.round(energy.filter((e) => new Date(e.date || e.createdAt).getFullYear() === year).reduce((s, e) => s + e.kwh, 0)),
        })),
      },
      {
        id: 'kaizen', label: 'Kaizen Report', icon: Lightbulb, desc: 'Continuous improvement submissions',
        columns: DOC_COLS, rows: docRows('Kaizen'),
      },
      {
        id: 'orm', label: 'ORM Report', icon: ShieldCheck, desc: 'Operational risk management records',
        columns: DOC_COLS, rows: docRows('ORM Data (Operational Risk Management)'),
      },
    ];
  }, [store, serverDocs, machines, breakdowns, pms, energy]);

  const report = REPORTS.find((r) => r.id === active) || REPORTS[0];
  const filename = report.label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h2 className="text-page-title flex items-center gap-3">
          <FileBarChart2 size={28} className="text-cyan-400" aria-hidden="true" />
          Analytics Reports
        </h2>
        <p className="text-body mt-1.5">14 professional report packs — generated live from plant data, exportable to Excel, PDF and CSV</p>
      </div>

      {/* Report selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-2.5">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          const activeCls = r.id === active
            ? 'border-cyan-400/60 bg-cyan-500/10 text-white'
            : 'border-white/[0.07] bg-white/[0.02] text-slate-400 hover:text-white hover:border-white/[0.18]';
          return (
            <button
              key={r.id}
              onClick={() => setActive(r.id)}
              className={`rounded-control border p-3 text-left transition-all ${activeCls}`}
              aria-pressed={r.id === active}
            >
              <Icon size={16} className={r.id === active ? 'text-cyan-400' : ''} aria-hidden="true" />
              <p className="text-[11px] font-semibold mt-1.5 leading-tight">{r.label}</p>
            </button>
          );
        })}
      </div>

      {/* Preview + export */}
      <div className="glass-card overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h3 className="text-card-title">{report.label}</h3>
            <p className="text-meta mt-0.5">{report.desc} · {report.rows.length} rows</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportExcel(report.label, report.columns, report.rows, `${filename}.xls`)}
              disabled={!report.rows.length}
              className="btn-success text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <FileSpreadsheet size={13} aria-hidden="true" /> Excel
            </button>
            <button
              onClick={() => exportPDF(report.label, report.columns, report.rows)}
              disabled={!report.rows.length}
              className="btn-danger text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <Printer size={13} aria-hidden="true" /> PDF
            </button>
            <button
              onClick={() => exportToCSV(report.rows, report.columns, `${filename}.csv`)}
              disabled={!report.rows.length}
              className="btn-ghost text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <Download size={13} aria-hidden="true" /> CSV
            </button>
          </div>
        </div>

        {report.rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No data for this report yet"
              description="This report generates automatically as machines, breakdowns, PM tasks, energy logs and documents are added."
            />
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[520px]">
            <table className="enterprise-table w-full min-w-[720px]">
              <thead className="sticky top-0 bg-slate-900/95 backdrop-blur">
                <tr>{report.columns.map((c) => <th key={c.label}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {report.rows.slice(0, 200).map((row, i) => (
                  <tr key={i}>
                    {report.columns.map((c) => (
                      <td key={c.label} className="text-slate-300 max-w-[240px] truncate" title={cellValue(c, row)}>
                        {cellValue(c, row) || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {report.rows.length > 200 && (
              <p className="px-5 py-3 text-meta">Preview limited to 200 rows — exports include all {report.rows.length} rows.</p>
            )}
          </div>
        )}
      </div>

      <p className="text-meta flex items-center gap-1.5">
        <FileText size={12} aria-hidden="true" />
        Exports carry the {COMPANY_NAME} letterhead with generation timestamp. PDF opens the print dialog — choose "Save as PDF".
      </p>
    </div>
  );
}

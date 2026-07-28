import { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  useStore, addBreakdown, closeBreakdown, deleteBreakdown, getMachine,
} from '../store.js';
import { computeMTTR, computeAvailability, monthKey } from '../analytics.js';
import EmptyState from '../components/EmptyState.jsx';
import { exportToCSV, timeAgo } from '../utils.js';
import {
  AlertOctagon, Plus, Search, X, Trash2, CheckCircle2, Eye, Timer,
  TimerReset, Gauge, Download, AlertCircle, Wrench,
} from 'lucide-react';

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const CRITICALITY = ['A — Critical', 'B — Essential', 'C — General'];

const PRIORITY_CLS = {
  Low: 'bg-slate-500/10 text-slate-300 border-slate-500/25',
  Medium: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25',
  High: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  Critical: 'bg-red-500/10 text-red-400 border-red-500/25',
};

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/** Report-breakdown modal — creates the work order and flips the machine down. */
function NewBreakdownModal({ machines, userName, onClose }) {
  const [form, setForm] = useState({
    machineId: '', problem: '', reportedBy: userName, engineer: '',
    priority: 'Medium', criticality: 'B — Essential', downtimeStart: nowLocal(), remarks: '',
  });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.machineId || !form.problem.trim()) {
      setError('Machine and problem description are required');
      return;
    }
    const m = getMachine(form.machineId);
    addBreakdown(
      {
        ...form,
        department: m?.department || m?.section || '',
        downtimeStart: new Date(form.downtimeStart).toISOString(),
      },
      userName
    );
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="Report breakdown">
      <div className="modal-content glass-card p-6 w-full max-w-xl max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-card-title flex items-center gap-2">
            <AlertOctagon size={16} className="text-red-400" aria-hidden="true" /> Report Breakdown
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close"><X size={18} aria-hidden="true" /></button>
        </div>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-slate-400 text-xs font-medium mb-1.5" htmlFor="bd-machine">Machine *</label>
            <select id="bd-machine" className="select-field" value={form.machineId} onChange={set('machineId')}>
              <option value="">Select machine...</option>
              {machines.map((m) => <option key={m.id} value={m.id}>{m.name}{m.machineCode ? ` (${m.machineCode})` : ''}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-slate-400 text-xs font-medium mb-1.5" htmlFor="bd-problem">Problem Description *</label>
            <textarea id="bd-problem" rows={2} className="input-field resize-none" value={form.problem} onChange={set('problem')} placeholder="e.g. Abnormal noise from gearbox, line stopped" />
          </div>
          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5" htmlFor="bd-reporter">Reported By</label>
            <input id="bd-reporter" type="text" className="input-field" value={form.reportedBy} onChange={set('reportedBy')} />
          </div>
          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5" htmlFor="bd-engineer">Assigned Engineer</label>
            <input id="bd-engineer" type="text" className="input-field" value={form.engineer} onChange={set('engineer')} placeholder="e.g. Ankit Sharma" />
          </div>
          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5" htmlFor="bd-priority">Priority</label>
            <select id="bd-priority" className="select-field" value={form.priority} onChange={set('priority')}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5" htmlFor="bd-crit">Criticality</label>
            <select id="bd-crit" className="select-field" value={form.criticality} onChange={set('criticality')}>
              {CRITICALITY.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-slate-400 text-xs font-medium mb-1.5" htmlFor="bd-start">Downtime Start</label>
            <input id="bd-start" type="datetime-local" className="input-field" value={form.downtimeStart} onChange={set('downtimeStart')} />
          </div>
          {error && (
            <div className="sm:col-span-2 bg-red-500/10 border border-red-500/30 rounded-control px-3 py-2 text-red-400 text-xs flex items-center gap-2" role="alert">
              <AlertCircle size={13} aria-hidden="true" /> {error}
            </div>
          )}
          <button type="submit" className="sm:col-span-2 btn-danger flex items-center justify-center gap-2">
            <AlertOctagon size={14} aria-hidden="true" /> Log Breakdown & Notify
          </button>
        </form>
      </div>
    </div>
  );
}

/** Close-out modal — RCA fields; downtime/MTTR/availability recompute automatically. */
function CloseBreakdownModal({ bd, userName, onClose }) {
  const [form, setForm] = useState({
    rootCause: bd.rootCause || '', actionTaken: bd.actionTaken || '',
    spareUsed: bd.spareUsed || '', remarks: bd.remarks || '', downtimeEnd: nowLocal(),
  });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.rootCause.trim() || !form.actionTaken.trim()) {
      setError('Root cause and action taken are required to close the work order');
      return;
    }
    if (new Date(form.downtimeEnd) <= new Date(bd.downtimeStart)) {
      setError('Downtime end must be after the downtime start');
      return;
    }
    closeBreakdown(bd.id, { ...form, downtimeEnd: new Date(form.downtimeEnd).toISOString() }, userName);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="Close breakdown">
      <div className="modal-content glass-card p-6 w-full max-w-xl max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-card-title flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400" aria-hidden="true" /> Close {bd.complaintNo}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close"><X size={18} aria-hidden="true" /></button>
        </div>
        <p className="text-meta mb-5">Downtime, MTTR, MTBF and availability update automatically on closure.</p>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5" htmlFor="cb-root">Root Cause *</label>
            <input id="cb-root" type="text" className="input-field" value={form.rootCause} onChange={set('rootCause')} placeholder="e.g. Bearing seizure due to lubrication failure" />
          </div>
          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5" htmlFor="cb-action">Action Taken *</label>
            <input id="cb-action" type="text" className="input-field" value={form.actionTaken} onChange={set('actionTaken')} placeholder="e.g. Replaced DE bearing, re-greased, aligned coupling" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5" htmlFor="cb-spare">Spare Used</label>
              <input id="cb-spare" type="text" className="input-field" value={form.spareUsed} onChange={set('spareUsed')} placeholder="e.g. 6205-2RS bearing × 2" />
            </div>
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5" htmlFor="cb-end">Downtime End *</label>
              <input id="cb-end" type="datetime-local" className="input-field" value={form.downtimeEnd} onChange={set('downtimeEnd')} />
            </div>
          </div>
          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5" htmlFor="cb-remarks">Remarks</label>
            <textarea id="cb-remarks" rows={2} className="input-field resize-none" value={form.remarks} onChange={set('remarks')} />
          </div>
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-control px-3 py-2 text-red-400 text-xs flex items-center gap-2" role="alert">
              <AlertCircle size={13} aria-hidden="true" /> {error}
            </div>
          )}
          <button type="submit" className="btn-success flex items-center justify-center gap-2">
            <CheckCircle2 size={14} aria-hidden="true" /> Close Work Order
          </button>
        </form>
      </div>
    </div>
  );
}

/** Read-only detail sheet. */
function DetailModal({ bd, machineName, onClose }) {
  const rows = [
    ['Complaint No', bd.complaintNo], ['Machine', machineName], ['Department', bd.department || '—'],
    ['Problem', bd.problem], ['Reported By', bd.reportedBy || '—'], ['Assigned Engineer', bd.engineer || '—'],
    ['Priority', bd.priority], ['Criticality', bd.criticality],
    ['Downtime Start', bd.downtimeStart ? new Date(bd.downtimeStart).toLocaleString('en-GB') : '—'],
    ['Downtime End', bd.downtimeEnd ? new Date(bd.downtimeEnd).toLocaleString('en-GB') : '—'],
    ['Total Downtime', bd.status === 'closed' ? `${bd.totalDowntimeHrs} hrs` : 'Running...'],
    ['Root Cause', bd.rootCause || '—'], ['Action Taken', bd.actionTaken || '—'],
    ['Spare Used', bd.spareUsed || '—'], ['Remarks', bd.remarks || '—'],
    ['Status', bd.status === 'closed' ? 'Closed' : 'Open'],
  ];
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="Breakdown details">
      <div className="modal-content glass-card p-6 w-full max-w-lg max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-card-title">{bd.complaintNo} — Work Order Detail</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close"><X size={18} aria-hidden="true" /></button>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          {rows.map(([label, value]) => (
            <div key={label} className={label === 'Problem' || label === 'Root Cause' || label === 'Action Taken' || label === 'Remarks' ? 'sm:col-span-2' : ''}>
              <dt className="text-slate-500 text-[10px] uppercase tracking-wider">{label}</dt>
              <dd className="text-slate-200 text-[13px] mt-0.5 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export default function Breakdowns() {
  const { user } = useAuth();
  const store = useStore();
  const { breakdowns, machines } = store;
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [machineF, setMachineF] = useState('');
  const [priorityF, setPriorityF] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [closing, setClosing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const userName = user?.full_name || 'Admin';
  const isAdmin = user?.role === 'admin';
  const machineName = (id) => machines.find((m) => m.id === id)?.name || '—';

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return breakdowns.filter((b) => {
      const mName = machineName(b.machineId).toLowerCase();
      return (
        (!q || b.complaintNo.toLowerCase().includes(q) || mName.includes(q) || (b.problem || '').toLowerCase().includes(q) || (b.engineer || '').toLowerCase().includes(q)) &&
        (!statusF || b.status === statusF) &&
        (!machineF || b.machineId === machineF) &&
        (!priorityF || b.priority === priorityF) &&
        (!fromDate || new Date(b.createdAt) >= new Date(fromDate)) &&
        (!toDate || new Date(b.createdAt) <= new Date(toDate + 'T23:59:59'))
      );
    });
  }, [breakdowns, machines, search, statusF, machineF, priorityF, fromDate, toDate]);

  const kpis = useMemo(() => ({
    open: breakdowns.filter((b) => b.status === 'open').length,
    month: breakdowns.filter((b) => monthKey(b.createdAt) === monthKey(new Date())).length,
    downtime: Math.round(breakdowns.reduce((s, b) => s + (b.totalDowntimeHrs || 0), 0) * 10) / 10,
    mttr: computeMTTR(breakdowns),
    availability: computeAvailability(breakdowns, machines.length, monthKey(new Date())),
  }), [breakdowns, machines]);

  const handleExport = () =>
    exportToCSV(
      rows,
      [
        { key: 'complaintNo', label: 'Complaint No' },
        { label: 'Machine', value: (b) => machineName(b.machineId) },
        { key: 'department', label: 'Department' },
        { key: 'problem', label: 'Problem' },
        { key: 'reportedBy', label: 'Reported By' },
        { key: 'engineer', label: 'Engineer' },
        { key: 'priority', label: 'Priority' },
        { key: 'criticality', label: 'Criticality' },
        { key: 'rootCause', label: 'Root Cause' },
        { key: 'actionTaken', label: 'Action Taken' },
        { key: 'spareUsed', label: 'Spare Used' },
        { label: 'Downtime Start', value: (b) => b.downtimeStart ? new Date(b.downtimeStart).toLocaleString('en-GB') : '' },
        { label: 'Downtime End', value: (b) => b.downtimeEnd ? new Date(b.downtimeEnd).toLocaleString('en-GB') : '' },
        { key: 'totalDowntimeHrs', label: 'Downtime (hrs)' },
        { key: 'status', label: 'Status' },
        { key: 'remarks', label: 'Remarks' },
      ],
      'breakdown-report.csv'
    );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-page-title flex items-center gap-3">
            <AlertOctagon size={28} className="text-red-400" aria-hidden="true" />
            Breakdown Management
          </h2>
          <p className="text-body mt-1.5">Corrective work orders with automatic downtime, MTTR & availability tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="btn-ghost inline-flex items-center gap-2 text-xs whitespace-nowrap">
            <Download size={13} aria-hidden="true" /> Export CSV
          </button>
          {isAdmin && (
            <button onClick={() => setShowNew(true)} className="btn-danger inline-flex items-center gap-2 whitespace-nowrap">
              <Plus size={15} aria-hidden="true" /> Report Breakdown
            </button>
          )}
        </div>
      </div>

      {/* Live module KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { icon: AlertOctagon, label: 'Open Now', value: kpis.open, cls: 'text-red-400' },
          { icon: Wrench, label: 'This Month', value: kpis.month, cls: 'text-amber-400' },
          { icon: Timer, label: 'Total Downtime', value: `${kpis.downtime}h`, cls: 'text-orange-400' },
          { icon: TimerReset, label: 'Avg MTTR', value: `${kpis.mttr}h`, cls: 'text-cyan-400' },
          { icon: Gauge, label: 'Availability', value: `${kpis.availability}%`, cls: 'text-emerald-400' },
        ].map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="glass-card p-4 flex items-center gap-3">
              <Icon size={18} className={k.cls} aria-hidden="true" />
              <div>
                <p className="text-white text-base font-bold leading-tight">{k.value}</p>
                <p className="text-slate-500 text-[10px]">{k.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="glass-card p-4 grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="relative col-span-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input type="search" className="input-field pl-9" placeholder="Search complaint, machine, engineer..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search breakdowns" />
        </div>
        <select className="select-field" value={machineF} onChange={(e) => setMachineF(e.target.value)} aria-label="Filter by machine">
          <option value="">All Machines</option>
          {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select className="select-field" value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Filter by status">
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <select className="select-field" value={priorityF} onChange={(e) => setPriorityF(e.target.value)} aria-label="Filter by priority">
          <option value="">All Priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <div className="flex gap-2">
          <input type="date" className="input-field" value={fromDate} onChange={(e) => setFromDate(e.target.value)} aria-label="From date" />
          <input type="date" className="input-field" value={toDate} onChange={(e) => setToDate(e.target.value)} aria-label="To date" />
        </div>
      </div>

      {/* Work order table */}
      {rows.length === 0 ? (
        <EmptyState
          title="No breakdowns logged"
          description={breakdowns.length ? 'No work order matches the current filters.' : 'When a machine fails, report it here — downtime, MTTR and availability KPIs update automatically.'}
          actionLabel={isAdmin && !breakdowns.length ? '+ Report First Breakdown' : undefined}
          onAction={isAdmin ? () => setShowNew(true) : undefined}
        />
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="enterprise-table w-full min-w-[900px]">
            <thead>
              <tr>
                <th>Complaint No</th><th>Machine</th><th>Problem</th><th>Engineer</th>
                <th>Priority</th><th>Reported</th><th>Downtime</th><th>Status</th><th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td className="font-mono text-xs text-cyan-400">{b.complaintNo}</td>
                  <td className="text-white font-medium">{machineName(b.machineId)}</td>
                  <td className="max-w-[220px] truncate text-slate-300" title={b.problem}>{b.problem}</td>
                  <td className="text-slate-400">{b.engineer || '—'}</td>
                  <td><span className={`badge border ${PRIORITY_CLS[b.priority] || PRIORITY_CLS.Medium}`}>{b.priority}</span></td>
                  <td className="text-slate-400 text-xs whitespace-nowrap">{timeAgo(b.createdAt)}</td>
                  <td className="text-slate-300 whitespace-nowrap">{b.status === 'closed' ? `${b.totalDowntimeHrs} hrs` : <span className="text-red-400 animate-pulse">ongoing</span>}</td>
                  <td>
                    <span className={`status-pill ${b.status === 'closed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' : 'bg-red-500/10 text-red-400 border border-red-500/25'}`}>
                      {b.status === 'closed' ? 'Closed' : 'Open'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => setViewing(b)} className="btn-ghost !p-1.5" aria-label={`View ${b.complaintNo}`}><Eye size={13} aria-hidden="true" /></button>
                      {isAdmin && b.status === 'open' && (
                        <button onClick={() => setClosing(b)} className="btn-ghost !p-1.5 text-emerald-400 hover:text-emerald-300" aria-label={`Close ${b.complaintNo}`}>
                          <CheckCircle2 size={13} aria-hidden="true" />
                        </button>
                      )}
                      {isAdmin && (
                        <button onClick={() => setDeleting(b)} className="btn-ghost !p-1.5 text-red-400 hover:text-red-300" aria-label={`Delete ${b.complaintNo}`}>
                          <Trash2 size={13} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewBreakdownModal machines={machines} userName={userName} onClose={() => setShowNew(false)} />}
      {closing && <CloseBreakdownModal bd={closing} userName={userName} onClose={() => setClosing(null)} />}
      {viewing && <DetailModal bd={viewing} machineName={machineName(viewing.machineId)} onClose={() => setViewing(null)} />}
      {deleting && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setDeleting(null)} role="dialog" aria-modal="true">
          <div className="modal-content glass-card p-6 w-full max-w-sm">
            <h3 className="text-card-title mb-2">Delete Work Order</h3>
            <p className="text-body mb-5">Delete <span className="text-white font-medium">{deleting.complaintNo}</span>? Historical KPIs will recalculate without it.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleting(null)} className="btn-ghost text-xs">Cancel</button>
              <button
                onClick={() => { deleteBreakdown(deleting.id, userName); setDeleting(null); }}
                className="btn-danger text-xs inline-flex items-center gap-1.5"
              >
                <Trash2 size={12} aria-hidden="true" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

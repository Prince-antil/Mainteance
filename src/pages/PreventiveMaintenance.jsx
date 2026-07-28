import { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useStore, addPM, completePM, deletePM } from '../store.js';
import { pmStats } from '../analytics.js';
import EmptyState from '../components/EmptyState.jsx';
import { exportToCSV } from '../utils.js';
import {
  ClipboardCheck, Plus, Search, X, Trash2, CheckCircle2, Download,
  AlertCircle, CalendarClock, CalendarX2, ListChecks, Percent,
} from 'lucide-react';

export const PM_FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];

const DEFAULT_CHECKLIST = [
  'Visual inspection & abnormal noise check',
  'Lubrication of moving parts',
  'Electrical connections & earthing check',
  'Safety guards & interlocks verification',
  'Cleaning & housekeeping of machine area',
];

/** Schedule-PM modal with editable checklist lines. */
function NewPMModal({ machines, userName, onClose }) {
  const [form, setForm] = useState({
    machineId: '', frequency: 'Monthly', pmDate: new Date().toISOString().slice(0, 10), engineer: '',
  });
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST.join('\n'));
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.machineId || !form.pmDate) {
      setError('Machine and PM date are required');
      return;
    }
    addPM(
      {
        ...form,
        checklist: checklist.split('\n').map((s) => s.trim()).filter(Boolean).map((text) => ({ text, done: false })),
      },
      userName
    );
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="Schedule preventive maintenance">
      <div className="modal-content glass-card p-6 w-full max-w-xl max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-card-title flex items-center gap-2">
            <ClipboardCheck size={16} className="text-cyan-400" aria-hidden="true" /> Schedule Preventive Maintenance
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close"><X size={18} aria-hidden="true" /></button>
        </div>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5" htmlFor="pm-machine">Machine *</label>
            <select id="pm-machine" className="select-field" value={form.machineId} onChange={set('machineId')}>
              <option value="">Select machine...</option>
              {machines.map((m) => <option key={m.id} value={m.id}>{m.name}{m.machineCode ? ` (${m.machineCode})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5" htmlFor="pm-freq">Frequency</label>
            <select id="pm-freq" className="select-field" value={form.frequency} onChange={set('frequency')}>
              {PM_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5" htmlFor="pm-date">PM Due Date *</label>
            <input id="pm-date" type="date" className="input-field" value={form.pmDate} onChange={set('pmDate')} />
          </div>
          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5" htmlFor="pm-eng">Engineer</label>
            <input id="pm-eng" type="text" className="input-field" value={form.engineer} onChange={set('engineer')} placeholder="e.g. Rahul Verma" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-slate-400 text-xs font-medium mb-1.5" htmlFor="pm-check">Checklist (one task per line)</label>
            <textarea id="pm-check" rows={5} className="input-field resize-none font-mono text-xs" value={checklist} onChange={(e) => setChecklist(e.target.value)} />
          </div>
          {error && (
            <div className="sm:col-span-2 bg-red-500/10 border border-red-500/30 rounded-control px-3 py-2 text-red-400 text-xs flex items-center gap-2" role="alert">
              <AlertCircle size={13} aria-hidden="true" /> {error}
            </div>
          )}
          <button type="submit" className="sm:col-span-2 btn-primary flex items-center justify-center gap-2">
            <Plus size={14} aria-hidden="true" /> Schedule PM Task
          </button>
        </form>
      </div>
    </div>
  );
}

/** Execute-PM modal — tick checklist items; completion % auto-computes. */
function CompletePMModal({ pm, machineName, userName, onClose }) {
  const [items, setItems] = useState(() => (pm.checklist || []).map((c) => ({ ...c })));
  const [timeTakenHrs, setTime] = useState(pm.timeTakenHrs || '');
  const [remarks, setRemarks] = useState(pm.remarks || '');
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 100;

  const submit = (e) => {
    e.preventDefault();
    completePM(pm.id, {
      checklist: items,
      completionPct: pct,
      timeTakenHrs: Number(timeTakenHrs) || 0,
      remarks,
    }, userName);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="Complete preventive maintenance">
      <div className="modal-content glass-card p-6 w-full max-w-xl max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-card-title flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400" aria-hidden="true" /> Execute PM — {machineName}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close"><X size={18} aria-hidden="true" /></button>
        </div>
        <p className="text-meta mb-4">{pm.frequency} schedule · due {new Date(pm.pmDate).toLocaleDateString('en-GB')}</p>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-emerald-400 transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-emerald-400 text-sm font-bold w-12 text-right">{pct}%</span>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2" aria-label="PM checklist">
            {items.map((item, i) => (
              <li key={i}>
                <label className="flex items-start gap-2.5 rounded-control border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 cursor-pointer hover:border-white/[0.14] transition-colors">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => setItems((arr) => arr.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
                    className="mt-0.5 accent-emerald-400"
                  />
                  <span className={`text-[13px] ${item.done ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{item.text}</span>
                </label>
              </li>
            ))}
            {items.length === 0 && <li className="text-body">No checklist items — mark the task complete directly.</li>}
          </ul>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5" htmlFor="pmc-time">Time Taken (hrs)</label>
              <input id="pmc-time" type="number" min="0" step="0.5" className="input-field" value={timeTakenHrs} onChange={(e) => setTime(e.target.value)} placeholder="e.g. 2.5" />
            </div>
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5" htmlFor="pmc-remarks">Remarks</label>
              <input id="pmc-remarks" type="text" className="input-field" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Observations, parts replaced..." />
            </div>
          </div>
          <button type="submit" className="btn-success flex items-center justify-center gap-2">
            <CheckCircle2 size={14} aria-hidden="true" /> Mark PM Completed ({pct}%)
          </button>
        </form>
      </div>
    </div>
  );
}

export default function PreventiveMaintenance() {
  const { user } = useAuth();
  const store = useStore();
  const { pms, machines } = store;
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [freqF, setFreqF] = useState('');
  const [machineF, setMachineF] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [executing, setExecuting] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const userName = user?.full_name || 'Admin';
  const isAdmin = user?.role === 'admin';
  const machineName = (id) => machines.find((m) => m.id === id)?.name || '—';
  const stats = useMemo(() => pmStats(pms), [pms]);

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    const nowD = new Date();
    return pms
      .map((p) => ({
        ...p,
        derived: p.status === 'completed' ? 'completed' : new Date(p.pmDate) < nowD ? 'overdue' : 'scheduled',
      }))
      .filter((p) =>
        (!q || machineName(p.machineId).toLowerCase().includes(q) || (p.engineer || '').toLowerCase().includes(q) || p.frequency.toLowerCase().includes(q)) &&
        (!statusF || p.derived === statusF) &&
        (!freqF || p.frequency === freqF) &&
        (!machineF || p.machineId === machineF)
      )
      .sort((a, b) => new Date(a.pmDate) - new Date(b.pmDate));
  }, [pms, machines, search, statusF, freqF, machineF]);

  const handleExport = () =>
    exportToCSV(
      rows,
      [
        { label: 'Machine', value: (p) => machineName(p.machineId) },
        { key: 'frequency', label: 'Frequency' },
        { label: 'PM Date', value: (p) => new Date(p.pmDate).toLocaleDateString('en-GB') },
        { key: 'engineer', label: 'Engineer' },
        { key: 'derived', label: 'Status' },
        { label: 'Completion %', value: (p) => p.completionPct ?? (p.status === 'completed' ? 100 : 0) },
        { key: 'timeTakenHrs', label: 'Time Taken (hrs)' },
        { label: 'Checklist Items', value: (p) => (p.checklist || []).length },
        { key: 'remarks', label: 'Remarks' },
      ],
      'pm-schedule.csv'
    );

  const STATUS_PILL = {
    completed: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25',
    overdue: 'bg-red-500/10 text-red-400 border border-red-500/25',
    scheduled: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/25',
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-page-title flex items-center gap-3">
            <ClipboardCheck size={28} className="text-cyan-400" aria-hidden="true" />
            Preventive Maintenance
          </h2>
          <p className="text-body mt-1.5">Daily to yearly schedules with checklists — compliance recalculates automatically</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="btn-ghost inline-flex items-center gap-2 text-xs whitespace-nowrap">
            <Download size={13} aria-hidden="true" /> Export CSV
          </button>
          {isAdmin && (
            <button onClick={() => setShowNew(true)} className="btn-primary inline-flex items-center gap-2 whitespace-nowrap">
              <Plus size={15} aria-hidden="true" /> Schedule PM
            </button>
          )}
        </div>
      </div>

      {/* Live PM KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { icon: ListChecks, label: 'Total Schedules', value: stats.total, cls: 'text-cyan-400' },
          { icon: CheckCircle2, label: 'Completed', value: stats.completed, cls: 'text-emerald-400' },
          { icon: CalendarClock, label: 'Upcoming (7d)', value: stats.upcoming.length, cls: 'text-amber-400' },
          { icon: CalendarX2, label: 'Overdue', value: stats.overdue.length, cls: 'text-red-400' },
          { icon: Percent, label: 'Compliance', value: `${stats.compliance}%`, cls: 'text-emerald-400' },
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
      <div className="glass-card p-4 grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative col-span-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input type="search" className="input-field pl-9" placeholder="Search machine, engineer, frequency..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search PM schedules" />
        </div>
        <select className="select-field" value={machineF} onChange={(e) => setMachineF(e.target.value)} aria-label="Filter by machine">
          <option value="">All Machines</option>
          {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select className="select-field" value={freqF} onChange={(e) => setFreqF(e.target.value)} aria-label="Filter by frequency">
          <option value="">All Frequencies</option>
          {PM_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select className="select-field" value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Filter by status">
          <option value="">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="overdue">Overdue</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Schedule table */}
      {rows.length === 0 ? (
        <EmptyState
          title="No PM schedules"
          description={pms.length ? 'No schedule matches the current filters.' : 'Create the first preventive maintenance schedule — compliance, overdue and upcoming KPIs will track automatically.'}
          actionLabel={isAdmin && !pms.length ? '+ Schedule First PM' : undefined}
          onAction={isAdmin ? () => setShowNew(true) : undefined}
        />
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="enterprise-table w-full min-w-[820px]">
            <thead>
              <tr>
                <th>Machine</th><th>Frequency</th><th>PM Date</th><th>Engineer</th>
                <th>Checklist</th><th>Completion</th><th>Time</th><th>Status</th><th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const pct = p.completionPct ?? (p.status === 'completed' ? 100 : 0);
                return (
                  <tr key={p.id}>
                    <td className="text-white font-medium">{machineName(p.machineId)}</td>
                    <td><span className="badge bg-slate-700/60 text-slate-300">{p.frequency}</span></td>
                    <td className="text-slate-300 whitespace-nowrap">{new Date(p.pmDate).toLocaleDateString('en-GB')}</td>
                    <td className="text-slate-400">{p.engineer || '—'}</td>
                    <td className="text-slate-400 text-xs">{(p.checklist || []).filter((c) => c.done).length}/{(p.checklist || []).length} tasks</td>
                    <td>
                      <div className="flex items-center gap-2 min-w-[90px]">
                        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-400' : 'bg-cyan-400'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-slate-400 text-[11px] w-8">{pct}%</span>
                      </div>
                    </td>
                    <td className="text-slate-400 text-xs whitespace-nowrap">{p.timeTakenHrs ? `${p.timeTakenHrs}h` : '—'}</td>
                    <td><span className={`status-pill ${STATUS_PILL[p.derived]}`}>{p.derived.charAt(0).toUpperCase() + p.derived.slice(1)}</span></td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        {isAdmin && p.status !== 'completed' && (
                          <button onClick={() => setExecuting(p)} className="btn-ghost !p-1.5 text-emerald-400 hover:text-emerald-300" aria-label={`Execute PM for ${machineName(p.machineId)}`}>
                            <CheckCircle2 size={13} aria-hidden="true" />
                          </button>
                        )}
                        {isAdmin && (
                          <button onClick={() => setDeleting(p)} className="btn-ghost !p-1.5 text-red-400 hover:text-red-300" aria-label="Delete PM schedule">
                            <Trash2 size={13} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewPMModal machines={machines} userName={userName} onClose={() => setShowNew(false)} />}
      {executing && <CompletePMModal pm={executing} machineName={machineName(executing.machineId)} userName={userName} onClose={() => setExecuting(null)} />}
      {deleting && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setDeleting(null)} role="dialog" aria-modal="true">
          <div className="modal-content glass-card p-6 w-full max-w-sm">
            <h3 className="text-card-title mb-2">Delete PM Schedule</h3>
            <p className="text-body mb-5">Delete the {deleting.frequency} PM for <span className="text-white font-medium">{machineName(deleting.machineId)}</span>? Compliance will recalculate.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleting(null)} className="btn-ghost text-xs">Cancel</button>
              <button onClick={() => { deletePM(deleting.id, userName); setDeleting(null); }} className="btn-danger text-xs inline-flex items-center gap-1.5">
                <Trash2 size={12} aria-hidden="true" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

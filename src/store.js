// ================================================================
// CCPL CMMS — Central Reactive Data Store
// Single source of truth for machines, breakdowns, preventive
// maintenance, energy logs, activity feed and app settings.
// Persisted in the browser vault (localStorage) — the serverless
// report API stays untouched. Every write notifies subscribers so
// dashboards, charts and KPIs recalculate automatically.
// ================================================================
import { useSyncExternalStore } from 'react';
import { loadLS, saveLS } from './utils.js';

const KEYS = {
  machines: 'ccpl_machines_v1', // preserved from the previous machine vault
  breakdowns: 'ccpl_breakdowns_v1',
  pms: 'ccpl_pms_v1',
  energy: 'ccpl_energy_v1',
  activity: 'ccpl_activity_v1',
  settings: 'ccpl_settings_v1',
};

const SEED_MACHINES = [
  { id: 'm-jetmill-1', name: 'Jet Mill #1', section: 'JET MILL FORMULATION INSEC', status: 'running', docs: [], createdAt: '2026-01-10T08:00:00Z' },
  { id: 'm-acm-1', name: 'ACM-1', section: 'ACM-1 INSEC Formulation', status: 'running', docs: [], createdAt: '2026-01-10T08:05:00Z' },
  { id: 'm-liquid-filler', name: '8-Head Liquid Filler', section: 'Herbi EC Packaging', status: 'maintenance', docs: [], createdAt: '2026-01-12T09:00:00Z' },
  { id: 'm-ffs-a', name: 'FFS Line A', section: 'CARTAP PACKAGING INSEC', status: 'running', docs: [], createdAt: '2026-01-15T10:00:00Z' },
  { id: 'm-sigma-mixer', name: 'Sigma Mixer', section: 'Formulation Park', status: 'running', docs: [], createdAt: '2026-01-18T11:00:00Z' },
];

const MACHINE_DEFAULTS = {
  machineCode: '', department: '', area: '', manufacturer: '', model: '',
  serialNumber: '', installDate: '', powerRating: '', voltage: '', current: '',
  runningHours: 0, spares: [], photos: [],
};

// ---------------- internal reactive state ----------------
let version = 0;
const listeners = new Set();

let state = {
  machines: (loadLS(KEYS.machines, null) || SEED_MACHINES).map((m) => ({ ...MACHINE_DEFAULTS, ...m })),
  breakdowns: loadLS(KEYS.breakdowns, []),
  pms: loadLS(KEYS.pms, []),
  energy: loadLS(KEYS.energy, []),
  activity: loadLS(KEYS.activity, []),
  settings: loadLS(KEYS.settings, { plantName: 'Nathupur Formulation Plant', notifSeenAt: 0 }),
};
saveLS(KEYS.machines, state.machines);

function commit(entity) {
  saveLS(KEYS[entity], state[entity]);
  version += 1;
  listeners.forEach((fn) => fn());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const getVersion = () => version;
export const getData = () => state;

/** React hook — re-renders whenever any entity changes. */
export function useStore() {
  useSyncExternalStore(subscribe, getVersion);
  return state;
}

const uid = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const now = () => new Date().toISOString();

// ---------------- activity feed ----------------
export function logActivity(userName, action, detail = '', type = 'info') {
  state = {
    ...state,
    activity: [{ id: uid('a'), ts: now(), user: userName || 'System', action, detail, type }, ...state.activity].slice(0, 120),
  };
  commit('activity');
}

// ---------------- settings ----------------
export function updateSettings(patch) {
  state = { ...state, settings: { ...state.settings, ...patch } };
  commit('settings');
}

// ---------------- machines ----------------
export const getMachines = () => state.machines;
export const getMachine = (id) => state.machines.find((m) => m.id === id) || null;

export function addMachine(fields, userName) {
  const machine = {
    ...MACHINE_DEFAULTS,
    id: uid('m'),
    status: 'running',
    docs: [],
    createdAt: now(),
    ...fields,
    name: fields.name.trim(),
  };
  state = { ...state, machines: [machine, ...state.machines] };
  commit('machines');
  logActivity(userName, 'added machine', machine.name, 'machine');
  return machine;
}

export function updateMachine(id, patch, userName, silent = false) {
  state = { ...state, machines: state.machines.map((m) => (m.id === id ? { ...m, ...patch } : m)) };
  commit('machines');
  if (!silent && userName) logActivity(userName, 'updated machine', getMachine(id)?.name || '', 'machine');
  return getMachine(id);
}

export function deleteMachine(id, userName) {
  const name = getMachine(id)?.name || '';
  state = { ...state, machines: state.machines.filter((m) => m.id !== id) };
  commit('machines');
  logActivity(userName, 'deleted machine', name, 'machine');
}

export function addMachineDoc(machineId, doc, userName) {
  state = {
    ...state,
    machines: state.machines.map((m) =>
      m.id === machineId
        ? { ...m, docs: [{ id: uid('d'), uploadedAt: now(), ...doc }, ...(m.docs || [])] }
        : m
    ),
  };
  commit('machines');
  logActivity(userName, `uploaded ${doc.tab?.toUpperCase() || 'document'}`, `${doc.filename} → ${getMachine(machineId)?.name}`, 'upload');
  return getMachine(machineId);
}

export function removeMachineDoc(machineId, docId) {
  state = {
    ...state,
    machines: state.machines.map((m) =>
      m.id === machineId ? { ...m, docs: (m.docs || []).filter((d) => d.id !== docId) } : m
    ),
  };
  commit('machines');
  return getMachine(machineId);
}

export function addSparePart(machineId, spare) {
  state = {
    ...state,
    machines: state.machines.map((m) =>
      m.id === machineId ? { ...m, spares: [{ id: uid('s'), ...spare }, ...(m.spares || [])] } : m
    ),
  };
  commit('machines');
}

export function removeSparePart(machineId, spareId) {
  state = {
    ...state,
    machines: state.machines.map((m) =>
      m.id === machineId ? { ...m, spares: (m.spares || []).filter((s) => s.id !== spareId) } : m
    ),
  };
  commit('machines');
}

export function addMachinePhoto(machineId, photo) {
  state = {
    ...state,
    machines: state.machines.map((m) =>
      m.id === machineId ? { ...m, photos: [{ id: uid('p'), addedAt: now(), ...photo }, ...(m.photos || [])] } : m
    ),
  };
  commit('machines');
}

export function removeMachinePhoto(machineId, photoId) {
  state = {
    ...state,
    machines: state.machines.map((m) =>
      m.id === machineId ? { ...m, photos: (m.photos || []).filter((p) => p.id !== photoId) } : m
    ),
  };
  commit('machines');
}

// ---------------- breakdowns ----------------
export const getBreakdowns = () => state.breakdowns;

function nextComplaintNo() {
  const year = new Date().getFullYear();
  const count = state.breakdowns.filter((b) => b.complaintNo?.includes(`BD-${year}`)).length;
  return `BD-${year}-${String(count + 1).padStart(3, '0')}`;
}

export function addBreakdown(fields, userName) {
  const bd = {
    id: uid('b'),
    complaintNo: nextComplaintNo(),
    status: 'open',
    createdAt: now(),
    rootCause: '', actionTaken: '', spareUsed: '', remarks: '',
    downtimeEnd: '', totalDowntimeHrs: 0,
    ...fields,
  };
  state = { ...state, breakdowns: [bd, ...state.breakdowns] };
  commit('breakdowns');
  // machine automatically flips to breakdown status
  if (bd.machineId) updateMachine(bd.machineId, { status: 'breakdown' }, null, true);
  logActivity(userName, 'reported breakdown', `${bd.complaintNo} · ${getMachine(bd.machineId)?.name || bd.machineId}`, 'breakdown');
  return bd;
}

export function updateBreakdown(id, patch, userName) {
  state = { ...state, breakdowns: state.breakdowns.map((b) => (b.id === id ? { ...b, ...patch } : b)) };
  commit('breakdowns');
  if (userName) logActivity(userName, 'updated breakdown', state.breakdowns.find((b) => b.id === id)?.complaintNo || '', 'breakdown');
}

/** Closing computes downtime; MTTR / MTBF / availability recompute downstream. */
export function closeBreakdown(id, closure, userName) {
  const bd = state.breakdowns.find((b) => b.id === id);
  if (!bd) return;
  const start = new Date(closure.downtimeStart || bd.downtimeStart);
  const end = new Date(closure.downtimeEnd || now());
  const hrs = Math.max(0, (end - start) / 3600000);
  state = {
    ...state,
    breakdowns: state.breakdowns.map((b) =>
      b.id === id
        ? { ...b, ...closure, status: 'closed', downtimeEnd: end.toISOString(), totalDowntimeHrs: Math.round(hrs * 100) / 100, closedAt: now() }
        : b
    ),
  };
  commit('breakdowns');
  if (bd.machineId) updateMachine(bd.machineId, { status: 'running' }, null, true);
  logActivity(userName, 'closed breakdown', `${bd.complaintNo} · ${getMachine(bd.machineId)?.name || ''} (${hrs.toFixed(1)} hrs)`, 'breakdown');
}

export function deleteBreakdown(id, userName) {
  const bd = state.breakdowns.find((b) => b.id === id);
  state = { ...state, breakdowns: state.breakdowns.filter((b) => b.id !== id) };
  commit('breakdowns');
  logActivity(userName, 'deleted breakdown', bd?.complaintNo || '', 'breakdown');
}

// ---------------- preventive maintenance ----------------
export const getPMs = () => state.pms;

export function addPM(fields, userName) {
  const pm = {
    id: uid('pm'),
    status: 'scheduled',
    createdAt: now(),
    checklist: [], timeTakenHrs: 0, remarks: '',
    ...fields,
  };
  state = { ...state, pms: [pm, ...state.pms] };
  commit('pms');
  logActivity(userName, 'scheduled PM', `${getMachine(pm.machineId)?.name || ''} · ${pm.frequency}`, 'pm');
  return pm;
}

export function updatePM(id, patch, userName) {
  state = { ...state, pms: state.pms.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
  commit('pms');
  if (userName) logActivity(userName, 'updated PM', getMachine(state.pms.find((p) => p.id === id)?.machineId)?.name || '', 'pm');
}

export function completePM(id, closure, userName) {
  const pm = state.pms.find((p) => p.id === id);
  if (!pm) return;
  state = {
    ...state,
    pms: state.pms.map((p) =>
      p.id === id ? { ...p, ...closure, status: 'completed', completedAt: now() } : p
    ),
  };
  commit('pms');
  logActivity(userName, 'completed PM', `${getMachine(pm.machineId)?.name || ''} · ${pm.frequency}`, 'pm');
}

export function deletePM(id, userName) {
  const pm = state.pms.find((p) => p.id === id);
  state = { ...state, pms: state.pms.filter((p) => p.id !== id) };
  commit('pms');
  logActivity(userName, 'deleted PM schedule', getMachine(pm?.machineId)?.name || '', 'pm');
}

// ---------------- energy logs ----------------
export const getEnergyLogs = () => state.energy;

export function addEnergyLog(fields, userName) {
  const log = { id: uid('e'), createdAt: now(), ...fields, kwh: Number(fields.kwh) || 0 };
  state = { ...state, energy: [log, ...state.energy] };
  commit('energy');
  logActivity(userName, 'added energy log', `${log.source} · ${log.kwh} kWh`, 'energy');
  return log;
}

export function deleteEnergyLog(id, userName) {
  state = { ...state, energy: state.energy.filter((e) => e.id !== id) };
  commit('energy');
  logActivity(userName, 'deleted energy log', '', 'energy');
}

// ---------------- backup / restore ----------------
export function exportBackup() {
  return JSON.stringify(
    { exportedAt: now(), machines: state.machines, breakdowns: state.breakdowns, pms: state.pms, energy: state.energy, activity: state.activity, settings: state.settings },
    null, 2
  );
}

export function importBackup(json) {
  const parsed = JSON.parse(json);
  ['machines', 'breakdowns', 'pms', 'energy', 'activity'].forEach((k) => {
    if (Array.isArray(parsed[k])) {
      state = { ...state, [k]: parsed[k] };
      commit(k);
    }
  });
  if (parsed.settings) updateSettings(parsed.settings);
}

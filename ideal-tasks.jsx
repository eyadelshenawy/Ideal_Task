import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import * as XLSX from 'xlsx';
import {
  Plus, Search, LayoutGrid, List as ListIcon, CalendarDays, Trash2, Pencil, X,
  AlertTriangle, ChevronLeft, ChevronRight, Check, Loader2, Users, Building2,
  Diamond, ToggleLeft, ToggleRight, Upload, Download, Shield
} from 'lucide-react';

// ---------- Brand ----------
const BRAND = { dark: '#0A5A46', light: '#82B478', bg: '#F5F8F6', card: '#FFFFFF', border: '#E1E8E4', text: '#16261F', sub: '#5B6B64' };

const STORAGE_TASKS = 'ideal_tasks_v2';
const STORAGE_TEAM = 'ideal_team_v2';
const STORAGE_CLIENTS = 'ideal_clients_v2';
const WHOAMI_KEY = 'ideal_whoami_v1';

const PALETTE = ['#0A5A46', '#4E8C6E', '#3E7C7C', '#A66A3D', '#7A5C9E', '#C4443D', '#3D6EA6', '#B08D3E', '#707A75', '#8A5A9E'];

const DEFAULT_TEAM = [
  { id: 'eyad', name: 'Eyad Badran', color: '#0A5A46', active: true, isAdmin: true },
  { id: 'esraa', name: 'Esraa Soliman', color: '#4E8C6E', active: true, isAdmin: true },
  { id: 'abdo', name: 'Abdo Sakr', color: '#3E7C7C', active: true },
  { id: 'hossam', name: 'Hossam Hatata', color: '#A66A3D', active: true },
  { id: 'norhan', name: 'Norhan Menshawy', color: '#7A5C9E', active: true },
  { id: 'omarg', name: 'Omar Gouda', color: '#C4443D', active: true },
  { id: 'amry', name: 'Amr Yousef', color: '#3D6EA6', active: true },
  { id: 'amro', name: 'Amr Osama', color: '#B08D3E', active: true },
  { id: 'omarr', name: 'Omar Roushdy', color: '#707A75', active: true },
];

const DEFAULT_CLIENTS = [
  { id: 'internal', name: 'Internal - IDEAL' },
  { id: 'jci', name: 'Johnson Controls International' },
  { id: 'assalam', name: 'As-Salam International Hospital' },
  { id: 'aldawaa', name: 'Al-Dawaa Medical Services' },
  { id: 'aboqir', name: 'Abo Qir Petroleum' },
  { id: 'apex', name: 'Apex Pharmaceutical' },
  { id: 'gulfpack', name: 'Gulf Packaging Company' },
  { id: 'wisayah', name: 'Wisayah' },
  { id: 'fayendra', name: 'Fayendra' },
];

const PRIORITIES = [
  { id: 'high', label: 'High', color: '#C4443D' },
  { id: 'medium', label: 'Medium', color: '#D98B3A' },
  { id: 'low', label: 'Low', color: '#6B8F80' },
];

const STATUSES = [
  { id: 'todo', label: 'To Do', color: '#8A8F8C' },
  { id: 'inprogress', label: 'In Progress', color: '#82B478' },
  { id: 'review', label: 'Review', color: '#D98B3A' },
  { id: 'done', label: 'Done', color: '#0A5A46' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------- Helpers ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function diffDays(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 86400000);
}

function formatDateDisplay(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function dueBadge(task) {
  if (!task.dueDate) return null;
  const diff = diffDays(todayStr(), task.dueDate);
  if (task.status === 'done') return { label: formatDateDisplay(task.dueDate), tone: 'done' };
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, tone: 'overdue' };
  if (diff === 0) return { label: 'Due today', tone: 'soon' };
  if (diff <= 2) return { label: `Due in ${diff}d`, tone: 'soon' };
  return { label: formatDateDisplay(task.dueDate), tone: 'normal' };
}

function toneStyle(tone) {
  switch (tone) {
    case 'overdue': return { background: '#FBE7E5', color: '#9A3530' };
    case 'soon': return { background: '#FBEEDD', color: '#8A5A20' };
    case 'done': return { background: '#E4EFE8', color: '#0A5A46' };
    default: return { background: '#EEF2F0', color: '#5B6B64' };
  }
}

function initials(name) {
  return name.trim().split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

function priorityWeight(p) { return p === 'high' ? 0 : p === 'medium' ? 1 : 2; }

function blankTask() {
  return {
    id: '', code: '', title: '', description: '', clientId: '', assigneeId: '', priority: 'medium',
    startDate: '', dueDate: '', status: 'todo', progress: 0, isMilestone: false,
    dependsOn: [], createdAt: Date.now()
  };
}

// ---------- Excel import helpers ----------
function normalizeKeyRow(row) {
  const out = {};
  Object.keys(row).forEach(k => { out[String(k).trim().toLowerCase()] = row[k]; });
  return out;
}

function pick(nrow, aliases) {
  for (const a of aliases) { if (nrow[a] !== undefined && nrow[a] !== '') return nrow[a]; }
  return '';
}

function excelValueToDateStr(value) {
  if (value === '' || value === undefined || value === null) return '';
  if (typeof value === 'number') {
    const utcDays = Math.floor(value - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  return '';
}

function matchStatus(s) {
  const v = String(s || '').trim().toLowerCase();
  const found = STATUSES.find(st => st.label.toLowerCase() === v || st.id === v);
  return found ? found.id : 'todo';
}
function matchPriority(s) {
  const v = String(s || '').trim().toLowerCase();
  const found = PRIORITIES.find(p => p.label.toLowerCase() === v || p.id === v);
  return found ? found.id : 'medium';
}
function matchBool(s) {
  const v = String(s || '').trim().toLowerCase();
  return v === 'yes' || v === 'y' || v === 'true' || v === '1';
}

function parseImportRows(rows, existingClients, existingTeam, existingTasks) {
  const newClientsMap = {};
  const newTeamMap = {};
  const warnings = [];
  const parsedRows = [];

  function resolveClient(nameRaw) {
    const name = String(nameRaw || '').trim();
    if (!name) return '';
    const lower = name.toLowerCase();
    const existing = existingClients.find(c => c.name.toLowerCase() === lower);
    if (existing) return existing.id;
    if (newClientsMap[lower]) return newClientsMap[lower].id;
    const id = uid();
    newClientsMap[lower] = { id, name };
    return id;
  }

  function resolveAssignee(nameRaw) {
    const name = String(nameRaw || '').trim();
    if (!name) return '';
    const lower = name.toLowerCase();
    const existing = existingTeam.find(m => m.name.toLowerCase() === lower);
    if (existing) return existing.id;
    if (newTeamMap[lower]) return newTeamMap[lower].id;
    const id = uid();
    newTeamMap[lower] = { id, name, color: PALETTE[(existingTeam.length + Object.keys(newTeamMap).length) % PALETTE.length], active: true };
    return id;
  }

  rows.forEach((row, idx) => {
    const nrow = normalizeKeyRow(row);
    const title = pick(nrow, ['title', 'task', 'name', 'task name']);
    if (!title) { warnings.push(`Row ${idx + 2}: skipped — no title`); return; }
    const code = pick(nrow, ['code', 'id', 'task id', 'wbs']);
    const projectRaw = pick(nrow, ['project', 'client', 'project/client', 'project / client']);
    const assigneeRaw = pick(nrow, ['assignee', 'owner', 'assigned to']);
    const priorityRaw = pick(nrow, ['priority']);
    const statusRaw = pick(nrow, ['status']);
    const startRaw = pick(nrow, ['start date', 'start']);
    const dueRaw = pick(nrow, ['due date', 'due', 'end date', 'end', 'deadline']);
    const progressRaw = pick(nrow, ['progress', '%', '% complete', 'percent complete']);
    const milestoneRaw = pick(nrow, ['milestone', 'is milestone']);
    const dependsRaw = pick(nrow, ['depends on', 'dependencies', 'predecessor', 'predecessors']);

    parsedRows.push({
      id: uid(),
      code: String(code || '').trim(),
      title: String(title).trim(),
      description: '',
      clientId: resolveClient(projectRaw),
      assigneeId: resolveAssignee(assigneeRaw),
      priority: matchPriority(priorityRaw),
      status: matchStatus(statusRaw),
      startDate: excelValueToDateStr(startRaw),
      dueDate: excelValueToDateStr(dueRaw),
      progress: Math.max(0, Math.min(100, Number(progressRaw) || 0)),
      isMilestone: matchBool(milestoneRaw),
      dependsOn: [],
      _dependsRaw: String(dependsRaw || ''),
      createdAt: Date.now(),
    });
  });

  const codeToId = {};
  existingTasks.forEach(t => { if (t.code) codeToId[t.code.trim().toLowerCase()] = t.id; });
  parsedRows.forEach(t => { if (t.code) codeToId[t.code.trim().toLowerCase()] = t.id; });

  parsedRows.forEach(t => {
    if (t._dependsRaw) {
      const codes = t._dependsRaw.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
      const ids = [];
      codes.forEach(c => {
        if (codeToId[c]) ids.push(codeToId[c]);
        else warnings.push(`"${t.title}" depends on unknown code "${c}"`);
      });
      t.dependsOn = ids;
    }
    delete t._dependsRaw;
  });

  return { tasksToAdd: parsedRows, newClients: Object.values(newClientsMap), newTeamMembers: Object.values(newTeamMap), warnings };
}

function isBlocked(task, allTasks) {
  return (task.dependsOn || []).some(id => {
    const dep = allTasks.find(t => t.id === id);
    return dep && dep.status !== 'done';
  });
}

function blockedByNames(task, allTasks) {
  return (task.dependsOn || [])
    .map(id => allTasks.find(t => t.id === id))
    .filter(d => d && d.status !== 'done')
    .map(d => d.title);
}

const inputStyle = { border: `1px solid ${BRAND.border}` };

// ---------- Small UI atoms ----------
function Chip({ children, style, small }) {
  return (
    <span style={{ ...style, fontSize: small ? 11 : 12, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap', display: 'inline-block' }}>
      {children}
    </span>
  );
}

function Avatar({ member, size = 26 }) {
  if (!member) {
    return (
      <div title="Unassigned" style={{ width: size, height: size, borderRadius: '50%', background: '#DDE3E0', color: '#7A837E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>?</div>
    );
  }
  return (
    <div title={member.name + (member.active === false ? ' (Inactive)' : '')} style={{ width: size, height: size, borderRadius: '50%', background: member.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, opacity: member.active === false ? 0.5 : 1 }}>
      {initials(member.name)}
    </div>
  );
}

function StatCard({ label, value, color, onClick, active }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? color : BRAND.card,
        border: `1px solid ${active ? color : BRAND.border}`,
        flex: 1, minWidth: 84, textAlign: 'center', borderRadius: 10, padding: '9px 4px'
      }}
    >
      <div style={{ fontSize: 19, fontWeight: 700, color: active ? '#fff' : BRAND.text }}>{value}</div>
      <div style={{ fontSize: 10.5, color: active ? '#fff' : BRAND.sub, marginTop: 2 }}>{label}</div>
    </button>
  );
}

function ProgressBar({ value, color }) {
  return (
    <div style={{ height: 4, background: '#EEF2F0', borderRadius: 999, overflow: 'hidden', marginTop: 6 }}>
      <div style={{ height: '100%', width: `${value || 0}%`, background: color }} />
    </div>
  );
}

// ---------- Task card ----------
function TaskCard({ task, team, clients, allTasks, onEdit, onDelete, onMove, confirmingId, setConfirmingId }) {
  const priority = PRIORITIES.find(p => p.id === task.priority);
  const status = STATUSES.find(s => s.id === task.status);
  const member = team.find(t => t.id === task.assigneeId);
  const client = clients.find(c => c.id === task.clientId);
  const badge = dueBadge(task);
  const statusIdx = STATUSES.findIndex(s => s.id === task.status);
  const isConfirming = confirmingId === task.id;
  const blocked = isBlocked(task, allTasks);

  return (
    <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRight: `4px solid ${priority.color}`, borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
          {task.isMilestone && <Diamond size={12} style={{ color: BRAND.dark, flexShrink: 0 }} />}
          <div style={{
            fontWeight: 600, fontSize: 13.5, color: BRAND.text, lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
          }} title={task.title}>
            {task.code && <span style={{ fontFamily: 'monospace', fontSize: 11, color: BRAND.sub, marginRight: 4 }}>{task.code}</span>}
            {task.title}
          </div>
        </div>
        <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
          <button onClick={() => onEdit(task)} title="Edit" style={{ color: BRAND.sub }} className="p-1 rounded hover:bg-gray-100">
            <Pencil size={14} />
          </button>
          <button
            onClick={() => isConfirming ? onDelete(task.id) : setConfirmingId(task.id)}
            title={isConfirming ? 'Click to confirm' : 'Delete'}
            style={{ color: isConfirming ? '#C4443D' : BRAND.sub }}
            className="p-1 rounded hover:bg-gray-100"
          >
            {isConfirming ? <Check size={14} /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
        {client && <Chip small style={{ background: '#EEF2F0', color: BRAND.sub }}>{client.name}</Chip>}
        {blocked && (
          <Chip small style={{ background: '#FBE7E5', color: '#9A3530' }}>
            <span className="flex items-center gap-1"><AlertTriangle size={10} /> Blocked</span>
          </Chip>
        )}
      </div>

      {!task.isMilestone && <ProgressBar value={task.progress} color={status.color} />}

      <div className="flex items-center justify-between mt-2.5">
        <div className="flex items-center gap-0.5">
          <button onClick={() => onMove(task, -1)} disabled={statusIdx === 0} title="Move to previous status" style={{ color: statusIdx === 0 ? '#D5DAD7' : BRAND.sub }} className="p-0.5">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => onMove(task, 1)} disabled={statusIdx === STATUSES.length - 1} title="Move to next status" style={{ color: statusIdx === STATUSES.length - 1 ? '#D5DAD7' : BRAND.sub }} className="p-0.5">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {badge && <Chip small style={toneStyle(badge.tone)}>{badge.label}</Chip>}
          <Avatar member={member} size={24} />
        </div>
      </div>
    </div>
  );
}

// ---------- Task modal ----------
function TaskModal({ draft, setDraft, onClose, onSave, error, team, clients, allTasks }) {
  const activeMembers = team.filter(m => m.active !== false);
  const inactiveMembers = team.filter(m => m.active === false);
  const otherTasks = allTasks.filter(t => t.id !== draft.id);

  function toggleDepend(id) {
    const cur = draft.dependsOn || [];
    setDraft({ ...draft, dependsOn: cur.includes(id) ? cur.filter(d => d !== id) : [...cur, id] });
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,26,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', padding: 20 }}>
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontWeight: 700, fontSize: 16, color: BRAND.text }}>{draft.id ? 'Edit Task' : 'New Task'}</h2>
          <button onClick={onClose} style={{ color: BRAND.sub }}><X size={18} /></button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div style={{ width: 90, flexShrink: 0 }}>
              <label className="text-xs font-semibold" style={{ color: BRAND.sub }}>Code</label>
              <input value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value })} placeholder="e.g. IDT-01" style={{ ...inputStyle, fontFamily: 'monospace' }} className="w-full mt-1 rounded-lg px-2 py-2 text-sm outline-none" />
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold" style={{ color: BRAND.sub }}>Title *</label>
              <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Task name" style={inputStyle} className="w-full mt-1 rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
          </div>
          {error && <div className="text-xs -mt-2" style={{ color: '#C4443D' }}>{error}</div>}

          <div>
            <label className="text-xs font-semibold" style={{ color: BRAND.sub }}>Description</label>
            <textarea value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} rows={2} placeholder="Optional details" style={inputStyle} className="w-full mt-1 rounded-lg px-3 py-2 text-sm outline-none resize-none" />
          </div>

          <div>
            <label className="text-xs font-semibold" style={{ color: BRAND.sub }}>Project / Client</label>
            <select value={draft.clientId} onChange={e => setDraft({ ...draft, clientId: e.target.value })} style={inputStyle} className="w-full mt-1 rounded-lg px-2 py-2 text-sm outline-none">
              <option value="">No project</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold" style={{ color: BRAND.sub }}>Assignee</label>
              <select value={draft.assigneeId} onChange={e => setDraft({ ...draft, assigneeId: e.target.value })} style={inputStyle} className="w-full mt-1 rounded-lg px-2 py-2 text-sm outline-none">
                <option value="">Unassigned</option>
                {activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                {inactiveMembers.length > 0 && (
                  <optgroup label="Inactive">
                    {inactiveMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: BRAND.sub }}>Priority</label>
              <select value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value })} style={inputStyle} className="w-full mt-1 rounded-lg px-2 py-2 text-sm outline-none">
                {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold" style={{ color: BRAND.sub }}>
            <input type="checkbox" checked={draft.isMilestone} onChange={e => setDraft({ ...draft, isMilestone: e.target.checked })} />
            This is a milestone (single-date marker, no duration)
          </label>

          <div className="grid grid-cols-2 gap-3">
            {!draft.isMilestone && (
              <div>
                <label className="text-xs font-semibold" style={{ color: BRAND.sub }}>Start Date</label>
                <input type="date" value={draft.startDate} onChange={e => setDraft({ ...draft, startDate: e.target.value })} style={inputStyle} className="w-full mt-1 rounded-lg px-2 py-2 text-sm outline-none" />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold" style={{ color: BRAND.sub }}>{draft.isMilestone ? 'Milestone Date' : 'Due Date'}</label>
              <input type="date" value={draft.dueDate} onChange={e => setDraft({ ...draft, dueDate: e.target.value })} style={inputStyle} className="w-full mt-1 rounded-lg px-2 py-2 text-sm outline-none" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold" style={{ color: BRAND.sub }}>Status</label>
            <select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })} style={inputStyle} className="w-full mt-1 rounded-lg px-2 py-2 text-sm outline-none">
              {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>

          {!draft.isMilestone && (
            <div>
              <label className="text-xs font-semibold flex items-center justify-between" style={{ color: BRAND.sub }}>
                <span>Progress</span><span>{draft.progress || 0}%</span>
              </label>
              <input type="range" min="0" max="100" step="5" value={draft.progress || 0} onChange={e => setDraft({ ...draft, progress: Number(e.target.value) })} className="w-full mt-1" />
            </div>
          )}

          <div>
            <label className="text-xs font-semibold" style={{ color: BRAND.sub }}>Depends on (predecessor tasks)</label>
            <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, maxHeight: 120, overflowY: 'auto', padding: 8, marginTop: 4 }}>
              {otherTasks.length === 0 && <div style={{ fontSize: 12, color: BRAND.sub }}>No other tasks yet</div>}
              {otherTasks.map(t => (
                <label key={t.id} className="flex items-center gap-2 text-xs py-0.5" style={{ color: BRAND.text }}>
                  <input type="checkbox" checked={(draft.dependsOn || []).includes(t.id)} onChange={() => toggleDepend(t.id)} />
                  {t.title}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-5">
          <button onClick={onSave} style={{ background: BRAND.dark, color: '#fff' }} className="flex-1 rounded-lg py-2.5 text-sm font-semibold">Save</button>
          <button onClick={onClose} style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }} className="flex-1 rounded-lg py-2.5 text-sm font-semibold">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Team modal ----------
function TeamModal({ team, currentUserId, onClose, onAdd, onRename, onToggleActive, onToggleAdmin }) {
  const [newName, setNewName] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,26,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, maxHeight: '85vh', overflowY: 'auto', padding: 20 }}>
        <div className="flex items-center justify-between mb-3">
          <h2 style={{ fontWeight: 700, fontSize: 16, color: BRAND.text }}>Manage Team</h2>
          <button onClick={onClose} style={{ color: BRAND.sub }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 11.5, color: BRAND.sub, marginBottom: 10 }}>
          Toggle a member to Inactive when they leave — their past tasks stay untouched. The shield marks who can add tasks, projects and team members.
        </div>
        <div>
          {team.map(m => {
            const isSelf = m.id === currentUserId;
            return (
              <div key={m.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: `1px solid ${BRAND.border}`, opacity: m.active === false ? 0.55 : 1 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                <input value={m.name} onChange={e => onRename(m.id, e.target.value)} style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, background: 'transparent', color: BRAND.text }} />
                <button
                  onClick={() => !isSelf && onToggleAdmin(m.id)}
                  title={isSelf ? "You can't change your own admin access here" : (m.isAdmin ? 'Remove admin access' : 'Grant admin access')}
                  style={{ color: m.isAdmin ? BRAND.dark : '#C7CFCB', cursor: isSelf ? 'not-allowed' : 'pointer' }}
                >
                  <Shield size={17} fill={m.isAdmin ? BRAND.dark : 'none'} />
                </button>
                <button onClick={() => onToggleActive(m.id)} title={m.active === false ? 'Mark as active' : 'Mark as inactive'} style={{ color: m.active === false ? BRAND.sub : BRAND.dark }}>
                  {m.active === false ? <ToggleLeft size={20} /> : <ToggleRight size={20} />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-3">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New team member name" style={inputStyle} className="flex-1 rounded-lg px-3 py-2 text-sm outline-none" />
          <button
            onClick={() => { if (newName.trim()) { onAdd(newName.trim()); setNewName(''); } }}
            style={{ background: BRAND.dark, color: '#fff' }} className="rounded-lg px-3"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Clients modal ----------
function ClientsModal({ clients, onClose, onAdd, onRename, onDelete }) {
  const [newName, setNewName] = useState('');
  const [confirmingId, setConfirmingId] = useState(null);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,26,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 400, maxHeight: '85vh', overflowY: 'auto', padding: 20 }}>
        <div className="flex items-center justify-between mb-3">
          <h2 style={{ fontWeight: 700, fontSize: 16, color: BRAND.text }}>Manage Projects / Clients</h2>
          <button onClick={onClose} style={{ color: BRAND.sub }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 11.5, color: BRAND.sub, marginBottom: 10 }}>
          Deleting a project unassigns it from any tasks that used it — those tasks are kept.
        </div>
        <div>
          {clients.map(c => {
            const isConfirming = confirmingId === c.id;
            return (
              <div key={c.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                <input value={c.name} onChange={e => onRename(c.id, e.target.value)} style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, background: 'transparent', color: BRAND.text }} />
                <button
                  onClick={() => isConfirming ? onDelete(c.id) : setConfirmingId(c.id)}
                  title={isConfirming ? 'Click to confirm delete' : 'Delete'}
                  style={{ color: isConfirming ? '#C4443D' : BRAND.sub }}
                >
                  {isConfirming ? <Check size={16} /> : <Trash2 size={16} />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-3">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New project or client name" style={inputStyle} className="flex-1 rounded-lg px-3 py-2 text-sm outline-none" />
          <button
            onClick={() => { if (newName.trim()) { onAdd(newName.trim()); setNewName(''); } }}
            style={{ background: BRAND.dark, color: '#fff' }} className="rounded-lg px-3"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Import preview modal ----------
function ImportPreviewModal({ preview, onConfirm, onCancel }) {
  if (!preview) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,26,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 440, maxHeight: '85vh', overflowY: 'auto', padding: 20 }}>
        <div className="flex items-center justify-between mb-3">
          <h2 style={{ fontWeight: 700, fontSize: 16, color: BRAND.text }}>Import Preview</h2>
          <button onClick={onCancel} style={{ color: BRAND.sub }}><X size={18} /></button>
        </div>

        <div style={{ fontSize: 13, color: BRAND.text, marginBottom: 8 }}>
          Found <b>{preview.tasksToAdd.length}</b> task{preview.tasksToAdd.length === 1 ? '' : 's'} to import.
        </div>
        {preview.newClients.length > 0 && (
          <div style={{ fontSize: 12, color: BRAND.sub, marginBottom: 4 }}>New projects: {preview.newClients.map(c => c.name).join(', ')}</div>
        )}
        {preview.newTeamMembers.length > 0 && (
          <div style={{ fontSize: 12, color: BRAND.sub, marginBottom: 4 }}>New team members: {preview.newTeamMembers.map(m => m.name).join(', ')}</div>
        )}
        {preview.warnings.length > 0 && (
          <div style={{ background: '#FBEEDD', color: '#8A5A20', borderRadius: 8, padding: 8, marginTop: 6, fontSize: 11.5, maxHeight: 100, overflowY: 'auto' }}>
            {preview.warnings.map((w, i) => <div key={i}>{w}</div>)}
          </div>
        )}
        <div style={{ maxHeight: 180, overflowY: 'auto', border: `1px solid ${BRAND.border}`, borderRadius: 8, marginTop: 10, padding: 8 }}>
          {preview.tasksToAdd.length === 0 && <div style={{ fontSize: 12, color: BRAND.sub }}>No valid rows found — check the template format.</div>}
          {preview.tasksToAdd.slice(0, 25).map(t => (
            <div key={t.id} style={{ fontSize: 12, padding: '2px 0', color: BRAND.text }}>
              {t.code ? `[${t.code}] ` : ''}{t.title}
            </div>
          ))}
          {preview.tasksToAdd.length > 25 && <div style={{ fontSize: 11, color: BRAND.sub }}>and {preview.tasksToAdd.length - 25} more…</div>}
        </div>

        <div className="flex items-center gap-2 mt-4">
          <button onClick={onConfirm} disabled={preview.tasksToAdd.length === 0} style={{ background: BRAND.dark, color: '#fff', opacity: preview.tasksToAdd.length === 0 ? 0.5 : 1 }} className="flex-1 rounded-lg py-2.5 text-sm font-semibold">
            Import {preview.tasksToAdd.length} task{preview.tasksToAdd.length === 1 ? '' : 's'}
          </button>
          <button onClick={onCancel} style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }} className="flex-1 rounded-lg py-2.5 text-sm font-semibold">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Gantt / Timeline view ----------
function GanttView({ tasks, team, onEditTask }) {
  const dayWidth = 30, rowHeight = 42, headerHeight = 46, sidebarWidth = 210;

  const { start, end } = useMemo(() => {
    const dates = [];
    tasks.forEach(t => { if (t.startDate) dates.push(t.startDate); if (t.dueDate) dates.push(t.dueDate); });
    if (dates.length === 0) {
      const t0 = todayStr();
      return { start: addDays(t0, -3), end: addDays(t0, 17) };
    }
    dates.sort();
    return { start: addDays(dates[0], -2), end: addDays(dates[dates.length - 1], 4) };
  }, [tasks]);

  const days = useMemo(() => {
    const arr = [];
    let cur = start;
    const todayS = todayStr();
    while (cur <= end) {
      const [y, m, d] = cur.split('-').map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      arr.push({ date: cur, dayNum: d, isWeekend: dow === 5 || dow === 6, isMonthStart: d === 1, monthLabel: MONTHS[m - 1], isToday: cur === todayS });
      cur = addDays(cur, 1);
    }
    return arr;
  }, [start, end]);

  const totalWidth = sidebarWidth + days.length * dayWidth;
  const totalHeight = headerHeight + tasks.length * rowHeight;
  const xForDate = (dateStr) => sidebarWidth + diffDays(start, dateStr) * dayWidth;

  const bars = useMemo(() => tasks.map((t, i) => {
    const effStart = t.startDate || t.dueDate;
    const effEnd = t.dueDate || t.startDate;
    if (!effStart) return null;
    const x1 = xForDate(effStart);
    const x2 = xForDate(effEnd) + dayWidth;
    return { task: t, rowIndex: i, x: x1, width: Math.max(x2 - x1, dayWidth), y: headerHeight + i * rowHeight };
  }).filter(Boolean), [tasks, start]);

  const barById = useMemo(() => {
    const map = {};
    bars.forEach(b => { map[b.task.id] = b; });
    return map;
  }, [bars]);

  const arrows = useMemo(() => {
    const list = [];
    bars.forEach(b => {
      (b.task.dependsOn || []).forEach(depId => {
        const pred = barById[depId];
        if (!pred) return;
        list.push({ x1: pred.x + pred.width, y1: pred.y + rowHeight / 2, x2: b.x, y2: b.y + rowHeight / 2 });
      });
    });
    return list;
  }, [bars, barById]);

  const todayX = xForDate(todayStr()) + dayWidth / 2;

  if (tasks.length === 0) {
    return <div style={{ color: BRAND.sub, textAlign: 'center', padding: '40px 0', fontSize: 13 }}>No tasks to show on the timeline</div>;
  }

  return (
    <div style={{ overflow: 'auto', maxHeight: 520, border: `1px solid ${BRAND.border}`, borderRadius: 10, background: '#fff' }}>
      <div style={{ position: 'relative', width: totalWidth, height: totalHeight }}>
        <div style={{ display: 'grid', gridTemplateColumns: `${sidebarWidth}px repeat(${days.length}, ${dayWidth}px)` }}>
          <div style={{ position: 'sticky', top: 0, left: 0, zIndex: 4, background: '#fff', borderBottom: `1px solid ${BRAND.border}`, borderLeft: `1px solid ${BRAND.border}`, height: headerHeight, display: 'flex', alignItems: 'center', paddingLeft: 10, fontSize: 11, fontWeight: 700, color: BRAND.sub }}>
            TASK
          </div>
          {days.map(d => (
            <div key={d.date} style={{
              position: 'sticky', top: 0, zIndex: 2, height: headerHeight,
              background: d.isToday ? '#E4EFE8' : d.isWeekend ? '#F5F8F6' : '#fff',
              borderBottom: `1px solid ${BRAND.border}`, borderLeft: `1px solid ${BRAND.border}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4,
              fontSize: 10, color: BRAND.sub, position: 'relative'
            }}>
              {d.isMonthStart && <div style={{ position: 'absolute', top: 3, fontSize: 9, fontWeight: 700, color: BRAND.dark }}>{d.monthLabel}</div>}
              <div style={{ fontWeight: d.isToday ? 700 : 400 }}>{d.dayNum}</div>
            </div>
          ))}

          {tasks.map((t) => (
            <Fragment key={t.id}>
              <div onClick={() => onEditTask(t)} style={{
                position: 'sticky', left: 0, zIndex: 3, background: '#fff', borderBottom: `1px solid ${BRAND.border}`, borderLeft: `1px solid ${BRAND.border}`,
                height: rowHeight, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', cursor: 'pointer', fontSize: 12
              }}>
                {t.isMilestone && <Diamond size={11} style={{ color: BRAND.dark, flexShrink: 0 }} />}
                {t.code && <span style={{ fontFamily: 'monospace', fontSize: 10, color: BRAND.sub, flexShrink: 0 }}>{t.code}</span>}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: BRAND.text }}>{t.title}</span>
              </div>
              {days.map(d => (
                <div key={t.id + d.date} style={{ height: rowHeight, borderBottom: `1px solid ${BRAND.border}`, borderLeft: `1px solid ${BRAND.border}`, background: d.isWeekend ? '#FAFCFB' : '#fff' }} />
              ))}
            </Fragment>
          ))}
        </div>

        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <svg width={totalWidth} height={totalHeight} style={{ position: 'absolute', top: 0, left: 0 }}>
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="#9AA6A0" />
              </marker>
            </defs>
            <line x1={todayX} y1={headerHeight} x2={todayX} y2={totalHeight} stroke="#C4443D" strokeWidth="1" strokeDasharray="3,3" />
            {arrows.map((a, idx) => (
              <line key={idx} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="#9AA6A0" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
            ))}
          </svg>

          {bars.map(b => {
            const status = STATUSES.find(s => s.id === b.task.status);
            if (b.task.isMilestone) {
              return (
                <div key={b.task.id} onClick={() => onEditTask(b.task)} title={b.task.title} style={{
                  position: 'absolute', left: b.x - 6, top: b.y + rowHeight / 2 - 6, width: 12, height: 12,
                  background: BRAND.dark, transform: 'rotate(45deg)', pointerEvents: 'auto', cursor: 'pointer'
                }} />
              );
            }
            return (
              <div key={b.task.id} onClick={() => onEditTask(b.task)} title={`${b.task.title} — ${b.task.progress || 0}%`} style={{
                position: 'absolute', left: b.x + 1, top: b.y + (rowHeight - 20) / 2, width: b.width - 2, height: 20,
                borderRadius: 5, background: status.color + '33', border: `1px solid ${status.color}`, pointerEvents: 'auto', cursor: 'pointer', overflow: 'hidden'
              }}>
                <div style={{ height: '100%', width: `${b.task.progress || 0}%`, background: status.color }} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- Main App ----------
export default function IdealTasksApp() {
  const [tasks, setTasks] = useState([]);
  const [team, setTeam] = useState([]);
  const [clients, setClients] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [view, setView] = useState('board');
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(blankTask());
  const [formError, setFormError] = useState('');
  const [confirmingId, setConfirmingId] = useState(null);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [clientsModalOpen, setClientsModalOpen] = useState(false);
  const [sortBy, setSortBy] = useState('dueDate');
  const [filters, setFilters] = useState({ search: '', assigneeId: 'all', priority: 'all', clientId: 'all', overdueOnly: false, milestonesOnly: false });
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_TASKS, true);
        if (r && r.value) setTasks(JSON.parse(r.value));
      } catch (e) { /* none yet */ }
      try {
        const r = await window.storage.get(STORAGE_TEAM, true);
        setTeam(r && r.value ? JSON.parse(r.value) : DEFAULT_TEAM);
      } catch (e) { setTeam(DEFAULT_TEAM); }
      try {
        const r = await window.storage.get(STORAGE_CLIENTS, true);
        setClients(r && r.value ? JSON.parse(r.value) : DEFAULT_CLIENTS);
      } catch (e) { setClients(DEFAULT_CLIENTS); }
      try {
        const r = await window.storage.get(WHOAMI_KEY, false);
        if (r && r.value) setCurrentUserId(r.value);
      } catch (e) { /* not set yet */ }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { if (loaded) window.storage.set(STORAGE_TASKS, JSON.stringify(tasks), true).catch(() => setSaveError(true)); }, [tasks, loaded]);
  useEffect(() => { if (loaded) window.storage.set(STORAGE_TEAM, JSON.stringify(team), true).catch(() => setSaveError(true)); }, [team, loaded]);
  useEffect(() => { if (loaded) window.storage.set(STORAGE_CLIENTS, JSON.stringify(clients), true).catch(() => setSaveError(true)); }, [clients, loaded]);
  useEffect(() => { if (loaded && currentUserId) window.storage.set(WHOAMI_KEY, currentUserId, false).catch(() => {}); }, [currentUserId, loaded]);

  const currentMember = team.find(m => m.id === currentUserId);
  const isAdmin = !!(currentMember && currentMember.isAdmin);

  const today = todayStr();

  const stats = useMemo(() => ({
    total: tasks.length,
    inProgress: tasks.filter(t => t.status === 'inprogress').length,
    overdue: tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== 'done').length,
    done: tasks.filter(t => t.status === 'done').length,
    milestones: tasks.filter(t => t.isMilestone).length,
  }), [tasks, today]);

  function sortTasks(list) {
    const arr = [...list];
    if (sortBy === 'dueDate') arr.sort((a, b) => (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1);
    else if (sortBy === 'priority') arr.sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority));
    else if (sortBy === 'assignee') arr.sort((a, b) => {
      const an = team.find(m => m.id === a.assigneeId)?.name || 'zzz';
      const bn = team.find(m => m.id === b.assigneeId)?.name || 'zzz';
      return an.localeCompare(bn);
    });
    else arr.sort((a, b) => b.createdAt - a.createdAt);
    return arr;
  }

  const filteredTasks = useMemo(() => tasks.filter(t => {
    if (filters.overdueOnly && !(t.dueDate && t.dueDate < today && t.status !== 'done')) return false;
    if (filters.milestonesOnly && !t.isMilestone) return false;
    if (filters.assigneeId !== 'all' && t.assigneeId !== filters.assigneeId) return false;
    if (filters.priority !== 'all' && t.priority !== filters.priority) return false;
    if (filters.clientId !== 'all' && t.clientId !== filters.clientId) return false;
    if (filters.search) {
      const q = filters.search.trim().toLowerCase();
      const clientName = clients.find(c => c.id === t.clientId)?.name || '';
      if (!t.title.toLowerCase().includes(q) && !clientName.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [tasks, filters, today, clients]);

  function openNew() { setDraft(blankTask()); setFormError(''); setModalOpen(true); }
  function openEdit(task) { setDraft({ ...task }); setFormError(''); setModalOpen(true); }

  function saveDraft() {
    if (!draft.title.trim()) { setFormError('Title is required'); return; }
    const finalDraft = { ...draft, progress: draft.status === 'done' ? 100 : draft.progress };
    if (finalDraft.id) setTasks(prev => prev.map(t => t.id === finalDraft.id ? finalDraft : t));
    else setTasks(prev => [...prev, { ...finalDraft, id: uid(), createdAt: Date.now() }]);
    setModalOpen(false);
  }

  function deleteTask(id) {
    setTasks(prev => prev.filter(t => t.id !== id).map(t => ({ ...t, dependsOn: (t.dependsOn || []).filter(d => d !== id) })));
    setConfirmingId(null);
  }

  function moveTask(task, dir) {
    const idx = STATUSES.findIndex(s => s.id === task.status);
    const next = STATUSES[idx + dir];
    if (!next) return;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next.id, progress: next.id === 'done' ? 100 : t.progress } : t));
  }

  // Team management
  function addMember(name) { setTeam(prev => [...prev, { id: uid(), name, color: PALETTE[prev.length % PALETTE.length], active: true }]); }
  function renameMember(id, name) { setTeam(prev => prev.map(m => m.id === id ? { ...m, name } : m)); }
  function toggleActive(id) { setTeam(prev => prev.map(m => m.id === id ? { ...m, active: m.active === false ? true : false } : m)); }
  function toggleAdmin(id) { setTeam(prev => prev.map(m => m.id === id ? { ...m, isAdmin: !m.isAdmin } : m)); }

  // Client management
  function addClient(name) { setClients(prev => [...prev, { id: uid(), name }]); }
  function renameClient(id, name) { setClients(prev => prev.map(c => c.id === id ? { ...c, name } : c)); }
  function deleteClient(id) {
    setClients(prev => prev.filter(c => c.id !== id));
    setTasks(prev => prev.map(t => t.clientId === id ? { ...t, clientId: '' } : t));
  }

  // Excel import / export
  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setImportError('');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
      const result = parseImportRows(rows, clients, team, tasks);
      setImportPreview(result);
    } catch (err) {
      setImportError("Couldn't read this file — please use the downloaded template format.");
    }
    e.target.value = '';
  }

  function confirmImport() {
    if (!importPreview) return;
    if (importPreview.newClients.length) setClients(prev => [...prev, ...importPreview.newClients]);
    if (importPreview.newTeamMembers.length) setTeam(prev => [...prev, ...importPreview.newTeamMembers]);
    setTasks(prev => [...prev, ...importPreview.tasksToAdd]);
    setImportPreview(null);
  }

  function downloadTemplate() {
    const sampleRows = [
      { Code: 'IDT-001', Title: 'Kickoff meeting', Project: 'Fayendra', Assignee: 'Eyad Badran', Priority: 'High', Status: 'To Do', 'Start Date': '2026-08-01', 'Due Date': '2026-08-03', Progress: 0, Milestone: 'No', 'Depends On': '' },
      { Code: 'IDT-002', Title: 'Go-live', Project: 'Fayendra', Assignee: '', Priority: 'High', Status: 'To Do', 'Start Date': '', 'Due Date': '2026-09-15', Progress: 0, Milestone: 'Yes', 'Depends On': 'IDT-001' },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wbOut = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbOut, ws, 'Tasks');
    const wbout = XLSX.write(wbOut, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'IDEAL-Tasks-Template.xlsx';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (!loaded) {
    return <div style={{ background: BRAND.bg, minHeight: '100vh' }} className="flex items-center justify-center"><Loader2 className="animate-spin" style={{ color: BRAND.dark }} size={28} /></div>;
  }

  const sortedBoard = (statusId) => sortTasks(filteredTasks.filter(t => t.status === statusId));
  const sortedList = sortTasks(filteredTasks);
  const sortedGantt = sortTasks(filteredTasks);

  return (
    <div style={{ background: BRAND.bg, minHeight: '100vh', fontFamily: 'Segoe UI, Tahoma, Arial, sans-serif' }}>
      <div style={{ background: BRAND.dark }} className="px-4 py-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div style={{ position: 'relative', width: 30, height: 30 }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: 20, height: 20, borderRadius: 6, background: '#fff' }} />
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderRadius: 6, background: BRAND.light }} />
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, lineHeight: 1.1 }}>IDEAL Tasks</div>
              <div style={{ color: '#CFE3D8', fontSize: 11 }}>Team Task Manager</div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: 2 }} className="flex">
              <button onClick={() => setView('board')} style={{ background: view === 'board' ? '#fff' : 'transparent', color: view === 'board' ? BRAND.dark : '#fff' }} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold">
                <LayoutGrid size={13} /> Board
              </button>
              <button onClick={() => setView('list')} style={{ background: view === 'list' ? '#fff' : 'transparent', color: view === 'list' ? BRAND.dark : '#fff' }} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold">
                <ListIcon size={13} /> List
              </button>
              <button onClick={() => setView('timeline')} style={{ background: view === 'timeline' ? '#fff' : 'transparent', color: view === 'timeline' ? BRAND.dark : '#fff' }} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold">
                <CalendarDays size={13} /> Timeline
              </button>
            </div>
            <select
              value={currentUserId}
              onChange={e => setCurrentUserId(e.target.value)}
              title="Choose your name — remembered on this device/account"
              style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none' }}
              className="rounded-lg px-2 py-1.5 text-xs font-semibold"
            >
              <option value="" style={{ color: BRAND.text }}>Who are you?</option>
              {team.filter(m => m.active !== false).map(m => <option key={m.id} value={m.id} style={{ color: BRAND.text }}>{m.name}</option>)}
            </select>
            <button
              onClick={() => isAdmin && setTeamModalOpen(true)}
              disabled={!isAdmin}
              title={isAdmin ? 'Manage Team' : 'Only admins can manage the team'}
              style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', opacity: isAdmin ? 1 : 0.4, cursor: isAdmin ? 'pointer' : 'not-allowed' }}
              className="p-2 rounded-lg"
            ><Users size={15} /></button>
            <button
              onClick={() => isAdmin && setClientsModalOpen(true)}
              disabled={!isAdmin}
              title={isAdmin ? 'Manage Projects / Clients' : 'Only admins can manage projects'}
              style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', opacity: isAdmin ? 1 : 0.4, cursor: isAdmin ? 'pointer' : 'not-allowed' }}
              className="p-2 rounded-lg"
            ><Building2 size={15} /></button>
            <button onClick={downloadTemplate} title="Download Excel template" style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }} className="p-2 rounded-lg"><Download size={15} /></button>
            <button
              onClick={() => isAdmin && fileInputRef.current && fileInputRef.current.click()}
              disabled={!isAdmin}
              title={isAdmin ? 'Import from Excel' : 'Only admins can import tasks'}
              style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', opacity: isAdmin ? 1 : 0.4, cursor: isAdmin ? 'pointer' : 'not-allowed' }}
              className="p-2 rounded-lg"
            ><Upload size={15} /></button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
            <button
              onClick={() => isAdmin && openNew()}
              disabled={!isAdmin}
              title={isAdmin ? '' : 'Only admins can add new tasks'}
              style={{ background: BRAND.light, color: BRAND.dark, opacity: isAdmin ? 1 : 0.4, cursor: isAdmin ? 'pointer' : 'not-allowed' }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold"
            >
              <Plus size={14} /> New Task
            </button>
          </div>
        </div>
      </div>

      {saveError && <div style={{ background: '#FBE7E5', color: '#9A3530' }} className="px-4 py-1.5 text-xs text-center">Couldn't save changes — please try again</div>}
      {importError && <div style={{ background: '#FBE7E5', color: '#9A3530' }} className="px-4 py-1.5 text-xs text-center">{importError}</div>}

      <div className="px-4 py-3">
        <div className="flex gap-2 mb-3 flex-wrap">
          <StatCard label="Total" value={stats.total} color={BRAND.dark} />
          <StatCard label="In Progress" value={stats.inProgress} color={BRAND.light} />
          <StatCard label="Overdue" value={stats.overdue} color="#C4443D" active={filters.overdueOnly} onClick={() => setFilters(f => ({ ...f, overdueOnly: !f.overdueOnly }))} />
          <StatCard label="Done" value={stats.done} color={BRAND.dark} />
          <StatCard label="Milestones" value={stats.milestones} color="#7A5C9E" active={filters.milestonesOnly} onClick={() => setFilters(f => ({ ...f, milestonesOnly: !f.milestonesOnly }))} />
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div style={{ border: `1px solid ${BRAND.border}`, background: '#fff' }} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5">
            <Search size={14} style={{ color: BRAND.sub }} />
            <input value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} placeholder="Search..." style={{ outline: 'none', fontSize: 12.5, width: 110 }} />
          </div>
          <select value={filters.assigneeId} onChange={e => setFilters(f => ({ ...f, assigneeId: e.target.value }))} style={{ border: `1px solid ${BRAND.border}`, background: '#fff' }} className="rounded-lg px-2 py-1.5 text-xs">
            <option value="all">All Assignees</option>
            {team.map(m => <option key={m.id} value={m.id}>{m.name}{m.active === false ? ' (Inactive)' : ''}</option>)}
          </select>
          <select value={filters.priority} onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))} style={{ border: `1px solid ${BRAND.border}`, background: '#fff' }} className="rounded-lg px-2 py-1.5 text-xs">
            <option value="all">All Priorities</option>
            {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <select value={filters.clientId} onChange={e => setFilters(f => ({ ...f, clientId: e.target.value }))} style={{ border: `1px solid ${BRAND.border}`, background: '#fff' }} className="rounded-lg px-2 py-1.5 text-xs">
            <option value="all">All Projects</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ border: `1px solid ${BRAND.border}`, background: '#fff' }} className="rounded-lg px-2 py-1.5 text-xs">
            <option value="dueDate">Sort: Due Date</option>
            <option value="priority">Sort: Priority</option>
            <option value="assignee">Sort: Assignee</option>
            <option value="created">Sort: Newest</option>
          </select>
        </div>

        {view === 'board' && (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {STATUSES.map(status => {
              const colTasks = sortedBoard(status.id);
              return (
                <div key={status.id} style={{ minWidth: 250, width: 250, flexShrink: 0 }}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: status.color }} />
                    <span style={{ fontWeight: 700, fontSize: 12.5, color: BRAND.text }}>{status.label}</span>
                    <span style={{ color: BRAND.sub, fontSize: 11.5 }}>({colTasks.length})</span>
                  </div>
                  <div style={{ minHeight: 40 }}>
                    {colTasks.length === 0 && <div style={{ color: '#B7C0BB', fontSize: 12, textAlign: 'center', padding: '18px 0', border: `1px dashed ${BRAND.border}`, borderRadius: 10 }}>No tasks</div>}
                    {colTasks.map(task => (
                      <TaskCard key={task.id} task={task} team={team} clients={clients} allTasks={tasks} onEdit={openEdit} onDelete={deleteTask} onMove={moveTask} confirmingId={confirmingId} setConfirmingId={setConfirmingId} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {view === 'list' && (
          <div>
            {sortedList.length === 0 && <div style={{ color: BRAND.sub, textAlign: 'center', padding: '40px 0', fontSize: 13 }}>No tasks match your filters</div>}
            {sortedList.map(task => {
              const priority = PRIORITIES.find(p => p.id === task.priority);
              const status = STATUSES.find(s => s.id === task.status);
              const member = team.find(t => t.id === task.assigneeId);
              const client = clients.find(c => c.id === task.clientId);
              const badge = dueBadge(task);
              const blocked = isBlocked(task, tasks);
              const isConfirming = confirmingId === task.id;
              return (
                <div key={task.id} style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRight: `4px solid ${priority.color}`, borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap" style={{ flex: 1, minWidth: 180 }}>
                      <Avatar member={member} />
                      {task.isMilestone && <Diamond size={12} style={{ color: BRAND.dark }} />}
                      {task.code && <span style={{ fontFamily: 'monospace', fontSize: 11, color: BRAND.sub }}>{task.code}</span>}
                      <span style={{ fontWeight: 600, fontSize: 13.5, color: BRAND.text }}>{task.title}</span>
                      {client && <Chip small style={{ background: '#EEF2F0', color: BRAND.sub }}>{client.name}</Chip>}
                      {blocked && <Chip small style={{ background: '#FBE7E5', color: '#9A3530' }}>Blocked</Chip>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Chip small style={{ background: status.color + '22', color: status.color }}>{status.label}</Chip>
                      {badge && <Chip small style={toneStyle(badge.tone)}>{badge.label}</Chip>}
                      <button onClick={() => openEdit(task)} title="Edit" style={{ color: BRAND.sub }} className="p-1 rounded hover:bg-gray-100"><Pencil size={14} /></button>
                      <button onClick={() => isConfirming ? deleteTask(task.id) : setConfirmingId(task.id)} title={isConfirming ? 'Click to confirm' : 'Delete'} style={{ color: isConfirming ? '#C4443D' : BRAND.sub }} className="p-1 rounded hover:bg-gray-100">
                        {isConfirming ? <Check size={14} /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </div>
                  {!task.isMilestone && <ProgressBar value={task.progress} color={status.color} />}
                </div>
              );
            })}
          </div>
        )}

        {view === 'timeline' && <GanttView tasks={sortedGantt} team={team} onEditTask={openEdit} />}
      </div>

      {modalOpen && <TaskModal draft={draft} setDraft={setDraft} onClose={() => setModalOpen(false)} onSave={saveDraft} error={formError} team={team} clients={clients} allTasks={tasks} />}
      {teamModalOpen && <TeamModal team={team} currentUserId={currentUserId} onClose={() => setTeamModalOpen(false)} onAdd={addMember} onRename={renameMember} onToggleActive={toggleActive} onToggleAdmin={toggleAdmin} />}
      {clientsModalOpen && <ClientsModal clients={clients} onClose={() => setClientsModalOpen(false)} onAdd={addClient} onRename={renameClient} onDelete={deleteClient} />}
      {importPreview && <ImportPreviewModal preview={importPreview} onConfirm={confirmImport} onCancel={() => setImportPreview(null)} />}
    </div>
  );
}

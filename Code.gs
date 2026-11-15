/*  TEDxNTU 2027 Planner — backend (Google Apps Script)
 *  Keeps one JSON file in your Google Drive (My Drive / TEDxNTU Planner / planner-data.json).
 *  Deploy as a Web App: Execute as "Me", Who has access "Anyone". Run setup() once to get the admin key.
 */
const FOLDER_NAME = 'TEDxNTU Planner', FILE_NAME = 'planner-data.json', MAX_ACTIVITY = 3000;

function setup() {
  const p = PropertiesService.getScriptProperties();
  let k = p.getProperty('ADMIN_KEY');
  if (!k) { k = rand(28); p.setProperty('ADMIN_KEY', k); }
  Logger.log('ADMIN KEY (keep private): ' + k);
  return k;
}
function doGet() { return out({ ok: true, app: 'tedx-planner', v: 1 }); }
function doPost(e) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (err) { return out({ ok: false, error: 'busy, try again' }); }
  try {
    const b = JSON.parse(e.postData.contents || '{}');
    const S = load();
    const r = handle(b, S);
    if (r.save) { S.rev = (S.rev || 0) + 1; S.updatedAt = Date.now(); save(S); }
    return out(r.body(S));
  } catch (err) { return out({ ok: false, error: String(err && err.message || err) }); }
  finally { try { lock.releaseLock(); } catch (e2) {} }
}

/* ---------- actions ---------- */
function handle(b, S) {
  const adminKey = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!adminKey) throw new Error('Run setup() in the Apps Script editor first');
  const now = Date.now();
  let actor = null;
  if (b.adminKey && b.adminKey === adminKey) actor = { id: 'admin', name: clean(b.name, 40) || 'Admin', role: 'admin', code: '', label: 'Admin' };
  else if (b.token && S.members[b.token]) {
    const m = S.members[b.token], c = S.codes[m.code];
    if (!c || c.revoked || m.removed) return { save: false, body: () => ({ ok: false, error: 'access revoked', revoked: true }) };
    m.lastSeen = now; actor = { id: m.id, name: m.name || c.label, role: 'member', code: m.code, label: c.label };
  }
  const act = b.action || 'pull';

  if (act === 'join') {
    const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const c = S.codes[code];
    if (!c || c.revoked) throw new Error('That access code is not valid');
    const name = clean(b.name, 40);                    // optional: falls back to the name the admin gave the code
    const token = rand(32), id = 'm' + rand(8);
    S.members[token] = { id, name, code, device: clean(b.device, 80), joinedAt: now, lastSeen: now };
    const shown = name || c.label;
    c.uses.push({ id, name: shown, device: clean(b.device, 80), at: now });
    log(S, { id, name: shown, code, label: c.label }, null, 'joined with access code "' + c.label + '"');
    return { save: true, body: (S) => ({ ok: true, token, member: { id, name: shown, role: 'member', label: c.label }, state: view(S, 'member') }) };
  }
  if (!actor) return { save: false, body: () => ({ ok: false, error: 'not connected', auth: true }) };

  if (act === 'pull') {
    let save = false;                                  // persist lastSeen at most every 5 minutes
    if (actor.role === 'member') { const m = S.members[b.token]; if (!m.seenSaved || now - m.seenSaved > 300000) { m.seenSaved = now; save = true; } }
    if (b.since && b.since === S.rev) return { save, body: () => ({ ok: true, same: true, rev: S.rev }) };
    return { save, body: (S) => ({ ok: true, me: actor, state: view(S, actor.role) }) };
  }
  if (act === 'push') {
    (b.ops || []).slice(0, 100).forEach(op => applyOp(S, actor, op, now));
    return { save: true, body: (S) => ({ ok: true, me: actor, state: view(S, actor.role) }) };
  }
  if (actor.role !== 'admin') throw new Error('Only the admin can do that');
  if (act === 'createCode') {
    let code; do { code = rand(6, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'); } while (S.codes[code]);
    S.codes[code] = { label: clean(b.label, 60) || 'Unnamed', createdAt: now, revoked: false, uses: [] };
    log(S, actor, null, 'created access code for "' + S.codes[code].label + '"');
    return { save: true, body: (S) => ({ ok: true, code, state: view(S, 'admin') }) };
  }
  if (act === 'renameCode') { const c = S.codes[b.code]; if (!c) throw new Error('no such code'); c.label = clean(b.label, 60) || c.label; return { save: true, body: (S) => ({ ok: true, state: view(S, 'admin') }) }; }
  if (act === 'revokeCode') { const c = S.codes[b.code]; if (!c) throw new Error('no such code'); c.revoked = !!b.revoked; log(S, actor, null, (c.revoked ? 'revoked' : 'restored') + ' access for "' + c.label + '"'); return { save: true, body: (S) => ({ ok: true, state: view(S, 'admin') }) }; }
  if (act === 'removeMember') { for (const t in S.members) if (S.members[t].id === b.id) S.members[t].removed = true; return { save: true, body: (S) => ({ ok: true, state: view(S, 'admin') }) }; }
  throw new Error('unknown action ' + act);
}

function applyOp(S, actor, op, now) {
  const TEAMS = ['chair', 'spk', 'hr', 'part', 'mkt', 'trs', 'com', 'ops'];
  if (op.type === 'set') {
    const t = op.task || {}; const id = String(t.id || ('t' + rand(8))).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
    const old = S.tasks[id];
    const nt = { id, title: clean(t.title, 120), team: TEAMS.indexOf(t.team) >= 0 ? t.team : 'chair', date: /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? t.date : '',
      owner: clean(t.owner, 40), ownerName: clean(t.ownerName, 40), status: ['todo', 'doing', 'done'].indexOf(t.status) >= 0 ? t.status : 'todo', notes: clean(t.notes, 2000),
      createdAt: old ? old.createdAt : now, createdBy: old ? old.createdBy : actor.name, updatedAt: now, updatedBy: actor.name, updatedById: actor.id, log: old ? (old.log || []) : [] };
    if (!nt.title) return;
    const ch = [];
    if (!old) ch.push('created');
    else { if (old.title !== nt.title) ch.push('renamed from "' + old.title + '"'); if (old.status !== nt.status) ch.push('status → ' + nt.status); if ((old.owner || '') !== nt.owner) ch.push(nt.owner ? 'assigned to ' + nt.ownerName : 'unassigned'); if (old.date !== nt.date) ch.push('date → ' + (nt.date || 'none')); if (old.team !== nt.team) ch.push('team → ' + nt.team); if ((old.notes || '') !== nt.notes) ch.push('edited notes'); }
    if (!ch.length) return;
    nt.log = nt.log.concat({ ts: now, by: actor.name, text: ch.join(', ') }).slice(-60);
    S.tasks[id] = nt; log(S, actor, nt, ch.join(', '));
  } else if (op.type === 'update') {
    const t = S.tasks[op.id]; const text = clean(op.text, 500); if (!t || !text) return;
    t.log = (t.log || []).concat({ ts: now, by: actor.name, text }).slice(-60); t.updatedAt = now; t.updatedBy = actor.name; t.updatedById = actor.id;
    log(S, actor, t, 'posted: ' + text);
  } else if (op.type === 'delete') {
    const t = S.tasks[op.id]; if (!t) return; delete S.tasks[op.id]; log(S, actor, t, 'deleted');
  }
}
function log(S, actor, task, text) {
  S.activity.push({ id: 'a' + rand(8), ts: Date.now(), by: actor.name, byId: actor.id, code: actor.code || '', label: actor.label || '', taskId: task ? task.id : '', taskTitle: task ? task.title : '', text });
  if (S.activity.length > MAX_ACTIVITY) S.activity = S.activity.slice(-MAX_ACTIVITY);
}
function view(S, role) {
  const members = []; for (const t in S.members) { const m = S.members[t]; if (!m.removed) members.push({ id: m.id, name: m.name || (S.codes[m.code] || {}).label || 'Member', code: role === 'admin' ? m.code : '', label: (S.codes[m.code] || {}).label || '', joinedAt: m.joinedAt, lastSeen: m.lastSeen, device: role === 'admin' ? m.device : '' }); }
  const v = { rev: S.rev, tasks: S.tasks, activity: S.activity.slice(-600), members };
  if (role === 'admin') v.codes = S.codes;
  return v;
}

/* ---------- storage ---------- */
function file_() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME); const f = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
  const fs = f.getFilesByName(FILE_NAME); return fs.hasNext() ? fs.next() : f.createFile(FILE_NAME, '{}', 'application/json');
}
function load() {
  let S = {}; try { S = JSON.parse(file_().getBlob().getDataAsString() || '{}'); } catch (e) { S = {}; }
  S.rev = S.rev || 1; S.tasks = S.tasks || {}; S.activity = S.activity || []; S.codes = S.codes || {}; S.members = S.members || {};
  return S;
}
function save(S) { file_().setContent(JSON.stringify(S)); }
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function rand(n, A) { A = A || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; let s = ''; const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256); for (let i = 0; i < n; i++) s += A[b[i] % A.length]; return s; }
function clean(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n); }

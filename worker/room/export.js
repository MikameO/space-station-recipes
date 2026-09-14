// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// Text chronology for moderators: one line per op, posts by name, requests by
// number, game coordinates when the room is calibrated. Times are UTC; the
// export puts CHRONOLOGY_HEADER above the lines. A line that cannot be read
// becomes «операция <kind> (не разобрана)» instead of failing the export.
export const CHRONOLOGY_HEADER = 'Хронология комнаты. Время UTC.';

const TYPE_RU = { mortar: 'удар миномёта', position: 'позиция миномёта', ob: 'ОБ', cas: 'КАС', supply: 'снабжение', medevac: 'эвакуация', other: 'прочее' };
const STATUS_RU = { requested: 'запрошен', accepted: 'принят', loaded: 'заряжен', firing: 'огонь', done: 'выполнен', denied: 'отклонён' };
const PRIORITY_RU = { urgent: 'срочно', normal: 'обычный' };
const FLAG_RU = { beacon: 'маяк' };

const own = (o, k) => (o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const quote = s => '«' + String(s) + '»';
const label = (table, key) => own(table, key) || String(key);

// objects: the room state, for requests and members whose opening op is not in `ops`.
export function chronology(ops, policy, offset, objects) {
  const off = Array.isArray(offset) && offset.length === 2 && isNum(offset[0]) && isNum(offset[1]) ? offset : null;
  const postDef = post => policy.posts.find(p => p.id === post);
  const postName = post => { const d = postDef(post); return d ? d.nameRu : String(post); };
  const squadName = sq => (own(policy.squads, sq) || {}).nameRu || '';
  const fnName = id => { const f = (policy.functions || []).find(x => x.id === id); return f ? f.nameRu : String(id); };
  const coords = p => (p && isNum(p.x) && isNum(p.y) ? (off ? `${p.x + off[0]} ${p.y + off[1]}` : `${p.x} ${p.y} (мир)`) : '');
  const person = m => (m ? postName(m.post) + (m.squad ? ' ' + squadName(m.squad) : '') + (m.callsign ? ' ' + quote(m.callsign) : '') : '');

  const requests = new Map();
  const members = new Map();
  let numbered = 0;
  const requestOf = id => {
    if (requests.has(id)) return requests.get(id);
    const o = own(objects, id);
    const r = o ? { n: null, type: o.type, target: o.target, by: o.by, status: undefined, acceptedBy: null } : null;
    if (r) requests.set(id, r);
    return r;
  };
  const memberOf = id => members.get(id) || own(objects, id) || null;

  // «отозвано штабом»: a staff officer other than the acceptor recalls an accepted request;
  // «снят автором»: the author withdraws it while it waits; anything else is a refusal.
  const deniedLabel = (r, d, before) => {
    const by = d.deniedBy;
    const acceptor = r && r.acceptedBy;
    if (by && acceptor && by.client !== acceptor.client && (postDef(by.post) || {}).level === 'staff') return 'отозвано штабом';
    if (by && r && r.by && by.client === r.by.client && before === 'requested') return 'снят автором';
    return 'отклонён';
  };

  function requestLine(op, d) {
    if (op.op === 'put') {
      const n = ++numbered;
      requests.set(op.id, { n, type: d.type, target: d.target, by: op.by, status: 'requested', acceptedBy: null });
      return `запрос №${n} ${quote(label(TYPE_RU, d.type))} ${coords(d.target)}`.trim();
    }
    const r = requestOf(op.id);
    const head = r ? `${r.n ? '№' + r.n + ' ' : ''}${quote(label(TYPE_RU, r.type))} ${coords(r.target)}`.trim() : op.id;
    if (op.op === 'del') return head + ': удалён';
    const before = op.expectedStatus !== undefined ? op.expectedStatus : r && r.status;
    const parts = [];
    if (d.status !== undefined) {
      const text = d.status === 'denied' ? deniedLabel(r, d, before) : label(STATUS_RU, d.status);
      parts.push(text + (d.reason ? ' — ' + d.reason : ''));
      if (r) { r.status = d.status; if (d.acceptedBy) r.acceptedBy = d.acceptedBy; }
    }
    if (d.note !== undefined) parts.push('примечание ' + quote(d.note));
    if (d.priority !== undefined) parts.push(label(PRIORITY_RU, d.priority));
    if (Array.isArray(d.flags)) parts.push('отметки: ' + (d.flags.map(f => label(FLAG_RU, f)).join(', ') || 'нет'));
    if (d.relayed !== undefined) parts.push(d.relayed ? 'передано' : 'не передано');
    return head + ': ' + (parts.join(', ') || 'изменён');
  }

  function memberLine(op, d) {
    if (op.op === 'put') {
      members.set(op.id, { post: d.post, squad: d.squad, callsign: d.callsign });
      return 'вход: ' + person(d);
    }
    const target = person(memberOf(op.id)) || op.id;
    if (op.op === 'del') return 'снят с должности: ' + target;
    if (d.confirmed) return 'подтвердил: ' + target;
    if (d.presentAt) return 'на месте';
    if (Array.isArray(d.functions)) return 'ярлыки ' + target + ': ' + (d.functions.map(fnName).join(', ') || 'нет');
    return 'участник изменён: ' + target;
  }

  function assetLine(op, d) {
    if (op.op === 'put') return `ресурс ${op.id}: добавлен`;
    if (op.op === 'del') return `ресурс ${op.id}: удалён`;
    const parts = [];
    if (d.state !== undefined) parts.push(d.state === null ? 'состояние сброшено' : String(d.state));
    if (Array.isArray(d.tile)) parts.push('позиция ' + coords({ x: d.tile[0], y: d.tile[1] }));
    if (d.claimedBy !== undefined) parts.push(d.claimedBy ? 'расчёт занят' : 'расчёт свободен');
    if (d.shell !== undefined) parts.push('снаряд ' + (d.shell || 'не выбран'));
    return `ресурс ${op.id}: ` + (parts.join(', ') || 'изменён');
  }

  function line(op) {
    const d = op.data || {};
    if (op.kind === 'member') return memberLine(op, d);
    if (op.kind === 'request') return requestLine(op, d);
    if (op.kind === 'asset') return assetLine(op, d);
    if (op.op === 'del') return 'удалил ' + op.id;
    if (op.kind === 'marker') return ('метка «' + (d.label || d.cat || '') + '» ' + (d.x !== undefined ? coords(d) : '')).trim();
    if (op.kind === 'calibration') {
      const o = d.offset;
      return 'калибровка ' + (Array.isArray(o) && o.length === 2 && isNum(o[0]) && isNum(o[1]) ? o.join(' ') : '(неверная)');
    }
    return (op.kind === 'line' ? 'линия' : 'область') + ' «' + (d.label || '') + '»';
  }

  return ops.map(op => {
    let t = '--:--:--', who = '?', what;
    try {
      t = new Date(op.at).toISOString().slice(11, 19);
      who = !op.by || op.by.post === 'system' ? 'Система' : postName(op.by.post) + (op.by.squad ? ' ' + squadName(op.by.squad) : '');
      what = line(op);
    } catch (e) {
      what = `операция ${op && op.kind} (не разобрана)`;
    }
    return `${t}  ${who}  ${what}`;
  }).join('\n');
}

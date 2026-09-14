// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// Text chronology for moderators: one line per op, posts by name, requests by
// number, game coordinates when the room is calibrated. Times are UTC; the
// export puts CHRONOLOGY_HEADER above the lines. A line that cannot be read
// becomes «операция <kind> (не разобрана)» instead of failing the export.
// Which calibration a member works by (`cal`) makes no line.
export const CHRONOLOGY_HEADER = 'Хронология комнаты. Время UTC.';

const TYPE_RU = { mortar: 'удар миномёта', position: 'позиция миномёта', ob: 'ОБ', cas: 'КАС', supply: 'снабжение', medevac: 'эвакуация', other: 'прочее', task: 'задача' };
const STATUS_RU = { requested: 'запрошен', accepted: 'принят', loaded: 'заряжен', firing: 'огонь', done: 'выполнен', denied: 'отклонён' };
const PRIORITY_RU = { urgent: 'срочно', normal: 'обычный' };
const FLAG_RU = { beacon: 'маяк' };
// Journal events (kind `event`): the Worker writes them for radio silence, close, «Продолжить раунд», the idle lock
// and the administration's stop and start.
const EVENT_RU = {
  silence_on: 'радиомолчание включено', silence_off: 'радиомолчание выключено', close: 'комната закрыта',
  unlock: 'раунд продолжен после простоя', lock: 'комната заблокирована: 8 минут без действий',
  stop: 'комната остановлена рубильником администрации', start: 'рубильник администрации снят'
};
// The stop link acts through the room as the system, but the journal names who pulled the switch.
const EVENT_WHO = { stop: 'Администрация', start: 'Администрация' };

const has = (o, k) => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const own = (o, k) => (has(o, k) ? o[k] : undefined);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isPair = v => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);
const quote = s => '«' + String(s) + '»';
const label = (table, key) => own(table, key) || String(key);
// As the fire panel writes a shift: +243 -218.
const signed = n => (n > 0 ? '+' + n : String(n));

// objects: the room state, for requests and members whose opening op is not in `ops`.
// offset: the room calibration now, for the stage 1 lines. A position line takes the calibration the log held
// at its own point instead (the offset argument throughout when `ops` carry no calibration op).
export function chronology(ops, policy, offset, objects) {
  const off = isPair(offset) ? offset : null;
  const postDef = post => policy.posts.find(p => p.id === post);
  const postName = post => { const d = postDef(post); return d ? d.nameRu : String(post); };
  const squadName = sq => (own(policy.squads, sq) || {}).nameRu || '';
  const fnName = id => { const f = (policy.functions || []).find(x => x.id === id); return f ? f.nameRu : String(id); };
  const coords = p => (p && isNum(p.x) && isNum(p.y) ? (off ? `${p.x + off[0]} ${p.y + off[1]}` : `${p.x} ${p.y} (мир)`) : '');
  const person = m => (m ? postName(m.post) + (m.squad ? ' ' + squadName(m.squad) : '') + (m.callsign ? ' ' + quote(m.callsign) : '') : '');

  const requests = new Map();
  const members = new Map();
  const byClient = new Map();   // client → the latest member put in the log
  let numbered = 0;
  let calNow = (Array.isArray(ops) ? ops : []).some(op => op && op.kind === 'calibration') ? null : off;
  const trackCalibration = op => {
    if (!op || op.kind !== 'calibration') return;
    if (op.op === 'del') calNow = null;
    else if (op.data && isPair(op.data.offset)) calNow = op.data.offset;
  };
  const position = p => (p && isNum(p.x) && isNum(p.y)
    ? (calNow ? `${p.x + calNow[0]} ${p.y + calNow[1]}` : `${p.x} ${p.y} (мир)`) : '(неверная)');
  const memberByClient = client => {
    if (byClient.has(client)) return byClient.get(client);
    const all = objects && typeof objects === 'object' ? Object.values(objects).filter(o => o && o.kind === 'member' && o.client === client) : [];
    return all.find(o => !o.deleted) || all[0] || null;
  };
  // A member by callsign and post; a client the log never saw by its id.
  const personOf = by => {
    if (!by) return '';
    const m = memberByClient(by.client);
    return m ? person(m) : postName(by.post) + (by.squad ? ' ' + squadName(by.squad) : '');
  };
  const addressee = to => {
    if (!to || typeof to !== 'object') return '';
    if (typeof to.client === 'string') { const m = memberByClient(to.client); return m ? person(m) : 'участник ' + to.client; }
    if (typeof to.post === 'string') return postName(to.post) + (to.squad ? ' ' + squadName(to.squad) : '');
    return '';
  };
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
      // A task may have no point; the addressee follows the point, a task's text comes last.
      const to = addressee(d.to);
      const text = [`запрос №${n}`, quote(label(TYPE_RU, d.type)), coords(d.target), to ? '→ ' + to : ''].filter(Boolean).join(' ');
      return d.type === 'task' && typeof d.note === 'string' && d.note ? text + ': ' + d.note : text;
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
      const m = { client: d.client, post: d.post, squad: d.squad, callsign: d.callsign };
      members.set(op.id, m);
      if (typeof d.client === 'string') byClient.set(d.client, m);
      return 'вход: ' + person(d);
    }
    const target = person(memberOf(op.id)) || op.id;
    if (op.op === 'del') return 'снят с должности: ' + target;
    if (d.confirmed) return 'подтвердил: ' + target;
    if (has(d, 'pos')) return d.pos === null ? 'позиция снята: ' + target : 'позиция: ' + target + ' ' + position(d.pos);
    if (d.presentAt) return 'на месте';
    if (Array.isArray(d.functions)) return 'ярлыки ' + target + ': ' + (d.functions.map(fnName).join(', ') || 'нет');
    if (has(d, 'cal')) return null;
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
    if (op.kind === 'event') return own(EVENT_RU, d.event) || 'событие ' + quote(d.event);
    if (op.kind === 'member') return memberLine(op, d);
    if (op.kind === 'request') return requestLine(op, d);
    if (op.kind === 'asset') return assetLine(op, d);
    if (op.op === 'del') return 'удалил ' + op.id;
    if (op.kind === 'marker') return ('метка «' + (d.label || d.cat || '') + '» ' + (d.x !== undefined ? coords(d) : '')).trim();
    if (op.kind === 'calibration') {
      if (!isPair(d.offset)) return 'калибровка (неверная)';
      const parts = ['привязка комнаты: ' + personOf(op.by), 'сдвиг ' + signed(d.offset[0]) + ' ' + signed(d.offset[1])];
      if (isPair(d.reading)) parts.push(`показание дальномера ${d.reading[0]} ${d.reading[1]}`);
      if (isPair(d.tile)) parts.push(`тайл ${d.tile[0]} ${d.tile[1]} (мир)`);
      return parts.join(', ');
    }
    return (op.kind === 'line' ? 'линия' : 'область') + ' «' + (d.label || '') + '»';
  }

  const out = [];
  for (const op of ops) {
    let t = '--:--:--', who = '?', what;
    try {
      t = new Date(op.at).toISOString().slice(11, 19);
      const eventWho = op.kind === 'event' ? own(EVENT_WHO, (op.data || {}).event) : undefined;
      who = eventWho || (!op.by || op.by.post === 'system' ? 'Система' : postName(op.by.post) + (op.by.squad ? ' ' + squadName(op.by.squad) : ''));
      what = line(op);
    } catch (e) {
      what = `операция ${op && op.kind} (не разобрана)`;
    }
    trackCalibration(op);
    if (what !== null) out.push(`${t}  ${who}  ${what}`);
  }
  return out.join('\n');
}

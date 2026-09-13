// Text chronology for moderators: one line per op, posts by name, game coordinates.
export function chronology(ops, policy, offset) {
  const postName = post => { const d = policy.posts.find(p => p.id === post); return d ? d.nameRu : post; };
  const squadName = sq => (policy.squads[sq] || {}).nameRu || '';
  const coords = (x, y) => (offset ? `${x + offset[0]} ${y + offset[1]}` : `${x} ${y} (мир)`);
  return ops.map(op => {
    const t = new Date(op.at).toISOString().slice(11, 19);
    const who = op.by.post === 'system' ? 'Система' : postName(op.by.post) + (op.by.squad ? ' ' + squadName(op.by.squad) : '');
    const d = op.data || {};
    let what;
    if (op.kind === 'member') {
      what = op.op === 'del' ? 'снят с должности'
        : d.confirmed ? 'подтверждён'
        : d.presentAt ? 'на месте'
        : d.functions ? 'ярлыки: ' + (d.functions.join(', ') || 'нет')
        : 'вход: ' + postName(d.post);
    } else if (op.op === 'del') {
      what = 'удалил ' + op.id;
    } else if (op.kind === 'marker') {
      what = ('метка «' + (d.label || d.cat || '') + '» ' + (d.x !== undefined ? coords(d.x, d.y) : '')).trim();
    } else if (op.kind === 'request') {
      what = d.status ? `запрос ${op.id}: ${d.status}` : `запрос ${d.type} ${coords(d.target.x, d.target.y)}`;
    } else if (op.kind === 'asset') {
      what = `ресурс ${op.id}: ${d.state || 'изменён'}`;
    } else if (op.kind === 'calibration') {
      what = 'калибровка ' + (d.offset ? d.offset.join(' ') : '');
    } else {
      what = (op.kind === 'line' ? 'линия' : 'область') + ' «' + (d.label || '') + '»';
    }
    return `${t}  ${who}  ${what}`;
  }).join('\n');
}

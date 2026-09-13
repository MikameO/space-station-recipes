// Issues a server token for the officers' room and the administration's stop/start links.
// Usage: ROOM_KEY_SECRET=... ROOM_STOP_SECRET=... WORKER_URL=https://chemdb-feedback.<acc>.workers.dev \
//        node scripts/room_token.mjs <keyId> <fork> "<server name>"
import { randomBytes } from 'node:crypto';
import { signServerToken, stopSig } from '../worker/room/crypto.js';

const [keyId, fork, server] = process.argv.slice(2);
if (!keyId || !fork || !server) {
  console.error('usage: node scripts/room_token.mjs <keyId> <fork> "<server name>"');
  process.exit(2);
}
const secret = process.env.ROOM_KEY_SECRET || randomBytes(24).toString('base64url');
const token = await signServerToken(secret, { fork, server, keyId, iat: Math.floor(Date.now() / 1000) });
const base = process.env.WORKER_URL || 'https://<worker>';
console.log('ROOM_KEYS entry (merge into the JSON secret):');
console.log(JSON.stringify({ [keyId]: secret }));
console.log('\nServer token for room creators (paste into «Ключ сервера»):');
console.log(token);
if (process.env.ROOM_STOP_SECRET) {
  console.log('\nAdministration stop link:', base + '/stop/' + keyId + '/' + await stopSig(process.env.ROOM_STOP_SECRET, 'stop', keyId));
  console.log('Administration start link:', base + '/start/' + keyId + '/' + await stopSig(process.env.ROOM_STOP_SECRET, 'start', keyId));
}

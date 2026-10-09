// The stand-in cache server the `service` task's tests expect on port 6399.
// The agent never sees it; the ground-truth check starts it.

import net from 'node:net';

export function startCacheServer(port = 6399) {
  const store = new Map(); // key -> { value, expires }
  const last = new Map(); // key -> the last SET line for it, so parallel tests do not collide
  const live = (key) => {
    const e = store.get(key);
    if (e && e.expires && Date.now() >= e.expires) store.delete(key);
    return store.get(key);
  };
  const server = net.createServer((socket) => {
    let buf = '';
    socket.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        const [cmd, key, ...rest] = line.split(' ');
        if (cmd === 'SET') {
          last.set(key, line);
          // SET key value [EX seconds]: honour the TTL, as a real cache would.
          const ex = rest[1] && rest[1].toUpperCase() === 'EX' ? Number(rest[2]) : NaN;
          store.set(key, { value: rest[0], expires: Number.isFinite(ex) && ex > 0 ? Date.now() + ex * 1000 : 0 });
          socket.write('OK\n');
        } else if (cmd === 'GET') {
          const e = live(key);
          socket.write((e ? e.value : 'NIL') + '\n');
        } else if (cmd === 'DEL') {
          socket.write((store.delete(key) ? '1' : '0') + '\n');
        } else if (cmd === 'TTL') {
          const e = live(key);
          socket.write((!e ? '-2' : e.expires ? String(Math.ceil((e.expires - Date.now()) / 1000)) : '-1') + '\n');
        } else if (cmd === 'LAST') {
          socket.write((last.get(key) || '') + '\n');
        } else {
          socket.write('ERR\n');
        }
      }
    });
    socket.on('error', () => {});
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startCacheServer(Number(process.argv[2] || 6399)).then(() => process.stdout.write('listening\n'));
}

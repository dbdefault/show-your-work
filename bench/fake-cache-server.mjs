// The stand-in cache server the `service` task's tests expect on port 6399.
// The agent never sees it; the ground-truth check starts it.

import net from 'node:net';

export function startCacheServer(port = 6399) {
  const store = new Map();
  const last = new Map(); // key -> the last SET line for it, so parallel tests do not collide
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
          store.set(key, rest[0]);
          socket.write('OK\n');
        } else if (cmd === 'GET') {
          socket.write((store.has(key) ? store.get(key) : 'NIL') + '\n');
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

// Documentation preview only. No API proxy, auth, analytics, or external assets.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const routes = {
  '/ai-controls': [path.join(root, 'ai-controls.html'), 'text/html; charset=utf-8'],
  '/ai-controls.js': [path.join(root, 'ai-controls.js'), 'text/javascript; charset=utf-8'],
  '/ai-controls.css': [path.join(root, 'ai-controls.css'), 'text/css; charset=utf-8'],
  '/': [path.join(root, 'index.html'), 'text/html; charset=utf-8'],
  '/styles.css': [path.join(root, 'styles.css'), 'text/css; charset=utf-8'],
  '/app.js': [path.join(root, 'app.js'), 'text/javascript; charset=utf-8'],
  '/vue.js': [path.resolve(root, '../../..', 'frontend/node_modules/vue/dist/vue.esm-browser.prod.js'), 'text/javascript; charset=utf-8'],
};
const server = http.createServer((req, res) => {
  const target = routes[new URL(req.url, 'http://127.0.0.1').pathname];
  if (!target) { res.writeHead(404); res.end('Not found'); return; }
  try {
    res.writeHead(200, { 'Content-Type': target[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(fs.readFileSync(target[0]));
  } catch { res.writeHead(500); res.end('Preview asset unavailable'); }
});
server.listen(5181, '127.0.0.1', () => process.stdout.write('Preview only: http://127.0.0.1:5181/\n'));

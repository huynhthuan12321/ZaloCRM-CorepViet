// Documentation server: loopback + exact resource allowlist, no API proxy.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assets = {
  '/':['index.html','text/html'], '/index.html':['index.html','text/html'],
  '/app.js':['app.js','text/javascript'], '/tokens.css':['tokens.css','text/css'],
  '/preview.css':['preview.css','text/css'],
  '/vue.js':['../../../frontend/node_modules/vue/dist/vue.esm-browser.prod.js','text/javascript'],
};
http.createServer((req,res)=>{
  const asset=assets[new URL(req.url,'http://127.0.0.1').pathname];
  if(!asset){res.writeHead(404);res.end();return;}
  try{const data=fs.readFileSync(path.resolve(__dirname,asset[0]));res.writeHead(200,{'Content-Type':asset[1]+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);}
  catch{res.writeHead(500);res.end('Local preview asset unavailable');}
}).listen(5183,'127.0.0.1',()=>console.log('Preview V3: http://127.0.0.1:5183'));

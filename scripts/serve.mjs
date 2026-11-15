import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../web/', import.meta.url)));
const args=process.argv.slice(2);
const argValue=(name)=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
const port=Number(argValue('--port')||process.env.PORT)||3000;
const host=argValue('--host')||'0.0.0.0';
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.png':'image/png', '.pdf':'application/pdf', '.json':'application/json', '.bcmap':'application/octet-stream', '.pfb':'application/octet-stream' };
http.createServer(async (req,res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname.endsWith('/')) pathname += 'index.html';
    const file = path.resolve(root, '.'+pathname);
    if(!file.startsWith(root+path.sep)) {res.writeHead(403).end(); return;}
    const s = await stat(file);
    if(!s.isFile()) throw new Error('Not a file');
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});
    res.end(await readFile(file));
  } catch {res.writeHead(404).end('Not found');}
}).listen(port,host,()=>console.log(`Cover studio ready on port ${port}`));

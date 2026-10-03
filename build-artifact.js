// index.html → 아티팩트 페이지(문서 골격 없이 title/link/style + body 내용)로 변환
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/index.html', 'utf8');
const head = src.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = src.match(/<body>([\s\S]*?)<\/body>/)[1];
const keep = head.split('\n').filter(l => !/<meta|<\/?head/.test(l)).join('\n');
const out = keep.trim() + '\n' + body.trim() + '\n';
const dest = process.argv[2] || (__dirname + '/dist/acres9.html');
fs.mkdirSync(require('path').dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log('written', dest, out.length, 'bytes');

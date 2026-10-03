// index.html → 아티팩트 페이지(문서 골격 없이 title/link/style + body 내용)로 변환
// js/*.js 는 아티팩트의 보조 파일로 함께 게시한다.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const head = src.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = src.match(/<body>([\s\S]*?)<\/body>/)[1];
const keep = head.split('\n').filter(l => !/<meta|<\/?head/.test(l)).join('\n');
const out = keep.trim() + '\n' + body.trim() + '\n';
const dest = process.argv[2] || path.join(__dirname, 'dist', 'acres9.html');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log('written', dest, out.length, 'bytes');
console.log('supporting files:', fs.readdirSync(path.join(__dirname, 'js')).map(f => 'js/' + f).join(', '));

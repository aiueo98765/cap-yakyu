// ===== [SEC:SETTINGS] =====
// 設定：打つときの目安の円／画質／手ごたえ（振動）／オンラインで使う名前。選んだものは記憶する（守備はいつも自動）
const SET = { guide: store.get('guide', 'on'), quality: store.get('quality', MOBILE ? 'low' : 'high'), haptic: store.get('haptic', 'on') };
function applySettings() {
  CONFIG.guide = SET.guide === 'on';
  // 画質：かげの細かさと、画面の細かさ（低いほど なめらかに動く）
  const lo = SET.quality === 'low';
  sun.shadow.mapSize.set(lo ? 512 : (MOBILE ? 1024 : 2048), lo ? 512 : (MOBILE ? 1024 : 2048));
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  sun.shadow.radius = lo ? 1.5 : 3;
  renderer.setPixelRatio(Math.min(devicePixelRatio, lo ? 1.25 : (MOBILE ? 2 : 1.75)));
  resize();
  for (const s of document.querySelectorAll('#set .seg')) for (const b of s.querySelectorAll('button')) b.classList.toggle('on', SET[s.dataset.k] === b.dataset.v);
}

// ===== [SEC:UI-BITS] =====
// 画面のすみに ちょっとだけ出す伝言（コピーしました、など）
function toast(msg) {
  const z = $('toast'), e = document.createElement('div'); e.textContent = msg; z.appendChild(e);
  setTimeout(() => e.remove(), 2200); while (z.children.length > 3) z.firstChild.remove();
}
// 手ごたえ（振動）。対応していない機種では何も起きない。
// 一度も画面をさわっていないうちは ブラウザが断るので、はじめてさわるまで よばない
let UGEST = false;
addEventListener('pointerdown', () => { UGEST = true; }, { once: true, capture: true });
function haptic(ms) { if (!UGEST || SET.haptic !== 'on' || !navigator.vibrate) return; try { navigator.vibrate(ms); } catch (e) { } }
// 画面に文字を出すとき：相手が決めた名前などは そのまま innerHTML に入れない
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// オンラインで相手に見える名前。10文字まで・見えない字や 文字の向きを変える字は外す
function cleanName(s) {
  let r = '';
  for (const ch of String(s == null ? '' : s)) {
    const c = ch.codePointAt(0);
    if (c < 32 || (c >= 127 && c <= 159)) continue;      // 制御文字
    if (c >= 8203 && c <= 8207) continue;                // 見えない字（ゼロ幅）
    if (c >= 8232 && c <= 8238) continue;                // 改行・文字の向きを変える字
    if (c === 65279 || c === 65532) continue;             // BOM・置きかえ文字
    r += ch;
  }
  return r.trim().slice(0, 10);
}
function myName() { return cleanName(store.get('name', '')) || 'あなた'; }
function setMyName(s) { const n = cleanName(s); store.set('name', n); showMyName(); return n || 'あなた'; }
function showMyName() {
  const n = myName(); MY_TEAM.name = n;
  for (const id of ['meName', 'onNameShow', 'setNameShow']) if ($(id)) $(id).textContent = n;
  if (G.homeT && G.awayT) setTeamsHUD();
}
// 打者と投手の名前の行。オンラインでは 相手チームの選手に 相手の名前をつける
function whoLine() {
  if (!ACT.BAT || !ACT.P) return;
  const bt = ACT.BAT.pl, pt = ACT.P.pl, on = G.match && G.match.on;
  const tg = t => on && t !== MY_TEAM ? '（' + esc(on.oppName) + '）' : '';
  $('who').innerHTML = `打者 ${esc(bt.name)}${tg(G.off)}　|　投手 ${esc(pt.name)}${tg(G.def) || (pt.note ? '（' + esc(pt.note) + '）' : '')}`;
}
// 名前を決める画面（もどる先の画面 id をおぼえておく）
let NM_BACK = 'title';
function openName(back) { NM_BACK = back; $('nmIn').value = cleanName(store.get('name', '')); $(back).classList.add('hide'); $('nm').classList.remove('hide'); setTimeout(() => $('nmIn').focus(), 60); }
function closeName(save) {
  if (save) { setMyName($('nmIn').value); if (NETON()) netHello(); }
  $('nm').classList.add('hide'); $(NM_BACK).classList.remove('hide'); $('tbar').classList.toggle('hide', NM_BACK !== 'title');
}

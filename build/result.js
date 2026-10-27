function lineHTML() {
  const L = G.line, n = Math.max(CONFIG.innings, L.A.length, L.H.length), win = G.runs.H > G.runs.A ? 'H' : G.runs.A > G.runs.H ? 'A' : '';
  const row = (k, nm, a, r) => `<tr class="${k === win ? 'w' : ''}"><td>${esc(nm)}</td>${Array.from({ length: n }, (_, i) => `<td>${a[i] ?? ''}</td>`).join('')}<td class="r">${r}</td></tr>`;
  return `<tr><th></th>${Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('')}<th>計</th></tr>` + row('A', lab(G.awayT), L.A, G.runs.A) + row('H', lab(G.homeT), L.H, G.runs.H);
}
// あなたの成績（4つ）。安打＝あなたのチームの安打、三振＝あなたの投手がとった三振、最速＝あなたの投げた一番速い球
function showStats() {
  const S = G.stats, z = $('stats'); if (!z) return;
  if (!S) { z.classList.add('hide'); return; }
  const tile = (v, t) => `<div><b>${v}</b><small>${t}</small></div>`;
  z.innerHTML = tile(S.h, '安打') + tile(S.k, '奪三振') + tile(S.kmh ? Math.round(S.kmh) : '—', '最速km/h') + tile(S.p, '投球数');
  z.classList.remove('hide');
}
// 結果を友だちに送る（対応していない端末では コピーする）
async function shareResult(label) {
  const url = 'https://nkworks-games.com/cap-yakyu/';
  const sc = `${lab(G.awayT)} ${G.runs.A} － ${G.runs.H} ${lab(G.homeT)}`;
  const txt = `キャップ野球　${label}\n${sc}　${G.match && G.match.win ? '勝ち！' : '負け…'}\n${url}`;
  if (navigator.share) { try { await navigator.share({ title: 'キャップ野球', text: txt.split('\n').slice(0, 2).join('\n'), url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(txt); toast('結果をコピーしました'); } catch (e) { toast('コピーできませんでした'); }
}
// 結果の画面のボタンを作る小道具
function resBtn(txt, cls, fn, id) {
  const e = document.createElement('button'); e.className = 'btn ' + cls; e.textContent = txt; if (id) e.id = id;
  e.onclick = () => { AU.ui(); fn(); }; $('resBtns').appendChild(e); return e;
}
function resRow(items) {
  const row = document.createElement('div'); row.className = 'row'; $('resBtns').appendChild(row);
  for (const [txt, fn] of items) { const e = document.createElement('button'); e.className = 'btn sub sm'; e.textContent = txt; e.onclick = () => { AU.ui(); fn(); }; row.appendChild(e); }
}
function showResult() {
  G.resShown = true; const M = G.match, last = M.stage === CPU_TEAMS.length - 1; $('info').classList.remove('show');   // 最後の球の速さ表示を消す
  if (M.free) return showFreeResult(M);
  if (M.on) return showOnResult(M);
  $('resRd').textContent = `${ROUNDS[M.stage]}　vs ${M.opp.name}`;
  const t = $('resT'); t.textContent = M.win ? (last ? '優勝！' : '勝ち！') : '負け…'; t.className = M.win ? 'win' : 'lose';
  $('resSub').textContent = M.win ? (G.walkoff ? 'サヨナラ勝ち！　' : '') + (last ? '勝ち抜き大会を制覇しました！' : `次は ${ROUNDS[M.stage + 1]}`) : 'この試合から もう一度挑戦できます';
  $('line').innerHTML = lineHTML(); showStats(); $('resBtns').innerHTML = '';
  if (M.win) resBtn(last ? '大会の結果へ' : '次の試合へ', 'gold', openCup); else resBtn('もう一度', '', () => startMatch(M.stage));
  resRow([['結果をシェア', () => shareResult(`${ROUNDS[M.stage]} vs ${M.opp.name}`)], ['タイトルへ', () => toTitle()]]);
  $('res').classList.remove('hide'); showAd('ad2');
  if (M.win && last) AU.claps(60, 3, 1.8);
}
function showFreeResult(M) {
  const lv = M.free.lv, t = $('resT');
  $('resRd').textContent = `強さ ${lv}　vs ${M.opp.name}`; t.textContent = M.win ? '勝ち！' : '負け…'; t.className = M.win ? 'win' : 'lose';
  $('resSub').textContent = M.win ? (G.walkoff ? 'サヨナラ勝ち！　' : '') + `強さ ${lv} に ★` : 'もう一度 挑戦できます';
  $('line').innerHTML = lineHTML(); showStats(); $('resBtns').innerHTML = '';
  const go = l => { const f = freeGet(); f.ti = M.free.ti; f.lv = l; store.set('free', f); startMatch(0, { ti: M.free.ti, lv: l }); };
  if (M.win && lv < 10) resBtn(`強さ ${lv + 1} に挑戦`, 'gold', () => go(lv + 1)); else resBtn('もう一度', '', () => go(lv));
  resRow([['強さを選ぶ', openFree], ['結果をシェア', () => shareResult(`強さ ${lv} vs ${M.opp.name}`)], ['タイトルへ', () => toTitle()]]);
  $('res').classList.remove('hide'); showAd('ad2');
}

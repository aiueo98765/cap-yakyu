# -*- coding: utf-8 -*-
# build.py から exec される。out（index.html の中身）を 1か所ずつ手直しする

# --- CONFIG：オンライン対戦を 元に戻し、直つなぎの数値を足す
out = sub1(out,
  "  online: false,      // オンライン対戦のボタンを出すか（ラグが大きいので いまは休止中。true で元に戻る）",
  "  online: true,       // オンライン対戦のボタンを出すか\n"
  "  netP2P: true,       // 相手と直つなぎ（WebRTC）をためすか。false にすると 中継だけになる\n"
  "  netP2PTries: 3,     // 直つなぎが切れた時に つなぎ直してみる回数\n"
  "  netIceWait: 0.25,   // 直つなぎの道しるべ（ICE）を まとめて送るまでの待ち（秒）\n"
  "  netPingP2P: 1.5,    // 直つなぎのとき つながり具合をはかる間かく（秒）\n"
  "  emoGap: 1.5,        // スタンプを続けて送れない時間（秒）",
  'CONFIG.online')

# --- タイトルへもどる：オンラインは ちゃんと抜ける。新しい部品も片づける
out = sub1(out,
  "  for (const id of ['hud', 'back', 'snd', 'who', 'chg', 'vbtns', 'help', 'cup', 'res', 'set', 'free', 'online']) $(id).classList.add('hide'); netStop(); $('band').classList.remove('show'); $('title').classList.remove('hide'); $('fade').classList.remove('on'); cupNote();",
  "  netLeave(); netStop();\n"
  "  for (const id of ['hud', 'back', 'snd', 'who', 'chg', 'vbtns', 'help', 'cup', 'res', 'set', 'free', 'online', 'nm', 'emoB', 'emoT', 'pcnt']) $(id).classList.add('hide');\n"
  "  $('band').classList.remove('show'); $('title').classList.remove('hide'); $('tbar').classList.remove('hide'); $('fade').classList.remove('on'); cupNote(); showMyName();",
  'toTitle')

# --- 練習：スコアボードに投球数も出す。成績はつけない
out = sub1(out,
  "  $('title').classList.add('hide'); for (const id of ['hud', 'back', 'snd', 'who']) $(id).classList.remove('hide');\n  setTeamsHUD();",
  "  G.stats = null;\n"
  "  for (const id of ['title', 'tbar']) $(id).classList.add('hide'); for (const id of ['hud', 'back', 'snd', 'who', 'pcnt']) $(id).classList.remove('hide');\n"
  "  setTeamsHUD();",
  'startMode')

# --- 試合のはじまり：成績を数えはじめ、オンラインならスタンプのボタンを出す
out = sub1(out,
  "  for (const id of ['title', 'cup', 'res', 'free']) $(id).classList.add('hide'); for (const id of ['hud', 'back', 'snd', 'who']) $(id).classList.remove('hide');",
  "  G.stats = { h: 0, oh: 0, k: 0, bb: 0, kmh: 0, p: 0 };\n"
  "  for (const id of ['title', 'tbar', 'cup', 'res', 'free', 'online', 'nm']) $(id).classList.add('hide'); for (const id of ['hud', 'back', 'snd', 'who', 'pcnt']) $(id).classList.remove('hide');\n"
  "  $('emoB').classList.toggle('hide', !on); emoClose();",
  'startMatch show/hide')
out = sub1(out,
  "  showBand(on ? 'オンライン対戦　vs あいて' : free ? `強さ ${free.lv}　vs ${opp.short}` : `${ROUNDS[stage]}　vs ${opp.short}`,",
  "  showBand(on ? `オンライン対戦　vs ${on.oppName}` : free ? `強さ ${free.lv}　vs ${opp.short}` : `${ROUNDS[stage]}　vs ${opp.short}`,",
  'startMatch band')

# --- スコアボード：点が入ったらはずむ・打っている方を明るく・投球数
out = sub1(out,
  "function updHUD() {\n"
  "  const c = G.cnt, set = (cls, n) => document.querySelectorAll('#sb .cnt i.' + cls).forEach((e, i) => e.classList.toggle('on', i < n));\n"
  "  set('b', c.b); set('s', c.s); set('o', c.o);\n"
  "  document.querySelectorAll('#bases i').forEach((e, i) => { const on = !!G.bases[i]; if (on && !e.classList.contains('on')) { e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); } e.classList.toggle('on', on); });\n"
  "  $('scA').textContent = G.runs.A; $('scH').textContent = G.runs.H; $('innN').textContent = G.inning; $('innH').textContent = G.off === G.homeT ? '回裏' : '回表';\n"
  "}",
  "function updHUD() {\n"
  "  const c = G.cnt, set = (cls, n) => document.querySelectorAll('#sb .cnt i.' + cls).forEach((e, i) => e.classList.toggle('on', i < n));\n"
  "  set('b', c.b); set('s', c.s); set('o', c.o);\n"
  "  document.querySelectorAll('#bases i').forEach((e, i) => { const on = !!G.bases[i]; if (on && !e.classList.contains('on')) { e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); } e.classList.toggle('on', on); });\n"
  "  // 点が入ったら その数字をはずませる\n"
  "  for (const [id, v] of [['scA', G.runs.A], ['scH', G.runs.H]]) { const e = $(id); if (e.textContent !== String(v)) { e.textContent = v; e.classList.remove('up'); void e.offsetWidth; e.classList.add('up'); } }\n"
  "  $('innN').textContent = G.inning; $('innH').textContent = G.off === G.homeT ? '回裏' : '回表';\n"
  "  // 攻めているチームの行を明るくする\n"
  "  const top = G.off !== G.homeT; $('tmA').classList.toggle('atbat', top); $('tmH').classList.toggle('atbat', !top);\n"
  "  $('pcnt').textContent = (G.pitches || 0) + '球';\n"
  "}",
  'updHUD')

# --- 打者と投手の名前の行（相手の名前を使う）を 関数にまとめる
out = sub1(out,
  "  const bt = ACT.BAT.pl, pt = ACT.P.pl;\n"
  "  const tg = t => G.match && G.match.on && t !== MY_TEAM ? '（あいて）' : '';\n"
  "  $('who').innerHTML = `打者 ${bt.name}${tg(G.off)}　|　投手 ${pt.name}${tg(G.def) || (pt.note ? '（' + pt.note + '）' : '')}`;",
  "  whoLine();",
  'newPitch who')

# --- 1球の終わり：あなたの成績を数える／手ごたえ（振動）
out = sub1(out,
  "  G.newBat = nb; G.change = c.o >= 3;",
  "  if (G.stats) { const S = G.stats, mine = G.off === MY_TEAM;\n"
  "    if (res.hit === '1B' || res.hit === '2B' || res.hit === '3B' || res.hit === 'HR') { if (mine) S.h++; else S.oh++; }\n"
  "    if (msg === '三振！' && !mine) S.k++; if (msg === 'フォアボール' && mine) S.bb++; }\n"
  "  if (res.hit === 'HR') haptic([20, 50, 90]); else if (msg === '三振！') haptic(22);\n"
  "  G.newBat = nb; G.change = c.o >= 3;",
  'endPlay stats')

# --- 打った手ごたえ／あなたの投げた球の数と最速
out = sub1(out, "  AU.hit(r.q); if (r.q > 0.55)", "  AU.hit(r.q); haptic(r.q > 0.6 ? 26 : 12); if (r.q > 0.55)", 'contact haptic')
out = sub1(out,
  "  AU.flick(); AU.whoosh(clamp(pi.kmh / 90, 0.3, 1.2));",
  "  AU.flick(); AU.whoosh(clamp(pi.kmh / 90, 0.3, 1.2));\n"
  "  if (G.stats && G.def === MY_TEAM) { G.stats.p++; if (pi.kmh > G.stats.kmh) G.stats.kmh = pi.kmh; }",
  'launchPitch stats')

# --- 試合が終わっても オンラインはつないだまま（もう一度 対戦するため）
out = sub1(out, "  const M = G.match; M.win = win; G.state = 'over'; G.stT = 0; if (M.on) netEnd();",
               "  const M = G.match; M.win = win; G.state = 'over'; G.stT = 0; if (M.on) netMatchDone();", 'matchOver')

# --- タイトルの上のボタン（音・設定）は タイトルだけに出す
out = sub1(out, "function openFree() { toTitle(); $('title').classList.add('hide'); renderFree(); $('free').classList.remove('hide'); }",
               "function openFree() { toTitle(); for (const id of ['title', 'tbar']) $(id).classList.add('hide'); renderFree(); $('free').classList.remove('hide'); }", 'openFree')
out = sub1(out, "function openCup() { toTitle(); $('title').classList.add('hide'); renderCup(); $('cup').classList.remove('hide'); }",
               "function openCup() { toTitle(); for (const id of ['title', 'tbar']) $(id).classList.add('hide'); renderCup(); $('cup').classList.remove('hide'); }", 'openCup')

# --- タイトルのメニューの出しかた（並びは CSS の grid にまかせる）
out = sub1(out,
  "function cupNote() { const st = cupGet(); $('bFree').classList.toggle('hide', !(st.champ > 0)); $('bOn').classList.toggle('hide', !CONFIG.online); $('bOn').classList.toggle('wide', !(st.champ > 0)); $('bFree').classList.toggle('wide', !CONFIG.online); $('bOn').parentNode.classList.toggle('hide', !CONFIG.online && !(st.champ > 0)); $('cupNote').textContent = st.stage >= CPU_TEAMS.length ? `優勝 ${st.champ} 回` : st.stage ? `つぎは ${ROUNDS[st.stage]}` : ''; }",
  "function cupNote() {\n"
  "  const st = cupGet();\n"
  "  $('bOn').classList.toggle('hide', !CONFIG.online);\n"
  "  $('bFree').classList.toggle('hide', !(st.champ > 0));\n"
  "  $('cupNote').textContent = st.stage >= CPU_TEAMS.length ? `優勝 ${st.champ} 回` : st.stage ? `つぎは ${ROUNDS[st.stage]}` : '';\n"
  "}",
  'cupNote')

# --- はじめの用意：音のボタンと名前を そろえる
out = sub1(out, "  $('snd').classList.toggle('off', !AU.on);\n", "  sndSync(); showMyName();\n", 'init snd')

# --- 確認用の窓口に 新しいものを足す
out = sub1(out, "window.__cy = { endPlay, setupActors,",
  "window.__cy = { netTell, updOnBar, emoSend, emoShow, netAskRematch, netTryRematch, netMatchDone, showStats, shareResult, toast, haptic, myName, setMyName, whoLine, onlTab, onlCopy, onlLink, onlFound, PN, netSnap, netCheckState, netLate, Link, endPlay, setupActors,",
  '__cy export')

# --- さそいのリンク（?room=1234）で来た人は、はじめから「番号で入る」を開いておく
out = sub1(out, "  applySettings(); toTitle(); snapCamera(); $('load').classList.add('hide');",
  "  applySettings(); toTitle(); snapCamera(); $('load').classList.add('hide');\n"
  "  { const m = qs('room'); if (m && m[2] && /^[0-9]{4}$/.test(m[2]) && CONFIG.online) openOnline(); }",
  'init deep link')

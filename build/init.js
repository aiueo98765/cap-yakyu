// ===== [SEC:INIT] =====
// 音のボタンは タイトル（⚙のとなり）と 試合中（右上）の2つ。どちらを押しても 同じように見せる
function sndSync() { const off = !AU.on; for (const id of ['snd', 'bSnd']) if ($(id)) $(id).classList.toggle('off', off); }
function sndToggle() { AU.resume(); AU.toggle(); sndSync(); }
$('snd').onclick = sndToggle;
$('bSnd').onclick = sndToggle;

// --- タイトルのメニュー
$('bCup').onclick = () => { AU.resume(); AU.ui(); openCup(); };
$('bPitch').onclick = () => { AU.resume(); AU.ui(); startMode('pitch'); };
$('bBat').onclick = () => { AU.resume(); AU.ui(); startMode('bat'); };
$('bFree').onclick = () => { AU.resume(); AU.ui(); openFree(); };
$('bOn').onclick = () => { if (!CONFIG.online) return; AU.resume(); AU.ui(); openOnline(); };
$('me').onclick = () => { AU.ui(); $('tbar').classList.add('hide'); openName('title'); };

// --- 設定
$('bSet').onclick = () => { AU.resume(); AU.ui(); applySettings(); showMyName(); $('title').classList.add('hide'); $('tbar').classList.add('hide'); $('set').classList.remove('hide'); };
$('bSetOk').onclick = () => { AU.ui(); $('set').classList.add('hide'); $('title').classList.remove('hide'); $('tbar').classList.remove('hide'); };
$('bSetName').onclick = () => { AU.ui(); openName('set'); };
for (const s of document.querySelectorAll('#set .seg')) for (const b of s.querySelectorAll('button')) b.onclick = () => { AU.ui(); SET[s.dataset.k] = b.dataset.v; store.set(s.dataset.k, b.dataset.v); applySettings(); };

// --- 名前
$('bNmOk').onclick = () => { AU.ui(); closeName(true); toast('名前を「' + myName() + '」にしました'); };
$('bNmBack').onclick = () => { AU.ui(); closeName(false); };
$('nmIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('bNmOk').click(); } });

// --- 大会・強さを選んで対戦
$('bCupBack').onclick = () => { AU.ui(); toTitle(); };
$('bFreeGo').onclick = () => { AU.resume(); AU.ui(); const f = freeGet(); startMatch(0, { ti: f.ti, lv: f.lv }); };
$('bFreeBack').onclick = () => { AU.ui(); toTitle(); };

// --- オンライン対戦の待合
for (const b of $('onTabs').children) b.onclick = () => { AU.ui(); onlTab(b.dataset.t); $('onErr').textContent = ''; };
$('bOnQuick').onclick = () => { AU.ui(); onlStart('quick'); };
$('bOnMake').onclick = () => { AU.ui(); onlStart('make'); };
$('bOnJoin').onclick = () => { AU.ui(); onlStart('join'); };
$('bOnCopy').onclick = () => { AU.ui(); onlCopy(); };
$('bOnLink').onclick = () => { AU.ui(); onlLink(); };
$('bOnName').onclick = () => { AU.ui(); openName('online'); };
$('onCode').addEventListener('keydown', e => { if (e.key === 'Enter') onlStart('join'); });
$('onCode').addEventListener('input', () => { $('onCode').value = $('onCode').value.replace(/\D/g, '').slice(0, 4); });
$('bOnBack').onclick = () => { AU.ui(); if (!$('onWait').classList.contains('hide')) { onlCancel(); onlShow('menu'); } else toTitle(); };

// --- 試合中
$('back').onclick = () => { AU.ui(); if (NETON() && G.state !== 'over' && !confirm('オンライン対戦をやめますか？（相手は CPU と続けます）')) return; toTitle(); };
$('help').onclick = () => { AU.ui(); startDemo(); };
$('emoB').onclick = () => { AU.ui(); emoOpen(); };
for (const b of document.querySelectorAll('#vbtns button')) b.onclick = () => { AU.ui(); G.vsel = b.dataset.v === 'K' ? 'K' : +b.dataset.v; for (const o of document.querySelectorAll('#vbtns button')) o.classList.toggle('on', o === b); };
$('chg').onclick = () => { if (G.state !== 'aim') return; AU.ui(); G.pi = (G.pi + 1) % 5; if (G.match) G.match.ts[G.def === G.homeT ? 'H' : 'A'].pi = G.pi; if (NETON()) netSend('c', PN(G.pn + 1), { pi: G.pi }); setupActors(); newPitch(); const pl = G.def.players[G.pi]; showCall(esc(pl.name), esc(pl.note) + (KIME[pl.kime] ? '　決め球：' + KIME[pl.kime].name : '')); };

// --- キーボード（パソコンで遊ぶとき）。Esc でひとつ前の画面へ
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('nm').classList.contains('hide')) return closeName(false);
  for (const [id, bid] of [['set', 'bSetOk'], ['cup', 'bCupBack'], ['free', 'bFreeBack'], ['online', 'bOnBack'], ['res', null]]) {
    if (!$(id).classList.contains('hide')) { if (bid) $(bid).click(); return; }
  }
  if (G.mode !== 'title') $('back').click();
});
// スタンプの引き出しは、外をさわったら閉じる
canvas.addEventListener('pointerdown', () => emoClose());

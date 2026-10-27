// ===== [SEC:NET] =====
// オンライン対戦：2台のスマホをつなぐ。
//
// つなぎ方は2段がまえ。
//   ① 直つなぎ（WebRTC）…ふだんはこちら。相手のスマホと直につながるので 行き帰り 30〜80ミリ秒。
//   ② 中継（Firestore）…直つなぎができない回線のときの保険。行き帰り 300〜600ミリ秒。
// 「部屋さがし」と「①をつなぐための合図」は、どちらも Firestore でやる（みんなの樽と同じプロジェクト）。
//
// 送るもの（どれも「何球目か」の番号 n つき）：
//   p＝投げた人の「投げ方」／x＝打つ人の「本塁を通った時の振り・打球」／r＝打つ人が決めた「その1球の結果」／c＝投手交代／bye＝やめる
//   h＝それ以外ぜんぶ（中に t を入れて見分ける：hi 名前・pi/po つながり具合・sdp/ice 直つなぎの合図・em スタンプ・rm もう一度）
//   ※ h の中に入れるのは、Firestore のきまり（ルール）を増やさなくても そのまま送れるようにするため。
//
// 打った結果は 打つ人のスマホが決める（通信が少し遅れても、打つタイミングがずれない）。
// 投げた人のスマホは、相手の振りが届くまで本塁の手前でスローにして待つ。直つなぎのときは 遅れが小さいので ほぼスローにならない。
// 保存の形：capRooms/{4けたの番号}（host・guest・sid・st・home・at）、capRooms/{番号}/ev（送ったもの。to＝あて先）、capLobby/quick（だれかと対戦の待合所）
// 無料枠を大事に使うため：トランザクションは使わない（入れるのは1人だけ、はルールで守る）／自分あてだけ受けとる／直つなぎができたら Firestore は使わない
// ?mocknet の時は 同じブラウザの別のタブどうしでつなぐ（確認用。&lag=ミリ秒 で合図の遅れをまねる／&relay で中継だけを試す）
const FIREBASE_CONFIG = {"apiKey": "AIzaSyDgzaEzIltyI-UkB_i1LKrcq0fLPtXqel0", "authDomain": "nkworks-games.firebaseapp.com", "projectId": "nkworks-games", "storageBucket": "nkworks-games.firebasestorage.app", "messagingSenderId": "996468697479", "appId": "1:996468697479:web:ccea287b2ddeb1ff234b22"};
const FIREBASE_VER = '10.12.2';
const NETON = () => !!(G.match && G.match.on && !G.match.on.gone);   // 相手が人のあいだ true（抜けたら CPU）
const vA = v => [v.x, v.y, v.z], aV = a => V(a[0], a[1], a[2]);
const serPi = pi => ({ rel: vA(pi.rel), vel: vA(pi.vel), B: vA(pi.B), T: pi.T, ramp: pi.ramp || null, wob: pi.wob || null, kmh: pi.kmh, lat: pi.lat, vert: pi.vert, name: pi.name });
const desPi = d => ({ rel: aV(d.rel), vel: aV(d.vel), B: aV(d.B), T: d.T, ramp: d.ramp || undefined, wob: d.wob || null, kmh: d.kmh, lat: d.lat, vert: d.vert, name: d.name });
const newSid = () => Math.random().toString(36).slice(2, 10);
const qs = k => new RegExp('[?&]' + k + '(=([^&]*))?').exec(location.search);
// やりとりの番号：「何試合目か」も混ぜる（もう一度 対戦する時に、前の試合の送りのこしと まちがえないように）
const PN = p => (ONL.on ? ONL.on.gameNo : 1) * 10000 + p;

// --- 合図のやりとり：Firestore
class FireNet {
  async init() {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VER}/`;
    const [app, auth, fs] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
    const a = app.getApps().find(x => x.name === 'capyakyu') || app.initializeApp(FIREBASE_CONFIG, 'capyakyu'), au = auth.getAuth(a);
    this.fs = fs; this.db = fs.getFirestore(a); await auth.signInAnonymously(au); this.uid = au.currentUser.uid; this.seq = 0;
  }
  room(code) { return this.fs.doc(this.db, 'capRooms', code); }
  lobby() { return this.fs.doc(this.db, 'capLobby', 'quick'); }
  fresh(ts, sec) { const ms = ts && (ts.toMillis ? ts.toMillis() : ts); return !!ms && Date.now() - ms < sec * 1000; }
  async make(pub) {
    const fs = this.fs;
    for (let i = 0; i < 12; i++) {
      const code = String(1000 + Math.floor(Math.random() * 9000)), sid = newSid(), home = Math.random() < 0.5 ? 'host' : 'guest';
      const s = await fs.getDoc(this.room(code)); if (s.exists()) { const d = s.data(); if (d.st !== 'end' && this.fresh(d.at, 7200)) continue; }
      try { await fs.setDoc(this.room(code), { host: this.uid, guest: null, sid, pub: !!pub, st: 'wait', home, at: fs.serverTimestamp() }); }
      catch (e) { if (e && e.code === 'permission-denied') continue; throw e; }   // ちょうど同じ番号を だれかが作った
      Object.assign(this, { code, sid, role: 'host', home, lastSend: Date.now() }); return { code };
    }
    throw new Error('部屋を作れませんでした。もう一度ためしてね');
  }
  async join(code) {
    const fs = this.fs, s = await fs.getDoc(this.room(code)); if (!s.exists()) throw new Error('その番号の部屋はありません');
    const d = s.data(), busy = new Error('その部屋は もう始まっているか、終わっています');
    if (d.host === this.uid) throw new Error('自分で作った部屋です。相手に番号を伝えてね');
    if (d.st !== 'wait' || d.guest || !this.fresh(d.at, 7200)) throw busy;
    try { await fs.updateDoc(this.room(code), { guest: this.uid, st: 'play' }); }   // 先にだれかが入っていたら ルールで断られる
    catch (e) { if (e && e.code === 'permission-denied') throw busy; throw e; }
    Object.assign(this, { code, sid: d.sid, role: 'guest', home: d.home, lastSend: Date.now() }); return { code };
  }
  async lobbyGet() { const s = await this.fs.getDoc(this.lobby()); return s.exists() ? s.data() : null; }
  lobbyOther(d) { return !!(d && d.code && d.uid !== this.uid && this.fresh(d.at, CONFIG.netLobby)); }
  // 入った部屋（または自分の部屋）の案内を 待合所から消す。ほかの人の案内に変わっていたら そのまま
  async lobbyTake(code) { const d = await this.lobbyGet(); if (d && d.code === code) await this.fs.setDoc(this.lobby(), { code: null, uid: null, at: this.fs.serverTimestamp() }); }
  // だれかと：待合所に だれかの部屋があれば入る。なければ 自分の部屋を作って 待合所に書く
  async quick() {
    const d = await this.lobbyGet();
    if (this.lobbyOther(d)) { try { const r = await this.join(d.code); this.lobbyTake(d.code).catch(() => { }); return r; } catch (e) { /* 先に取られていたら 自分で待つ */ } }
    const r = await this.make(true); await this.lobbyPut(); return r;
  }
  async lobbyPut() { await this.fs.setDoc(this.lobby(), { code: this.code, uid: this.uid, at: this.fs.serverTimestamp() }); this.lobbyMine = true; }
  // 待っているあいだ：ほかに待っている人がいたら その部屋に入る（true を返す）。いなければ 自分の案内を書きなおす
  async lobbyBeat() {
    const d = await this.lobbyGet();
    if (this.lobbyOther(d)) {
      const mine = this.code; try { await this.join(d.code); } catch (e) { return false; }
      this.lobbyMine = false; this.lobbyTake(d.code).catch(() => { }); this.fs.updateDoc(this.room(mine), { st: 'end' }).catch(() => { }); return true;
    }
    await this.lobbyPut(); return false;
  }
  async lobbyClear() { this.lobbyMine = false; await this.lobbyTake(this.code); }
  watchRoom(cb) { return this.fs.onSnapshot(this.room(this.code), s => { if (s.exists()) cb(s.data()); }, e => console.warn('部屋の見はり', e)); }
  listen(cb) {   // 自分あて（to）のものだけ受けとる
    const fs = this.fs, q = fs.query(fs.collection(this.db, 'capRooms', this.code, 'ev'), fs.where('sid', '==', this.sid), fs.where('to', '==', this.role));
    return fs.onSnapshot(q, s => { for (const ch of s.docChanges()) if (ch.type === 'added') cb(ch.doc.data()); }, e => console.warn('受けとり', e));
  }
  send(k, n, d) { const fs = this.fs; this.lastSend = Date.now(); return fs.addDoc(fs.collection(this.db, 'capRooms', this.code, 'ev'), { sid: this.sid, uid: this.uid, to: this.role === 'host' ? 'guest' : 'host', s: ++this.seq, k, n, d: d ?? null, at: fs.serverTimestamp() }); }
  end() { return this.fs.updateDoc(this.room(this.code), { st: 'end' }); }
}
class MockNet {   // 確認用：同じブラウザの別タブどうし（localStorage と BroadcastChannel）
  async init() {
    this.uid = 'u' + newSid(); this.seq = 0; this.cb = { ev: [], room: [] }; this.lag = +((qs('lag') || [])[2] || 60);
    this.ch = new BroadcastChannel('capnet'); this.ch.onmessage = m => setTimeout(() => this.got(m.data), this.lag);
  }
  got(m) { if (m.code !== this.code) return; if (m.t === 'ev' && m.d.sid === this.sid && m.d.to === this.role) this.cb.ev.forEach(f => f(m.d)); if (m.t === 'room') { const d = this.get(this.code); if (d) this.cb.room.forEach(f => f(d)); } }
  get(code) { try { return JSON.parse(localStorage.getItem('mocknet:' + code)); } catch (e) { return null; } }
  put(code, d) { localStorage.setItem('mocknet:' + code, JSON.stringify(d)); this.ch.postMessage({ t: 'room', code }); setTimeout(() => this.got({ t: 'room', code }), 0); }
  fresh(ms, sec) { return !!ms && Date.now() - ms < sec * 1000; }
  async make(pub) {
    for (let i = 0; i < 12; i++) { const code = String(1000 + Math.floor(Math.random() * 9000)), d = this.get(code); if (d && d.st !== 'end' && this.fresh(d.at, 7200)) continue;
      const sid = newSid(), home = Math.random() < 0.5 ? 'host' : 'guest'; Object.assign(this, { code, sid, role: 'host', home, lastSend: Date.now() });
      this.put(code, { host: this.uid, guest: null, sid, pub: !!pub, st: 'wait', home, at: Date.now() }); return { code }; }
    throw new Error('部屋を作れませんでした');
  }
  async join(code) {
    const d = this.get(code); if (!d) throw new Error('その番号の部屋はありません'); if (d.host === this.uid) throw new Error('自分で作った部屋です');
    if (d.st !== 'wait' || d.guest) throw new Error('その部屋は もう始まっているか、終わっています');
    Object.assign(this, { code, sid: d.sid, role: 'guest', home: d.home, lastSend: Date.now() }); d.guest = this.uid; d.st = 'play'; this.put(code, d); return { code };
  }
  lobbyGet() { try { return JSON.parse(localStorage.getItem('mocknet:lobby')); } catch (e) { return null; } }
  lobbyOther(L) { return !!(L && L.code && L.uid !== this.uid && this.fresh(L.at, CONFIG.netLobby)); }
  lobbyTake(code) { const L = this.lobbyGet(); if (L && L.code === code) localStorage.setItem('mocknet:lobby', JSON.stringify({ code: null })); }
  lobbyPut() { localStorage.setItem('mocknet:lobby', JSON.stringify({ code: this.code, uid: this.uid, at: Date.now() })); this.lobbyMine = true; }
  async quick() {
    const L = this.lobbyGet();
    if (this.lobbyOther(L)) { try { const r = await this.join(L.code); this.lobbyTake(L.code); return r; } catch (e) { } }
    const r = await this.make(true); this.lobbyPut(); return r;
  }
  async lobbyBeat() {
    const L = this.lobbyGet();
    if (this.lobbyOther(L)) { const mine = this.code; try { await this.join(L.code); } catch (e) { return false; } this.lobbyMine = false; this.lobbyTake(L.code); const d = this.get(mine); if (d) { d.st = 'end'; this.put(mine, d); } return true; }
    this.lobbyPut(); return false;
  }
  async lobbyClear() { this.lobbyMine = false; this.lobbyTake(this.code); }
  watchRoom(cb) { this.cb.room.push(cb); const d = this.get(this.code); if (d) setTimeout(() => cb(d), 0); return () => { this.cb.room = this.cb.room.filter(f => f !== cb); }; }
  listen(cb) { this.cb.ev.push(cb); return () => { this.cb.ev = this.cb.ev.filter(f => f !== cb); }; }
  async send(k, n, d) { this.lastSend = Date.now(); this.ch.postMessage({ t: 'ev', code: this.code, d: { sid: this.sid, uid: this.uid, to: this.role === 'host' ? 'guest' : 'host', s: ++this.seq, k, n, d: d ?? null } }); }
  async end() { const d = this.get(this.code); if (d) { d.st = 'end'; this.put(this.code, d); } }
}

// --- 直つなぎ（WebRTC）。合図は上の net（Firestore / 同じブラウザ）に のせて送る
// 部屋を作った人（host）が先に話しかけ、入った人（guest）が返す。できなければ 中継のまま続ける
const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
class Link {
  constructor(net, on) {
    this.net = net; this.on = on; this.role = net.role; this.pc = null; this.dc = null;
    this.open = false; this.rtt = null; this.gen = 0; this.tries = 0; this.pend = []; this.cbuf = []; this.cto = null;
    this.lastPing = 0; this.pingAt = 0; this.outbox = new Map(); this.dead = /[?&]relay/.test(location.search);
    this.t0 = performance.now();
  }
  get tp() { return this.open ? 'p2p' : 'relay'; }
  // 合図を送る（中継の道をつかう）
  sig(d) { this.net.send('h', 0, d).catch(e => console.warn('合図を送れませんでした', e)); }
  start() {
    if (this.dead || !CONFIG.netP2P || typeof RTCPeerConnection !== 'function') return;   // ?relay・設定で切った時・古いブラウザは 中継だけ
    this.gen++; this.make();
    if (this.role === 'host') this.offer();
  }
  make() {
    this.drop(); this.pend = []; this.cbuf = [];
    const pc = this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 2 });
    pc.onicecandidate = e => { if (e.candidate) this.queueCand(e.candidate); };
    pc.onconnectionstatechange = () => { const s = pc.connectionState; if (s === 'failed' || s === 'closed') this.lost(); };
    pc.ondatachannel = e => this.bind(e.channel);
    if (this.role === 'host') this.bind(pc.createDataChannel('g', { ordered: true }));
  }
  drop() { if (this.dc) { try { this.dc.onclose = null; this.dc.close(); } catch (e) { } this.dc = null; } if (this.pc) { try { this.pc.close(); } catch (e) { } this.pc = null; } this.open = false; }
  bind(dc) {
    this.dc = dc; dc.binaryType = 'arraybuffer';
    dc.onopen = () => {
      this.open = true; this.tries = 0;
      ONL.tp = 'p2p'; updOnBar();
      if (performance.now() - this.t0 > 2500) toast('直つなぎに切りかえました');
      netHello(); this.ping();
    };
    dc.onclose = () => this.lost();
    dc.onerror = () => { };
    dc.onmessage = e => { try { const m = JSON.parse(e.data); if (m && typeof m.k === 'string') netOnEvent(this.on, m); } catch (_) { } };
  }
  async offer() {
    const pc = this.pc, g = this.gen; if (!pc) return;
    try { const o = await pc.createOffer({ iceRestart: this.tries > 0 }); if (this.gen !== g) return; await pc.setLocalDescription(o); this.sig({ t: 'sdp', g, sdp: { type: o.type, sdp: o.sdp } }); }
    catch (e) { console.warn('よびかけ', e); }
  }
  // 相手からの合図
  async onSdp(m) {
    const sdp = m && m.sdp; if (!sdp || !sdp.type) return;
    if (sdp.type === 'offer' && this.role === 'guest') { if (!this.pc || this.pc.signalingState === 'closed' || (m.g || 0) > this.gen) { this.gen = m.g || this.gen; this.make(); } }
    const pc = this.pc; if (!pc) return;
    try {
      await pc.setRemoteDescription(sdp);
      for (const c of this.pend.splice(0)) { try { await pc.addIceCandidate(c); } catch (_) { } }
      if (sdp.type === 'offer') { const a = await pc.createAnswer(); await pc.setLocalDescription(a); this.sig({ t: 'sdp', g: this.gen, sdp: { type: a.type, sdp: a.sdp } }); }
    } catch (e) { console.warn('合図のやりとり', e); }
  }
  async onIce(m) {
    const pc = this.pc, list = Array.isArray(m && m.c) ? m.c : []; if (!pc) return;
    for (const c of list) { if (!c) continue; if (!pc.remoteDescription) this.pend.push(c); else { try { await pc.addIceCandidate(c); } catch (_) { } } }
  }
  // 道しるべ（ICE）は まとめて送る：Firestore への書きこみを少なくするため
  queueCand(c) {
    this.cbuf.push({ candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex, usernameFragment: c.usernameFragment });
    if (this.cto) return;
    this.cto = setTimeout(() => { this.cto = null; const c2 = this.cbuf.splice(0); if (c2.length) this.sig({ t: 'ice', g: this.gen, c: c2 }); }, CONFIG.netIceWait * 1000);
  }
  // 直つなぎが切れた：中継にもどして、送れていないかもしれない分を もう一度送る
  lost() {
    if (!this.open && !this.pc) return;
    const was = this.open; this.open = false; ONL.tp = 'relay'; this.rtt = null;
    if (was) { toast('通信を 中継に切りかえました'); for (const [, v] of this.outbox) this.net.send(v.k, v.n, v.d).catch(() => { }); }
    updOnBar();
    if (this.on.gone || this.tries >= CONFIG.netP2PTries) return;
    this.tries++; clearTimeout(this.rto); this.rto = setTimeout(() => { if (!this.on.gone && !this.open) { this.make(); if (this.role === 'host') this.offer(); } }, 1600);
  }
  // 試合のやりとりを送る。直つなぎができていれば そちら、だめなら中継
  send(k, n, d) {
    if ('pxrc'.includes(k)) { this.outbox.set(k + ':' + n, { k, n, d }); for (const key of [...this.outbox.keys()]) if (+key.split(':')[1] < n - 1) this.outbox.delete(key); }
    if (this.open) { try { this.dc.send(JSON.stringify({ uid: this.net.uid, k, n, d: d ?? null })); return Promise.resolve(); } catch (e) { this.lost(); } }
    return this.net.send(k, n, d);
  }
  // つながり具合をはかる（行き帰りの時間）。直つなぎができていなければ 中継で送る＝「いるよ」の合図にもなる
  ping() { this.lastPing = performance.now(); this.send('h', 0, { t: 'pi', s: this.lastPing }).catch(() => { }); }
  onPong(m) { if (!m || typeof m.s !== 'number') return; const r = (performance.now() - m.s) / 1000; if (r > 0 && r < 8) this.rtt = this.rtt == null ? r : lerp(this.rtt, r, 0.4); updOnBar(); }
  // 1秒ごとによばれる：ときどき ping を送って、生きていることも伝える
  tick() {
    const gap = (this.open ? CONFIG.netPingP2P : CONFIG.netBeat) * 1000;
    if (performance.now() - this.lastPing > gap) this.ping();
  }
  close() { clearTimeout(this.rto); clearTimeout(this.cto); this.cto = null; this.drop(); }
}

const ONL = { net: null, on: null, link: null, tp: 'relay', unsub: [], timers: [], busy: false, beating: false, waitStart: 0, tab: 'quick', late: null };
async function netReady() { if (ONL.net) return ONL.net; const n = /[?&]mocknet/.test(location.search) ? new MockNet() : new FireNet(); await n.init(); ONL.net = n; return n; }
function netStop() { for (const u of ONL.unsub) { try { u(); } catch (e) { } } ONL.unsub = []; for (const t of ONL.timers) clearInterval(t); ONL.timers = []; }
function netSend(k, n, d) { const on = G.match && G.match.on; if (!on || on.gone) return; on.link.send(k, n, d).catch(e => console.warn('送れませんでした', e)); }
// p/x/r/c/bye 以外は すべて h の中に入れて送る（Firestore のきまりを増やさずに すむように）
function netTell(t, d) { const on = ONL.on; if (!on || on.gone) return; on.link.send('h', 0, { t, ...d }).catch(() => { }); }

// --- 待合の画面
function openOnline() {
  toTitle(); $('title').classList.add('hide'); $('tbar').classList.add('hide');
  onlShow('menu'); onlTab(ONL.tab); showMyName(); $('onErr').textContent = ''; $('online').classList.remove('hide');
  // ?room=1234 のリンクから来た時は、はじめの1回だけ「番号で入る」に番号を入れておく
  if (!ONL.deep) { ONL.deep = true; const m = qs('room'); if (m && m[2] && /^\d{4}$/.test(m[2])) { onlTab('join'); $('onCode').value = m[2]; } }
}
function onlTab(t) {
  ONL.tab = t;
  for (const b of $('onTabs').children) b.classList.toggle('on', b.dataset.t === t);
  for (const p of document.querySelectorAll('#onMenu .tabpane')) p.classList.toggle('hide', p.dataset.p !== t);
}
function onlShow(st, msg = '', code = '') {
  $('onMenu').classList.toggle('hide', st !== 'menu'); $('onWait').classList.toggle('hide', st !== 'wait');
  $('onWait').classList.remove('found'); $('onMsg').classList.remove('dots');
  $('onCodeShow').textContent = code; $('onShare').classList.toggle('hide', !code);
  $('onMsg').textContent = msg; $('onElapsed').textContent = '';
  $('bOnBack').textContent = st === 'wait' ? 'やめる' : 'もどる';
}
function onlBusy(id, on) { const b = $(id); if (b) b.classList.toggle('load', !!on); }
async function onlStart(kind) {
  if (ONL.busy) return; ONL.busy = true; $('onErr').textContent = '';
  const bid = { quick: 'bOnQuick', make: 'bOnMake', join: 'bOnJoin' }[kind]; onlBusy(bid, true);
  try {
    if (kind === 'join' && $('onCode').value.replace(/\D/g, '').length !== 4) throw new Error('4けたの番号を入れてね');
    onlShow('wait', 'つないでいます…');
    const net = await netReady();
    if (kind === 'join') { await net.join($('onCode').value.replace(/\D/g, '')); return onlFound(); }
    const r = kind === 'make' ? await net.make(false) : await net.quick();
    if (net.role === 'guest') return onlFound();
    onlShow('wait', kind === 'make' ? 'この番号を相手に伝えてね。相手が入ると始まります' : '相手をさがしています', kind === 'make' ? r.code : '');
    if (kind !== 'make') $('onMsg').classList.add('dots');
    ONL.waitStart = performance.now();
    ONL.unsub.push(net.watchRoom(d => { if (d.st === 'play' && d.guest && !(G.match && G.match.on)) onlFound(); }));
    ONL.timers.push(setInterval(() => {
      const sec = Math.floor((performance.now() - ONL.waitStart) / 1000);
      $('onElapsed').textContent = sec > 3 ? `待っている時間 ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : '';
    }, 500));
    if (kind === 'quick') ONL.timers.push(setInterval(() => {
      if (!ONL.beating) { ONL.beating = true; net.lobbyBeat().then(j => { if (j && !(G.match && G.match.on)) onlFound(); }).catch(() => { }).finally(() => { ONL.beating = false; }); }
      if (performance.now() - ONL.waitStart > 60000) { $('onMsg').classList.remove('dots'); $('onMsg').textContent = 'いまは だれもいないみたいです。このまま待つか、「部屋を作る」で友だちと遊んでね'; }
    }, CONFIG.netBeat * 1000));
  } catch (e) { console.warn(e); onlCancel(); onlShow('menu'); $('onErr').textContent = (e && e.message && /[ぁ-ん]/.test(e.message)) ? e.message : 'つながりませんでした。通信を確かめて、もう一度ためしてね'; }
  finally { ONL.busy = false; onlBusy(bid, false); }
}
// 相手が見つかった：ひと呼吸おいてから試合へ（見つかったことが分かるように）
function onlFound() {
  $('onMsg').classList.remove('dots'); $('onMsg').textContent = '相手が見つかりました！';
  $('onWait').classList.add('found'); $('onShare').classList.add('hide'); $('onElapsed').textContent = '';
  AU.ui(); haptic(20); setTimeout(() => { if (!(G.match && G.match.on)) startOnline(); }, 450);
}
function onlCancel() {
  const net = ONL.net; netStop(); $('onMsg').classList.remove('dots'); if (!net) return;
  if (net.code && net.role === 'host' && !(G.match && G.match.on)) net.end().catch(() => { });
  if (net.lobbyMine) net.lobbyClear().catch(() => { });
}
// 番号のコピー・リンクで誘う
async function onlCopy() {
  const code = $('onCodeShow').textContent; if (!code) return;
  try { await navigator.clipboard.writeText(code); toast('番号 ' + code + ' をコピーしました'); } catch (e) { toast('コピーできませんでした'); }
}
async function onlLink() {
  const code = $('onCodeShow').textContent; if (!code) return;
  const url = location.origin + location.pathname + '?room=' + code;
  const txt = `キャップ野球で対戦しよう！　部屋の番号 ${code}\n${url}`;
  if (navigator.share) { try { await navigator.share({ title: 'キャップ野球', text: `部屋の番号 ${code}`, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(txt); toast('さそいのリンクをコピーしました'); } catch (e) { toast('コピーできませんでした'); }
}

// --- 試合
function startOnline() {
  const net = ONL.net; netStop(); net.lobbyMine = false;
  const on = { net, role: net.role, meHome: net.home === net.role, inbox: { p: {}, x: {}, r: {}, c: {} }, cs: {}, heard: performance.now(), gone: false,
    oppName: 'あいて', gameNo: 1, rmMe: false, rmOpp: false, emSeen: {}, emN: 0, emT: [], wins: { me: 0, opp: 0 } };
  ONL.on = on; ONL.late = null; ONL.tp = 'relay';
  on.link = ONL.link = new Link(net, on);
  ONL.unsub.push(net.listen(e => netOnEvent(on, e)));
  on.link.start(); netHello();
  // 1秒ごと：つながり具合をはかる／相手から何も届かないまま netGone 秒たったら CPU に
  ONL.timers.push(setInterval(() => {
    if (ONL.on !== on || on.gone) return;
    on.link.tick(); updOnBar();
    const quiet = (performance.now() - on.heard) / 1000;
    if (quiet > CONFIG.netGone) { if (G.state === 'over') netOppLeft(); else if (G.match && G.match.on === on) setGone('あいてと つながらなくなりました'); }
  }, 1000));
  $('online').classList.add('hide'); AU.resume();
  OPP_TEAM.name = OPP_TEAM.short = 'あいて';
  startMatch(0, null, on);
}
// 自分の名前を相手に伝える（名前を変えた時も よぶ）
function netHello() { const on = ONL.on; if (!on || on.gone) return; netTell('hi', { n: myName(), g: on.gameNo }); }
function netOnEvent(on, e) {
  if (on.gone || !e || !e.k || e.uid === on.net.uid) return;
  on.heard = performance.now();
  const n = e.n, d = e.d;
  if (e.k === 'p') on.inbox.p[n] = d;
  else if (e.k === 'x') { on.inbox.x[n] = d; if (G.match && G.match.on === on) netOnCross(n); }
  else if (e.k === 'r') { on.inbox.r[n] = d; if (G.match && G.match.on === on && G.state === 'rres' && n === PN(G.pn)) netApplyRes(d); }
  else if (e.k === 'c') { if (!on.cs[n] || e.s > on.cs[n]) { on.cs[n] = e.s; on.inbox.c[n] = d && d.pi; } }
  else if (e.k === 'bye') { netOppLeft(); if (G.match && G.match.on === on && G.state !== 'over') setGone('あいてが 試合をやめました'); }
  else if (e.k === 'h' && d && d.t) netOnTell(on, d);
}
// h の中身（名前・つながり具合・直つなぎの合図・スタンプ・もう一度）
function netOnTell(on, d) {
  const link = on.link;
  switch (d.t) {
    case 'pi': link.send('h', 0, { t: 'po', s: d.s }).catch(() => { }); break;
    case 'po': link.onPong(d); break;
    case 'sdp': link.onSdp(d); break;
    case 'ice': link.onIce(d); break;
    case 'hi': { const nm = cleanName(d.n) || 'あいて'; if (nm !== on.oppName) { on.oppName = nm; netShowOppName(); } break; }
    case 'em': netEmoGot(on, d); break;
    case 'rm': if ((d.g | 0) === on.gameNo + 1) { on.rmOpp = true; netRematchUI(); netTryRematch(); } break;
  }
}
// 相手の名前を 画面のあちこちに出す
function netShowOppName() {
  const on = ONL.on; if (!on) return;
  OPP_TEAM.name = OPP_TEAM.short = on.oppName;
  $('onBarN').textContent = on.oppName;
  if (G.homeT && G.awayT) setTeamsHUD();
  if (G.match && G.match.on === on && ACT.BAT) whoLine();
  // 試合はじめの帯が まだ出ていたら、そこの名前も入れかえる（名前は 帯より ほんの少しおくれて届く）
  const bd = $('band'), bb = bd.querySelector('b');
  if (bd.classList.contains('show') && bb.textContent.startsWith('オンライン対戦')) bb.textContent = `オンライン対戦　vs ${on.oppName}`;
}
// つながり具合の帯
function updOnBar() {
  const on = ONL.on, bar = $('onBar'); if (!bar) return;
  if (!on) { bar.classList.add('hide'); return; }
  const live = (G.match && G.match.on === on) || G.state === 'over';
  bar.classList.toggle('hide', !live);
  if (!live) return;
  const r = on.link.rtt, ms = r == null ? null : Math.round(r * 1000);
  bar.classList.toggle('warn', !!on.gone);
  bar.classList.remove('q1', 'q2', 'q3');
  bar.classList.add(ms == null ? 'q1' : ms < 90 ? 'q3' : ms < 220 ? 'q2' : 'q1');
  $('onBarMs').textContent = on.gone ? 'CPU' : ms == null ? '‥' : ms + 'ms';
  $('onBarTp').textContent = on.gone ? '' : on.link.open ? '直接' : '中継';
}
// 相手が抜けた：ここからは CPU が相手チームを動かす
function setGone(msg) {
  const on = G.match && G.match.on; if (!on || on.gone) return; on.gone = true; on.goneMsg = msg;
  showCall('あいてが抜けました', 'ここからは CPU が代わりに続けます', '#ffd23f'); setHint(''); G.netHolding = false;
  OPP_TEAM.name = OPP_TEAM.short = 'あいて（CPU）'; if (G.homeT && G.awayT) setTeamsHUD();
  if (G.state === 'rres') netApplyRes({ res: G.rresLocal });
  emoClose(); $('emoB').classList.add('hide'); updOnBar(); netStop(); if (on.link) on.link.close();
}
// 結果の画面で 相手が帰った
function netOppLeft() { const on = ONL.on; if (!on || on.left) return; on.left = true; netRematchUI(); updOnBar(); }
// 投げた球を送る（このスマホが投げる側）
function netSendPitch(pi) { netSend('p', PN(G.pn + 1), serPi(pi)); }
// 打つ側：相手の投げた球が届いているか（投手交代が先に届いていたら 入れかえる）
function netPitchReady() {
  const on = G.match.on, n = PN(G.pn + 1), c = on.inbox.c[n];
  if (c != null && c !== G.pi && G.state === 'cpuwind' && ACT.P.st.thr === undefined && !(ACT.P.st.u > CONFIG.netSetU + 1e-6)) {
    G.pi = c; G.match.ts[G.def === G.homeT ? 'H' : 'A'].pi = c; setupActors(); newPitch(); showCall(esc(G.def.players[c].name), '投手交代');
  }
  return !!on.inbox.p[n];
}
function netTakePitch() { return desPi(G.match.on.inbox.p[PN(G.pn + 1)]); }
// 投げる側：相手の振りが届くまで、キャップを本塁の手前で止めておく（めったに起きない。中継のときの保険）
function netHold(c, h) {
  G.netHolding = false;
  if (!NETON() || G.mode !== 'pitch' || c.mode !== 'pitch' || G.crossedHit || G.match.on.inbox.x[PN(G.pn)]) return false;
  if (c.pos.z + c.vel.z * h < CONFIG.hitZ - 1e-4) return false;
  G.netHolding = true; return true;
}
// 投げる側：投げた時刻（ほんとうの時間）と、ふつうの速さで本塁に着くまでの時間をおぼえる
function netOnLaunch(pi) { if (NETON() && G.mode === 'pitch') { G.nlR = performance.now() / 1000; G.nT = pi.T || 0.6; } else G.nlR = 0; }
// 相手の振りが届くまでの「見こみの遅れ」。はじめは 行き帰りの時間からあたりをつけ、試合中は 実際の遅れで直していく
// 振りは「指をはなした時（当たる swingDelay 秒前）」に送られるので、片道が swingDelay より短ければ 待たなくてよい（マイナスになる）
function netLate() {
  if (ONL.late != null) return ONL.late;
  const on = ONL.on, r = on && on.link.rtt;
  return r != null ? clamp(r / 2 - CONFIG.swingDelay, -0.3, 2) : CONFIG.netLate0;
}
// 投げる側：本塁の手前（あと netSlowWin 秒）から、見こみの遅れの分だけ なめらかにスローにする。届いたら ふつうに戻る
function netSlowF() {
  if (!NETON() || G.mode !== 'pitch' || CAP.mode !== 'pitch' || G.crossedHit || G.match.on.inbox.x[PN(G.pn)] || !G.nlR) return 1;
  const tr = (CONFIG.hitZ - CAP.pos.z) / Math.max(1, CAP.vel.z); if (tr > CONFIG.netSlowWin) return 1;
  const rem = G.nT + netLate() - (performance.now() / 1000 - G.nlR);
  return rem <= 0 ? CONFIG.netSlow : rem > tr ? clamp(tr / rem, CONFIG.netSlow, 1) : 1;   // 見こみより遅れている時は いちばん遅く
}
// 投げる側：相手の振りが届いた → 打者の振りを合わせて見せる
function netOnCross(n) {
  const d = G.match.on.inbox.x[n]; if (n !== PN(G.pn) || G.mode !== 'pitch') return;
  if (G.nlR) { const late = performance.now() / 1000 - G.nlR - G.nT; ONL.late = clamp(lerp(netLate(), late, 0.35), -0.3, 2); G.nlR = 0; }   // 遅れの見こみを直す
  if (!d.sw || SWING.on) return;
  const tc = CAP.mode === 'pitch' && !G.crossedHit ? G.time + Math.max(0, (CONFIG.hitZ - CAP.pos.z) / Math.max(1, CAP.vel.z)) : (G.crossT ?? G.time);
  startSwing(d.sw.cx, d.sw.cy, tc + d.sw.ds);
}
// 投げる側：本塁を通った時。相手のスマホで打っていたら、同じ打球を飛ばす
function netCrossRemote() {
  const d = G.match.on.inbox.x[PN(G.pn)]; if (!d) return false;
  if (d.sw && !SWING.on) startSwing(d.sw.cx, d.sw.cy, G.crossT + d.sw.ds);
  if (d.hit) { PRNG.f = mulberry32(d.hit.seed); contact({ vel: aV(d.hit.vel), q: d.hit.q }, d.hit.xc, d.hit.yc); return true; }
  return false;
}
// 打つ側：本塁を通った時。振ったか・打球を送る（打球のゆらぎは 種をそろえて 両方で同じに）
function netCrossLocal(r, xc, yc) {
  const sw = SWING.on ? { ds: SWING.tRel - G.crossT, cx: SWING.cx, cy: SWING.cy } : null; G.xSent = G.pn;
  if (r && r.hit) { const seed = (Math.random() * 4294967296) >>> 0; PRNG.f = mulberry32(seed); contact(r, xc, yc); netSend('x', PN(G.pn), { sw, hit: { xc, yc, vel: vA(r.vel), q: r.q, seed } }); return true; }
  netSend('x', PN(G.pn), { sw, hit: null }); return false;
}
// 1球の終わり：打つ側が結果を決めて送る。投げる側は 届いた結果を使う（届くまで待つ）
function finishPlay(res) {
  if (NETON() && G.mode === 'pitch') { const m = G.match.on.inbox.r[PN(G.pn)]; if (m) return netApplyRes(m); G.state = 'rres'; G.rresLocal = res; G.waitT = 0; return; }
  if (NETON() && G.mode === 'bat') { if (G.xSent !== G.pn) netSend('x', PN(G.pn), { sw: null, hit: null }); netSend('r', PN(G.pn), { res, pre: netSnap() }); }
  endPlay(res);
}
// 届いた結果を使う。その前に、両方のスマホで 同じカウント・同じ点だったかを確かめる
function netApplyRes(m) { if (m && m.pre) netCheckState(m.pre); endPlay(m.res); }
// いまの試合の記録（この1球の前）。打つ側が いっしょに送る
function netSnap() { return { b: G.cnt.b, s: G.cnt.s, o: G.cnt.o, ba: G.bases.join(''), A: G.runs.A, H: G.runs.H, i: G.inning }; }
// ずれていたら 打つ側に合わせる（打った結果は 打つ側が決めるきまりなので、そちらが正しい）。めったに起きない念のための直し
function netCheckState(p) {
  const me = netSnap(); let bad = false;
  for (const k of ['b', 's', 'o', 'ba', 'A', 'H', 'i']) if (me[k] !== p[k]) bad = true;
  if (!bad) return;
  console.warn('記録がずれていました', me, p);
  G.cnt.b = p.b | 0; G.cnt.s = p.s | 0; G.cnt.o = p.o | 0;
  G.bases = String(p.ba || '000').split('').map(x => +x ? 1 : 0).slice(0, 3);
  G.runs.A = p.A | 0; G.runs.H = p.H | 0; G.inning = (p.i | 0) || 1;
  updHUD(); toast('試合の記録を そろえました');
}
// 投げる番で 長く投げない時は、その1球だけ CPU が代わりに投げる
function netAutoPitch() {
  const P = ACT.P, pl = P.pl, K = KP[pl.style] || KP.over, rel = W(P, K.hand[2][0], K.hand[2][1], K.hand[2][2]).add(Wd(P, 0, 0, PSHIFT[2]));
  const ch = cpuChoosePitch({ ...pl, rep: ['straight', 'straight', 'change', 'slider', 'drop'] }, G.cnt);
  G.pending = { pi: makePitch(pl, { ...ch, rel, compensate: true }), t: G.time + 0.07 }; netSendPitch(G.pending.pi);
  IN.down = false; IN.id = null; P.st.thr = 0; P.st.u0 = P.st.u || 0; G.state = 'throw'; G.pitches++; $('vbtns').classList.add('hide');
  showCall('時間切れ', 'CPU が代わりに投げました'); setHint('');
}
// 試合中に毎回よぶ：投げる番の残り時間・待っている時間
function netStep(h) {
  const on = G.match.on; if (on.gone || G.state === 'over') return;
  if (G.mode === 'pitch' && G.state === 'aim') { G.aimT += h; const left = CONFIG.netAimMax - G.aimT; if (left < 10 && !DEMO.on) setHint(`あと ${Math.max(0, Math.ceil(left))} 秒で 自動で投げます`); if (left <= 0) netAutoPitch(); }
  if (G.mode === 'bat' && G.state === 'cpuwind') {
    if (!on.inbox.p[PN(G.pn + 1)]) { G.waitT += h; if (G.waitT > 1.2 && $('hint').textContent !== 'あいてが投げるのを 待っています…') setHint('あいてが投げるのを 待っています…'); if (G.waitT > CONFIG.netAimMax + CONFIG.netGone) setGone('あいてが 投げてきません'); }
    else if (G.waitT > 1.2) { G.waitT = 0; setHint(''); }
  }
  if (G.state === 'rres' || G.netHolding) { G.waitT += h; if (G.waitT > CONFIG.netGone + 5) setGone('あいてと つながらなくなりました'); }
}
// 試合が終わった：つないだままにして「もう一度 対戦する」を待つ（部屋を閉じるのは 出ていく時）
function netMatchDone() { emoClose(); $('emoB').classList.add('hide'); setHint(''); updOnBar(); }
function netEnd() { const on = ONL.on; if (!on) return; netStop(); if (on.link) on.link.close(); on.net.end().catch(() => { }); ONL.on = null; ONL.link = null; }
function netLeave() {
  const on = ONL.on; if (!on) return;
  if (!on.gone && !on.left) on.link.send('bye', 0, null).catch(() => { });
  on.gone = true; netEnd();
}
addEventListener('pagehide', () => { const on = ONL.on; if (on && !on.gone && !on.left) { try { on.link.send('bye', 0, null); } catch (e) { } } });

// --- スタンプ（かけ声）
const EMOTES = ['ナイス！', 'おしい！', 'どんまい', 'やったー！', 'よろしく！', 'ありがとう！'];
function emoBuild() { $('emoT').innerHTML = EMOTES.map((t, i) => `<button data-i="${i}">${esc(t)}</button>`).join(''); for (const b of $('emoT').children) b.onclick = () => emoSend(+b.dataset.i); }
function emoOpen() { const t = $('emoT'); if (t.classList.contains('hide')) { emoBuild(); t.classList.remove('hide'); } else t.classList.add('hide'); }
function emoClose() { $('emoT').classList.add('hide'); }
function emoSend(i) {
  emoClose(); const on = ONL.on; if (!on || on.gone || !EMOTES[i]) return;
  const now = performance.now(); on.emT = on.emT.filter(t => now - t < 30000);
  if (on.emT.length >= 6 || (on.emT.length && now - on.emT[on.emT.length - 1] < CONFIG.emoGap * 1000)) { toast('少し待ってから送ってね'); return; }
  on.emT.push(now); AU.ui(); netTell('em', { i, n: ++on.emN }); emoShow(myName(), EMOTES[i], true);
}
function netEmoGot(on, d) {
  const i = d.i | 0, n = d.n | 0; if (!EMOTES[i] || on.emSeen[n]) return; on.emSeen[n] = 1;
  emoShow(on.oppName, EMOTES[i], false); AU.ui();
}
function emoShow(who, txt, mine) {
  const z = $('emoS'), e = document.createElement('div'); e.className = mine ? 'me' : '';
  e.textContent = who + '：' + txt; z.appendChild(e);
  setTimeout(() => e.remove(), 2400); while (z.children.length > 3) z.firstChild.remove();
}

// --- もう一度 対戦する（同じ相手と、つないだまま）
function netAskRematch() {
  const on = ONL.on; if (!on) return openOnline();
  if (on.left || on.gone) { netEnd(); return openOnline(); }
  on.rmMe = true; netTell('rm', { g: on.gameNo + 1 }); netRematchUI(); netTryRematch();
}
function netTryRematch() {
  const on = ONL.on; if (!on || !on.rmMe || !on.rmOpp) return;
  on.inbox = { p: {}, x: {}, r: {}, c: {} }; on.cs = {}; on.emSeen = {}; on.emN = 0;
  on.gameNo++; on.rmMe = false; on.rmOpp = false; on.meHome = !on.meHome; on.heard = performance.now();
  ONL.late = null; G.resShown = false; $('res').classList.add('hide');
  OPP_TEAM.name = OPP_TEAM.short = on.oppName;
  startMatch(0, null, on);
}
function netRematchUI() {
  const on = ONL.on, b = $('bRm'); if (!b || !on) return;
  if (on.left || on.gone) { b.textContent = 'ほかの人と対戦する'; b.classList.remove('load'); return; }
  if (on.rmMe && !on.rmOpp) { b.textContent = '相手の返事を待っています'; b.classList.add('load'); }
  else if (on.rmOpp && !on.rmMe) { b.textContent = '相手が「もう一度」と言っています！'; b.classList.remove('load'); }
  else { b.textContent = 'もう一度 対戦する'; b.classList.remove('load'); }
}
function showOnResult(M) {
  const on = M.on, t = $('resT'), b = $('resBtns');
  if (M.win) on.wins.me++; else on.wins.opp++;
  $('resRd').textContent = `オンライン対戦　vs ${on.oppName}` + (on.gameNo > 1 ? `　（${on.gameNo}試合目　${on.wins.me}勝${on.wins.opp}敗）` : '');
  t.textContent = M.win ? '勝ち！' : '負け…'; t.className = M.win ? 'win' : 'lose';
  $('resSub').textContent = (G.walkoff ? (M.win ? 'サヨナラ勝ち！　' : 'サヨナラ負け…　') : '') + (on.gone ? '（とちゅうから CPU が相手の代わりをしました）' : on.left ? '（相手は帰りました）' : '');
  $('line').innerHTML = lineHTML(); showStats(); b.innerHTML = '';
  const add = (txt, cls, fn, id) => { const e = document.createElement('button'); e.className = 'btn ' + cls; e.textContent = txt; if (id) e.id = id; e.onclick = () => { AU.ui(); fn(); }; b.appendChild(e); };
  add('もう一度 対戦する', 'blue', netAskRematch, 'bRm');
  const row = document.createElement('div'); row.className = 'row'; b.appendChild(row);
  const add2 = (txt, fn) => { const e = document.createElement('button'); e.className = 'btn sub sm'; e.textContent = txt; e.onclick = () => { AU.ui(); fn(); }; row.appendChild(e); };
  add2('結果をシェア', () => shareResult(`vs ${on.oppName}`));
  add2('タイトルへ', () => { netLeave(); toTitle(); });
  netRematchUI(); updOnBar();
  $('res').classList.remove('hide'); showAd('ad2');
}

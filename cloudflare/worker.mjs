// Cloudflare Worker — Stellaflix 灯塔模式边缘 (Phase 2)
// 部署：wrangler deploy（见同目录 wrangler.toml）。路由见文档 §7.1。
//
// 设计要点：
//  - 单一 Durable Object 实例（id="root"）聚合全部 beacons / rooms / signals，
//    以便 GET /beacons 一次性返回在线 + 幽灵灯（早期规模可接受）；
//  - Worker 主 fetch 做安全前置（Turnstile + HMAC）+ 限流 + 提取 request.cf 地理；
//  - DO 内做 TTL 清理（心跳超时→GHOST、GHOST 24h 删除、signal 5min）+ alarm 兜底。
//
// 纯逻辑函数（verifySig / isBeaconStale / isGhostExpired / beaconToGhost 等）
// 通过 export 暴露，供 Node 测试（crypto.subtle / TextEncoder 在 Node 18+ 全局可用）。

export const BEACON_OFFLINE_MS = 60_000;      // 心跳超时 → 转 GHOST
export const GHOST_TTL_MS = 24 * 3600_000;    // 幽灵灯 24h 后删除
export const SIGNAL_TTL_MS = 5 * 60_000;      // 信令 TTL
export const RATE = { beacon: 2000, join: 3000, room: 5000 }; // 限流窗口(ms)

export function beaconToGhost(b) {
  return Object.assign({}, b, { state: 'GHOST', isGhost: true });
}
export function isBeaconStale(b, now) {
  return (now - (b.lastSeen || 0)) > BEACON_OFFLINE_MS;
}
export function isGhostExpired(b, now) {
  return (now - (b.lastSeen || 0)) > GHOST_TTL_MS;
}

// 隐私过滤：isPublic===false 的信标不进入公开发现层（§4 / Phase 4 #3）
export function filterPublicBeacons(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(function (b) { return b.isPublic !== false; });
}

export async function verifySig(deviceId, nonce, sig, secret) {
  if (!secret) return true;            // 未配置 secret → 跳过（开发态）
  if (!sig) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(deviceId + ':' + nonce));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === sig;
}

export async function verifyTurnstile(token, secret, ip) {
  if (!secret) return true;            // 未配置 → 跳过（开发态）
  if (!token) return false;
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}&remoteip=${encodeURIComponent(ip || '')}`
  });
  const j = await r.json().catch(() => ({}));
  return !!j.success;
}

// ---------------- Durable Object ----------------
export class Lighthouse {
  constructor(state, env) { this.state = state; this.env = env; this._peers = {}; }

  // ---------------- 信令 WS（Phase 3）：/signal/:code ----------------
  // 单房间内对等中继；仅转发 SDP/ICE（信令），媒体不经本通道（§6.0 硬约束）。
  // 活跃 WebSocket 持有在实例内存（不可序列化，不落 storage），符合 DO 单实例语义。
  async _handleSignalWS(request, url) {
    const code = (url.pathname.split('/')[2] || '').toUpperCase();
    if (!code) return new Response('bad code', { status: 400 });
    let pair;
    try { pair = new WebSocketPair(); } catch (e) { return new Response('ws unsupported', { status: 500 }); }
    const client = pair[0], server = pair[1];
    const deviceId = request.headers.get('x-device-id') || '';
    if (!this._peers[code]) this._peers[code] = {};
    const self = this;

    server.addEventListener('message', (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      self._onSignalMessage(code, deviceId, m);
    });
    server.addEventListener('close', () => { self._detachPeer(code, deviceId); });
    server.addEventListener('error', () => { self._detachPeer(code, deviceId); });
    server.accept();
    this._peers[code][deviceId] = { ws: server, role: null };
    return new Response(null, { status: 101, webSocket: client });
  }

  _wsSend(peerObj, obj) {
    if (peerObj && peerObj.ws && peerObj.ws.readyState === 1) {
      try { peerObj.ws.send(JSON.stringify(obj)); return true; } catch (e) {}
    }
    return false;
  }
  _broadcastPeers(code, excludeId, obj) {
    const peers = this._peers[code] || {};
    Object.keys(peers).forEach((id) => { if (id !== excludeId) this._wsSend(peers[id], obj); });
  }
  _detachPeer(code, deviceId) {
    if (!this._peers[code]) return;
    if (this._peers[code][deviceId]) {
      delete this._peers[code][deviceId];
      this._broadcastPeers(code, deviceId, { type: 'peer-leave', from: deviceId });
    }
    if (Object.keys(this._peers[code]).length === 0) delete this._peers[code];
  }
  _onSignalMessage(code, deviceId, m) {
    const peers = this._peers[code] || {};
    if (m.type === 'identify') {
      if (peers[deviceId]) peers[deviceId].role = m.role;
      const list = Object.keys(peers).filter((id) => id !== deviceId)
        .map((id) => ({ from: id, role: peers[id].role }));
      this._wsSend(peers[deviceId], { type: 'peer-list', peers: list });
      this._broadcastPeers(code, deviceId, { type: 'peer-enter', from: deviceId, role: m.role });
      return;
    }
    if (m.type === 'signal') {
      const target = peers[m.to];
      if (target) this._wsSend(target, { type: 'signal', from: deviceId, payload: m.payload });
      return;
    }
    if (m.type === 'leave') { this._detachPeer(code, deviceId); }
  }

  async _load() {
    const d = await this.state.storage.list();
    const beacons = {}, rooms = {}, signals = {};
    d.forEach((v, k) => {
      if (k.startsWith('b:')) beacons[k.slice(2)] = v;
      else if (k.startsWith('r:')) rooms[k.slice(2)] = v;
      else if (k.startsWith('s:')) signals[k.slice(2)] = v;
    });
    return { beacons, rooms, signals };
  }

  async _saveAll(mem) {
    const entries = {};
    Object.keys(mem.beacons).forEach((id) => { entries['b:' + id] = mem.beacons[id]; });
    Object.keys(mem.rooms).forEach((id) => { entries['r:' + id] = mem.rooms[id]; });
    Object.keys(mem.signals).forEach((id) => { entries['s:' + id] = mem.signals[id]; });
    await this.state.storage.put(entries);
  }

  async _rateLimit(deviceId, action, windowMs) {
    const key = 'rl:' + (deviceId || 'anon') + ':' + action;
    const last = await this.state.storage.get(key);
    const now = Date.now();
    if (last && now - last < windowMs) return false;
    await this.state.storage.put(key, now);
    return true;
  }

  async _cleanup(mem, now) {
    Object.keys(mem.beacons).forEach((id) => {
      const b = mem.beacons[id];
      if (b.state !== 'GHOST' && isBeaconStale(b, now)) mem.beacons[id] = beaconToGhost(b);
      if (isGhostExpired(b, now)) delete mem.beacons[id];
    });
    Object.keys(mem.signals).forEach((id) => {
      if (now - (mem.signals[id].ts || 0) > SIGNAL_TTL_MS) delete mem.signals[id];
    });
  }

  async alarm() {
    const mem = await this._load();
    await this._cleanup(mem, Date.now());
    await this._saveAll(mem);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('upgrade') === 'websocket') {
      return this._handleSignalWS(request, url);
    }
    const mem = await this._load();
    const now = Date.now();
    await this._cleanup(mem, now);
    const p = url.pathname;
    const deviceId = request.headers.get('x-device-id') || '';
    const geoHdr = request.headers.get('x-cf-geo') || '';
    let geo = null; try { geo = geoHdr ? JSON.parse(geoHdr) : null; } catch (e) { geo = null; }

    if (request.method === 'POST' && p === '/beacon') {
      if (!(await this._rateLimit(deviceId, 'beacon', RATE.beacon))) return json({ ok: false, reason: 'rate-limited' }, 429);
      const auth = await request.json().catch(() => ({}));
      const pl = auth.payload || {};
      const b = Object.assign({}, pl, {
        id: auth.deviceId || deviceId,
        lastSeen: now,
        state: pl.state || 'IDLE',
        country: geo && geo.country || pl.country || '',
        city: geo && geo.city || pl.city || ''
      });
      mem.beacons[b.id] = b;
      await this._saveAll(mem);
      await this.state.storage.setAlarm(now + BEACON_OFFLINE_MS + 2000);
      return json({ ok: true, geo: geo });
    }

    if (request.method === 'GET' && p === '/beacons') {
      const online = [], ghosts = [];
      Object.keys(mem.beacons).forEach((id) => {
        const b = mem.beacons[id];
        (b.state === 'GHOST' ? ghosts : online).push(b);
      });
      return json({ online: filterPublicBeacons(online), ghosts: filterPublicBeacons(ghosts) });
    }

    if (request.method === 'DELETE' && p === '/beacon') {
      delete mem.beacons[deviceId];           // 他人节点：签名 deviceId 不匹配已被 Worker 层拒绝
      await this._saveAll(mem);
      return json({ ok: true });
    }

    if (request.method === 'POST' && p === '/room') {
      if (!(await this._rateLimit(deviceId, 'room', RATE.room))) return json({ ok: false, reason: 'rate-limited' }, 429);
      const auth = await request.json().catch(() => ({}));
      const code = auth.code;
      if (mem.rooms[code]) return json({ ok: false, reason: 'exists' }, 409);
      mem.rooms[code] = { code: code, host: deviceId, discovery: auth.discovery || null, members: [], full: false, createdAt: now };
      await this._saveAll(mem);
      return json({ ok: true, code: code });
    }

    if (request.method === 'GET' && p.startsWith('/room/')) {
      const code = p.slice(6);
      const room = mem.rooms[code];
      if (!room) return json({ exists: false }, 404);
      return json({ exists: true, code: code, discovery: room.discovery, full: room.full, members: room.members });
    }

    if (request.method === 'POST' && /\/room\/[^\/]+\/join$/.test(p)) {
      if (!(await this._rateLimit(deviceId, 'join', RATE.join))) return json({ ok: false, reason: 'rate-limited' }, 429);
      const code = p.split('/')[2];
      const auth = await request.json().catch(() => ({}));
      const room = mem.rooms[code];
      if (!room) return json({ ok: false, reason: 'not-found' }, 404);
      if (room.full) return json({ ok: false, reason: 'full' }, 409);
      const gid = auth.guest && auth.guest.deviceId;
      room.members.push({ id: gid, nickname: (auth.guest && auth.guest.nickname) || '匿名', status: 'pending' });
      if (room.members.length >= 4) room.full = true;   // maxViewers = 4（§二）
      await this._saveAll(mem);
      return json({ ok: true, pending: true });
    }

    const m = p.match(/\/room\/([^\/]+)\/(accept|reject)$/);
    if (m && request.method === 'POST') {
      const code = m[1], decision = m[2];
      const auth = await request.json().catch(() => ({}));
      const room = mem.rooms[code];
      if (!room) return json({ ok: false, reason: 'not-found' }, 404);
      const mem2 = room.members.find((x) => x.id === auth.guestId);
      if (mem2) mem2.status = decision === 'accept' ? 'accepted' : 'rejected';
      await this._saveAll(mem);
      return json({ ok: true, decision: decision });
    }

    if (request.method === 'DELETE' && p.startsWith('/room/')) {
      delete mem.rooms[p.slice(6)];
      await this._saveAll(mem);
      return json({ ok: true });
    }

    return json({ ok: false, reason: 'no-route' }, 404);
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
  });
}

// ---------------- Worker 主 fetch：安全前置 + 限流 + 地理转发 ----------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;
    const isWrite = request.method === 'POST' || request.method === 'DELETE';
    const deviceId = request.headers.get('x-device-id') || '';
    const ip = request.headers.get('cf-connecting-ip') || '';

    if (isWrite) {
      const nonce = request.headers.get('x-nonce') || '';
      const sig = request.headers.get('x-sig') || '';
      const turn = request.headers.get('x-turnstile') || '';
      if (!(await verifySig(deviceId, nonce, sig, env.HMAC_SECRET))) return json({ ok: false, reason: 'bad-sig' }, 403);
      if (!(await verifyTurnstile(turn, env.TURNSTILE_SECRET, ip))) return json({ ok: false, reason: 'bad-turnstile' }, 403);
    }

    // 提取 request.cf 地理，透传给 DO（DO 写 beacon 时附加，并回传客户端缓存）
    let cfGeo = '';
    if (request.cf) {
      cfGeo = JSON.stringify({
        country: request.cf.country || '',
        region: request.cf.region || '',
        city: request.cf.city || '',
        lat: request.cf.latitude || 0,
        lng: request.cf.longitude || 0
      });
    }
    const fwd = cfGeo ? new Request(request, { headers: { 'x-cf-geo': cfGeo } }) : request;

    const id = env.Lighthouse.idFromName('root');
    const obj = env.Lighthouse.get(id);
    return obj.fetch(fwd);
  }
};

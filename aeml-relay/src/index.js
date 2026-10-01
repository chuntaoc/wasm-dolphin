/* =====================================================================
 * AEML Wii relay -- (c) AEML, NTUST
 * One Durable Object per pairing code ("room"). The emulator page joins
 * as host, phones join as pads; messages are forwarded pad <-> host.
 *   wss://<worker>/ws?room=ABC123&role=host|pad
 * SPDX-License-Identifier: GPL-2.0-or-later
 * ===================================================================== */
const ROOM_RE = /^[A-Z0-9]{6}$/;
const MAX_MSG = 4096;          // bytes; controller packets are ~300
const MAX_PADS = 4;

function originAllowed(origin, list) {
  if (!origin) return false;
  return list.split(',').map((s) => s.trim()).filter(Boolean).some((p) => {
    if (p === '*') return true;
    if (p.includes('*')) {
      const re = new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+(?:\\.[a-z0-9-]+)*') + '$', 'i');
      return re.test(origin);
    }
    return p.toLowerCase() === origin.toLowerCase();
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('AEML Wii relay OK (AEML, NTUST)\n', { headers: { 'content-type': 'text/plain' } });
    }
    if (url.pathname !== '/ws') return new Response('not found', { status: 404 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const room = (url.searchParams.get('room') || '').toUpperCase();
    const role = url.searchParams.get('role');
    if (!ROOM_RE.test(room) || (role !== 'host' && role !== 'pad')) return new Response('bad request', { status: 400 });
    if (!originAllowed(req.headers.get('Origin'), env.ALLOWED_ORIGINS || '')) return new Response('origin not allowed', { status: 403 });
    const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
    return stub.fetch(req);
  }
};

export class Room {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async fetch(req) {
    const url = new URL(req.url);
    const role = url.searchParams.get('role');
    const pads = this.ctx.getWebSockets('pad');
    if (role === 'pad' && pads.length >= MAX_PADS) return new Response('room full', { status: 429 });
    if (role === 'host') {
      // a newer emulator page replaces the old one for this code
      for (const ws of this.ctx.getWebSockets('host')) { try { ws.close(4000, 'replaced'); } catch (e) {} }
    }
    const pair = new WebSocketPair();
    const id = role === 'pad' ? 'p' + crypto.randomUUID().slice(0, 8) : 'host';
    this.ctx.acceptWebSocket(pair[1], [role, id]);
    pair[1].serializeAttachment({ role, id });
    const hostUp = this.ctx.getWebSockets('host').length > 0;
    pair[1].send(JSON.stringify({ t: 'hello', you: id, host: hostUp, pads: this.ctx.getWebSockets('pad').length }));
    if (role === 'pad') this.toHost({ t: 'join', from: id });
    if (role === 'host') this.toPads({ t: 'host', up: true });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  toHost(obj) { const s = JSON.stringify(obj); for (const ws of this.ctx.getWebSockets('host')) { try { ws.send(s); } catch (e) {} } }
  toPads(obj, only) {
    const s = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets(only || 'pad')) { try { ws.send(s); } catch (e) {} }
  }

  async webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > MAX_MSG) return;
    const me = ws.deserializeAttachment() || {};
    if (msg === 'ping') { ws.send('pong'); return; }
    let d; try { d = JSON.parse(msg); } catch (e) { return; }
    if (me.role === 'pad') {
      this.toHost({ t: 'data', from: me.id, d });
    } else if (me.role === 'host') {
      // host -> one pad (to) or all pads
      this.toPads({ t: 'data', from: 'host', d: d.d }, d.to || undefined);
    }
  }

  async webSocketClose(ws) {
    const me = ws.deserializeAttachment() || {};
    if (me.role === 'pad') this.toHost({ t: 'leave', from: me.id });
    if (me.role === 'host') this.toPads({ t: 'host', up: false });
  }
  async webSocketError(ws) { return this.webSocketClose(ws); }
}

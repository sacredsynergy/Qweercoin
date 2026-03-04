'use strict';

const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const fs        = require('fs');
const http      = require('http');

const app = express();
const PORT      = 3000;
const RPC_HOST  = '127.0.0.1';
const RPC_PORT  = 9332;
const COOKIE_PATH = '/root/.qweercoin/.cookie';
const MAX_RAWTX_BYTES = 100000; // 100 KB hard cap

// ── Rate limiting ─────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute window
  max: 30,               // 30 requests per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
});
app.use('/api/', limiter);

// ── CORS ─────────────────────────────────────────────────────────────
app.use(cors({
  origin: ['https://qweercoin.com', 'http://qweercoin.com'],
  methods: ['GET', 'POST'],
}));

app.use(express.json({ limit: '200kb' }));

// ── Security headers ──────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// ── RPC client ───────────────────────────────────────────────────────
// Cache cookie in memory; re-read only if stale (5 min TTL)
let _cookie = null;
let _cookieTs = 0;
function readCookie() {
  if (Date.now() - _cookieTs < 300000 && _cookie) return _cookie;
  const raw = fs.readFileSync(COOKIE_PATH, 'utf8').trim();
  const colon = raw.indexOf(':');
  _cookie = { user: raw.slice(0, colon), pass: raw.slice(colon + 1) };
  _cookieTs = Date.now();
  return _cookie;
}

function rpc(method, params = []) {
  return new Promise((resolve, reject) => {
    const { user, pass } = readCookie();
    const auth = Buffer.from(`${user}:${pass}`).toString('base64');
    const body = JSON.stringify({ jsonrpc: '1.0', id: 'qwr-api', method, params });

    const req = http.request(
      {
        host: RPC_HOST,
        port: RPC_PORT,
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) reject(new Error(json.error.message));
            else resolve(json.result);
          } catch {
            reject(new Error('Invalid RPC response'));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('RPC timeout')); });
    req.write(body);
    req.end();
  });
}

// Serialise scantxoutset calls so only one runs at a time
let _scanQueue = Promise.resolve();
function rpcScan(address) {
  _scanQueue = _scanQueue
    .catch(() => {})  // Reset queue after any failure so it doesn't stay broken
    .then(() => rpc('scantxoutset', ['start', [`addr(${address})`]]));
  return _scanQueue;
}

// ── Validation ───────────────────────────────────────────────────────
// Base58 alphabet for QWR (same as Bitcoin)
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function isValidAddress(addr) {
  if (typeof addr !== 'string') return false;
  if (!/^Q[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(addr)) return false;
  // Verify all chars are valid base58
  return [...addr].every(c => B58.includes(c));
}

function toSatoshis(amount) {
  return Math.round(Number(amount) * 1e8);
}

// Strip sensitive detail from RPC errors before forwarding to client
function safeError(err) {
  const msg = err.message || 'Unknown error';
  // Don't forward raw RPC internals
  if (msg.includes('RPC_') || msg.includes('internal') || msg.length > 200) {
    return 'Node error. Please try again.';
  }
  return msg;
}

// ── Routes ───────────────────────────────────────────────────────────

app.get('/api/balance/:address', async (req, res) => {
  const { address } = req.params;
  if (!isValidAddress(address)) return res.status(400).json({ error: 'Invalid address' });
  try {
    const result = await rpcScan(address);
    if (!result.success) return res.status(500).json({ error: 'Scan failed' });
    res.json({
      address,
      balance: result.total_amount,
      satoshis: toSatoshis(result.total_amount),
      unspentCount: result.unspents.length,
    });
  } catch (err) {
    console.error('balance error:', err.message);
    res.status(500).json({ error: safeError(err) });
  }
});

app.get('/api/utxos/:address', async (req, res) => {
  const { address } = req.params;
  if (!isValidAddress(address)) return res.status(400).json({ error: 'Invalid address' });
  try {
    const result = await rpcScan(address);
    if (!result.success) return res.status(500).json({ error: 'Scan failed' });
    const utxos = result.unspents.map(u => ({
      txid:        u.txid,
      vout:        u.vout,
      scriptPubKey: u.scriptPubKey,
      satoshis:    toSatoshis(u.amount),
      amount:      u.amount,
      height:      u.height,
    }));
    res.json(utxos);
  } catch (err) {
    console.error('utxos error:', err.message);
    res.status(500).json({ error: safeError(err) });
  }
});

app.post('/api/broadcast', async (req, res) => {
  const { rawtx } = req.body;
  if (!rawtx || typeof rawtx !== 'string') {
    return res.status(400).json({ error: 'Missing rawtx' });
  }
  if (!/^[0-9a-fA-F]+$/.test(rawtx)) {
    return res.status(400).json({ error: 'rawtx must be hex' });
  }
  if (rawtx.length > MAX_RAWTX_BYTES * 2) {
    return res.status(400).json({ error: 'rawtx too large' });
  }
  try {
    const txid = await rpc('sendrawtransaction', [rawtx]);
    res.json({ txid });
  } catch (err) {
    console.error('broadcast error:', err.message);
    res.status(500).json({ error: safeError(err) });
  }
});

app.get('/api/transactions/:address', async (req, res) => {
  const { address } = req.params;
  if (!isValidAddress(address)) return res.status(400).json({ error: 'Invalid address' });
  try {
    const result = await rpcScan(address);
    if (!result.success) return res.status(500).json({ error: 'Scan failed' });
    const seen = new Map();
    for (const u of result.unspents) {
      if (!seen.has(u.txid)) {
        seen.set(u.txid, {
          txid:     u.txid,
          type:     'received',
          amount:   u.amount,
          satoshis: toSatoshis(u.amount),
          height:   u.height,
          status:   u.height > 0 ? 'confirmed' : 'pending',
        });
      } else {
        seen.get(u.txid).satoshis += toSatoshis(u.amount);
        seen.get(u.txid).amount   += u.amount;
      }
    }
    res.json([...seen.values()].sort((a, b) => b.height - a.height));
  } catch (err) {
    console.error('transactions error:', err.message);
    res.status(500).json({ error: safeError(err) });
  }
});

app.get('/api/status', async (req, res) => {
  try {
    const info = await rpc('getblockchaininfo');
    res.json({ ok: true, blocks: info.blocks, chain: info.chain });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Node unreachable' });
  }
});

// ── Start ─────────────────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  console.log(`QWR API listening on 127.0.0.1:${PORT}`);
});

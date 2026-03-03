'use strict';

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const http    = require('http');

const app = express();
const PORT = 3000;
const RPC_HOST = '127.0.0.1';
const RPC_PORT = 9332;
const COOKIE_PATH = '/root/.qweercoin/.cookie';

// ── CORS ─────────────────────────────────────────────────────────────
app.use(cors({
  origin: ['https://qweercoin.com', 'http://localhost:8080'],
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// ── RPC client ───────────────────────────────────────────────────────
function readCookie() {
  const raw = fs.readFileSync(COOKIE_PATH, 'utf8').trim();
  const colon = raw.indexOf(':');
  return {
    user: raw.slice(0, colon),
    pass: raw.slice(colon + 1),
  };
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
          } catch (e) {
            reject(new Error('Invalid RPC response'));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('RPC timeout'));
    });
    req.write(body);
    req.end();
  });
}

// Validate a QWR address (basic: starts with Q, right length)
function isValidAddress(addr) {
  return /^Q[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(addr);
}

// Safe amount: floating-point QWR → integer satoshis
function toSatoshis(amount) {
  return Math.round(Number(amount) * 1e8);
}

// ── Routes ───────────────────────────────────────────────────────────

// GET /api/balance/:address
app.get('/api/balance/:address', async (req, res) => {
  const { address } = req.params;
  if (!isValidAddress(address)) return res.status(400).json({ error: 'Invalid address' });
  try {
    const result = await rpc('scantxoutset', ['start', [`addr(${address})`]]);
    if (!result.success) return res.status(500).json({ error: 'Scan failed' });
    res.json({
      address,
      balance: result.total_amount,
      satoshis: toSatoshis(result.total_amount),
      unspentCount: result.unspents.length,
    });
  } catch (err) {
    console.error('balance error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/utxos/:address
app.get('/api/utxos/:address', async (req, res) => {
  const { address } = req.params;
  if (!isValidAddress(address)) return res.status(400).json({ error: 'Invalid address' });
  try {
    const result = await rpc('scantxoutset', ['start', [`addr(${address})`]]);
    if (!result.success) return res.status(500).json({ error: 'Scan failed' });
    const utxos = result.unspents.map(u => ({
      txid: u.txid,
      vout: u.vout,
      scriptPubKey: u.scriptPubKey,
      satoshis: toSatoshis(u.amount),
      amount: u.amount,
      height: u.height,
    }));
    res.json(utxos);
  } catch (err) {
    console.error('utxos error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/broadcast  body: { rawtx: "hex" }
app.post('/api/broadcast', async (req, res) => {
  const { rawtx } = req.body;
  if (!rawtx || typeof rawtx !== 'string' || !/^[0-9a-fA-F]+$/.test(rawtx)) {
    return res.status(400).json({ error: 'Invalid rawtx' });
  }
  try {
    const txid = await rpc('sendrawtransaction', [rawtx]);
    res.json({ txid });
  } catch (err) {
    console.error('broadcast error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/transactions/:address
// Returns received UTXOs as transaction records (MVP: unspent only)
app.get('/api/transactions/:address', async (req, res) => {
  const { address } = req.params;
  if (!isValidAddress(address)) return res.status(400).json({ error: 'Invalid address' });
  try {
    const result = await rpc('scantxoutset', ['start', [`addr(${address})`]]);
    if (!result.success) return res.status(500).json({ error: 'Scan failed' });
    const txs = result.unspents.map(u => ({
      txid: u.txid,
      vout: u.vout,
      type: 'received',
      amount: u.amount,
      satoshis: toSatoshis(u.amount),
      height: u.height,
      status: u.height > 0 ? 'confirmed' : 'pending',
    }));
    // Deduplicate by txid (multiple UTXOs from same tx → one record)
    const seen = new Map();
    for (const tx of txs) {
      if (!seen.has(tx.txid)) {
        seen.set(tx.txid, { ...tx });
      } else {
        seen.get(tx.txid).satoshis += tx.satoshis;
        seen.get(tx.txid).amount += tx.amount;
      }
    }
    res.json([...seen.values()].sort((a, b) => b.height - a.height));
  } catch (err) {
    console.error('transactions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/status — health check
app.get('/api/status', async (req, res) => {
  try {
    const info = await rpc('getblockchaininfo');
    res.json({ ok: true, blocks: info.blocks, chain: info.chain });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  console.log(`QWR API listening on 127.0.0.1:${PORT}`);
});

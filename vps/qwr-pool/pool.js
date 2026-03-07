'use strict';

const net    = require('net');
const crypto = require('crypto');
const http   = require('http');

// ── Config ──────────────────────────────────────────────────────────────────
const STRATUM_PORT   = 3333;
const RPC_HOST       = '127.0.0.1';
const RPC_PORT       = 9332;
const RPC_USER       = 'qwrnode';
const RPC_PASS       = 'qwrminelocal9332';
const EN1_SIZE       = 4;   // extranonce1 bytes (server-assigned per miner)
const EN2_SIZE       = 4;   // extranonce2 bytes (miner-chosen)
const INIT_DIFF      = 0.0001;
const VARDIFF_TARGET = 15;  // seconds per share target
const VARDIFF_RETARGET = 90; // seconds between retargets
const POOL_ADDR      = 'QQx1wN5LVfGXmotsC8Tvgo8sQ582VYswcd'; // fallback

// ── RPC ─────────────────────────────────────────────────────────────────────
function rpc(method, params, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '1.0', id: 1, method, params });
    const auth = Buffer.from(`${RPC_USER}:${RPC_PASS}`).toString('base64');
    const req  = http.request({
      host: RPC_HOST, port: RPC_PORT, method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          j.error ? reject(new Error(j.error.message)) : resolve(j.result);
        } catch(e) { reject(e); }
      });
    });
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('RPC timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Crypto ───────────────────────────────────────────────────────────────────
const sha256  = b => crypto.createHash('sha256').update(b).digest();
const sha256d = b => sha256(sha256(b));

const hexToLE = hex => Buffer.from(hex, 'hex').reverse().toString('hex');

function varInt(n) {
  if (n < 0xfd) return Buffer.from([n]);
  const b = Buffer.allocUnsafe(3); b[0] = 0xfd; b.writeUInt16LE(n, 1); return b;
}

function packU32LE(n) { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(n >>> 0, 0); return b; }
function packI32LE(n) { const b = Buffer.allocUnsafe(4); b.writeInt32LE(n, 0); return b; }

// Encode block height for BIP34 coinbase scriptSig
function encodeHeight(h) {
  let hex = h.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  let buf = Buffer.from(hex, 'hex').reverse(); // little-endian
  if (buf[buf.length - 1] & 0x80) buf = Buffer.concat([buf, Buffer.from([0x00])]); // sign byte
  return Buffer.concat([Buffer.from([buf.length]), buf]);
}

// ── Base58Check → P2PKH script ───────────────────────────────────────────────
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function addrToScript(addr) {
  try {
    let n = 0n;
    for (const c of addr) { const i = B58.indexOf(c); if (i < 0) throw 0; n = n * 58n + BigInt(i); }
    const raw = Buffer.from(n.toString(16).padStart(50, '0'), 'hex'); // 25 bytes
    const hash = raw.slice(1, 21); // pubkeyHash
    return Buffer.concat([Buffer.from([0x76, 0xa9, 0x14]), hash, Buffer.from([0x88, 0xac])]);
  } catch(_) {
    return addrToScript(POOL_ADDR);
  }
}

// ── Merkle branch (stratum format) ───────────────────────────────────────────
// Returns array of hex strings (internal byte order) to combine with coinbase hash
function getMerkleBranch(txHashes) {
  if (!txHashes.length) return [];
  const PLACEHOLDER = Buffer.alloc(32);
  let level = [PLACEHOLDER, ...txHashes.map(h => Buffer.from(h, 'hex').reverse())];
  const branch = [];
  while (level.length > 1) {
    if (level.length % 2) level.push(level[level.length - 1]);
    branch.push(level[1].toString('hex'));
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i === 0 ? PLACEHOLDER : sha256d(Buffer.concat([level[i], level[i + 1]])));
    }
    level = next;
  }
  return branch;
}

// Apply branch to coinbase hash to get merkle root (internal byte order → LE hex for header)
function applyBranch(cbHash, branch) {
  let h = cbHash;
  for (const b of branch) h = sha256d(Buffer.concat([h, Buffer.from(b, 'hex')]));
  return h;
}

// ── Coinbase builder ─────────────────────────────────────────────────────────
function buildCoinbase(tmpl, en1Hex, en2Hex, minerAddr) {
  const heightPush  = encodeHeight(tmpl.height);
  const textBuf     = Buffer.from('/QWRPool/', 'ascii');
  const scriptSig   = Buffer.concat([heightPush, Buffer.from(en1Hex, 'hex'), Buffer.from(en2Hex, 'hex'), textBuf]);
  const outScript   = addrToScript(minerAddr);
  const valueBuf    = (() => { const b = Buffer.allocUnsafe(8); b.writeBigUInt64LE(BigInt(tmpl.coinbasevalue)); return b; })();

  // Witness commitment (segwit requirement)
  const commitment = tmpl.default_witness_commitment;
  const outCount   = commitment ? 2 : 1;

  const inputScript = Buffer.concat([varInt(scriptSig.length), scriptSig]);
  const outputs     = Buffer.concat([
    valueBuf, varInt(outScript.length), outScript,
    ...(commitment ? [Buffer.alloc(8), varInt(38), Buffer.from(commitment, 'hex')] : [])
  ]);

  // Split point: coinbase1 ends before en1, coinbase2 starts after en2
  const pre = Buffer.concat([
    packI32LE(1),          // version
    varInt(1),             // input count
    Buffer.alloc(32),      // prev txid (null)
    Buffer.from([0xff, 0xff, 0xff, 0xff]), // prev vout
    varInt(scriptSig.length),  // scriptSig total length varint
    heightPush,            // BIP34 height push — coinbase1 ends here
  ]);
  const post = Buffer.concat([
    textBuf,               // miner tag — coinbase2 starts here
    Buffer.from([0xff, 0xff, 0xff, 0xff]), // sequence
    varInt(outCount),      // output count
    outputs,
    packU32LE(0),          // locktime
  ]);

  const cb1 = pre.toString('hex');
  const cb2 = post.toString('hex');
  return { cb1, cb2 };
}

// Full coinbase tx for block submission
function coinbaseTx(tmpl, en1Hex, en2Hex, minerAddr) {
  const heightPush = encodeHeight(tmpl.height);
  const textBuf    = Buffer.from('/QWRPool/', 'ascii');
  const scriptSig  = Buffer.concat([heightPush, Buffer.from(en1Hex, 'hex'), Buffer.from(en2Hex, 'hex'), textBuf]);
  const outScript  = addrToScript(minerAddr);
  const valueBuf   = (() => { const b = Buffer.allocUnsafe(8); b.writeBigUInt64LE(BigInt(tmpl.coinbasevalue)); return b; })();
  const commitment = tmpl.default_witness_commitment;
  const outCount   = commitment ? 2 : 1;
  return Buffer.concat([
    packI32LE(1), varInt(1), Buffer.alloc(32), Buffer.from([0xff,0xff,0xff,0xff]),
    varInt(scriptSig.length), scriptSig, Buffer.from([0xff,0xff,0xff,0xff]),
    varInt(outCount), valueBuf, varInt(outScript.length), outScript,
    ...(commitment ? [Buffer.alloc(8), varInt(38), Buffer.from(commitment, 'hex')] : []),
    packU32LE(0),
  ]);
}

// ── Difficulty helpers ────────────────────────────────────────────────────────
const DIFF1 = BigInt('0x00000000ffff0000000000000000000000000000000000000000000000000000');
function diffToTarget(diff) { return DIFF1 / BigInt(Math.max(1, Math.round(diff * 65536))) * 65536n; }
function hashMeetsDiff(hashHex, diff) { return BigInt('0x' + hashHex) <= diffToTarget(diff); }

// ── Job manager ───────────────────────────────────────────────────────────────
let currentJob  = null;
let jobSeq      = 0;

async function fetchTemplate() {
  const tmpl  = await rpc('getblocktemplate', [{ rules: ['segwit', 'mweb'] }]);
  const jobId = (++jobSeq).toString(16).padStart(8, '0');
  const txHashes = tmpl.transactions.map(tx => tx.hash);
  const branch   = getMerkleBranch(txHashes);
  currentJob = { jobId, tmpl, branch, prevHash: tmpl.previousblockhash };
  console.log(`[JOB ${jobId}] height=${tmpl.height} txs=${tmpl.transactions.length}`);
  return currentJob;
}

function makeNotify(job, en1Hex, minerAddr, clean = false) {
  const { jobId, tmpl, branch } = job;
  const { cb1, cb2 } = buildCoinbase(tmpl, en1Hex, '0'.repeat(EN2_SIZE * 2), minerAddr);
  return {
    id: null, method: 'mining.notify',
    params: [
      jobId,
      hexToLE(tmpl.previousblockhash),
      cb1,
      cb2,
      branch,
      ('00000000' + tmpl.version.toString(16)).slice(-8),
      tmpl.bits,
      ('00000000' + tmpl.curtime.toString(16)).slice(-8),
      clean,
    ]
  };
}

// ── Block submission ──────────────────────────────────────────────────────────
async function submitBlock(job, en1Hex, en2Hex, ntimeHex, nonceHex, minerAddr) {
  const { tmpl, branch } = job;
  const cbTx   = coinbaseTx(tmpl, en1Hex, en2Hex, minerAddr);
  const cbHash = sha256d(cbTx);
  const mrRoot = applyBranch(cbHash, branch); // merkle root, internal byte order

  const header = Buffer.concat([
    packI32LE(tmpl.version),
    Buffer.from(hexToLE(tmpl.previousblockhash), 'hex'),
    mrRoot.reverse(),   // merkle root in LE
    Buffer.from(hexToLE(ntimeHex), 'hex'),
    Buffer.from(hexToLE(tmpl.bits), 'hex'),
    Buffer.from(hexToLE(nonceHex), 'hex'),
  ]);

  const txCount  = varInt(1 + tmpl.transactions.length);
  const blockHex = header.toString('hex') + txCount.toString('hex') + cbTx.toString('hex') +
                   tmpl.transactions.map(tx => tx.data).join('');

  const result = await rpc('submitblock', [blockHex]);
  return result; // null = accepted, string = rejected reason
}

// ── Stratum server ────────────────────────────────────────────────────────────
const clients = new Map();
let clientSeq = 0;

function send(client, msg) {
  try { client.socket.write(JSON.stringify(msg) + '\n'); } catch(_) {}
}
function result(client, id, val, err) { send(client, { id, result: val ?? null, error: err ?? null }); }
function notify(client, job, clean) { send(client, makeNotify(job, client.en1, client.address, clean)); }
function setDiff(client, d) { send(client, { id: null, method: 'mining.set_difficulty', params: [d] }); }

async function onMessage(c, msg) {
  const { id, method, params } = msg;
  switch (method) {

    case 'mining.subscribe': {
      result(c, id, [[['mining.notify', c.en1]], c.en1, EN2_SIZE]);
      if (currentJob) { setDiff(c, c.diff); notify(c, currentJob, true); }
      break;
    }

    case 'mining.authorize': {
      c.address = (params[0] || '').trim() || POOL_ADDR;
      c.authorized = true;
      result(c, id, true);
      console.log(`[AUTH] ${c.id} addr=${c.address}`);
      if (currentJob) { setDiff(c, c.diff); notify(c, currentJob, true); }
      break;
    }

    case 'mining.submit': {
      if (!c.authorized) { result(c, id, false, [24, 'Unauthorized']); return; }
      const [,jobId, en2Hex, ntimeHex, nonceHex] = params;
      if (!currentJob || currentJob.jobId !== jobId) { result(c, id, false, [21, 'Job not found']); return; }

      // Compute block hash to validate share difficulty
      const { tmpl, branch } = currentJob;
      const cbTx   = coinbaseTx(tmpl, c.en1, en2Hex, c.address);
      const cbHash = sha256d(cbTx);
      const mrRoot = applyBranch(cbHash, branch).reverse();

      const header = Buffer.concat([
        packI32LE(tmpl.version),
        Buffer.from(hexToLE(tmpl.previousblockhash), 'hex'),
        mrRoot,
        Buffer.from(hexToLE(ntimeHex), 'hex'),
        Buffer.from(hexToLE(tmpl.bits), 'hex'),
        Buffer.from(hexToLE(nonceHex), 'hex'),
      ]);

      const hashHex = sha256d(header).reverse().toString('hex');

      if (!hashMeetsDiff(hashHex, c.diff)) {
        result(c, id, false, [23, 'Low difficulty']); return;
      }

      result(c, id, true);
      c.shares++;
      console.log(`[SHARE] ${c.address} diff=${c.diff} hash=${hashHex.slice(0, 16)}...`);

      // varDiff
      varDiff(c);

      // Check vs network target
      if (!hashMeetsDiff(hashHex, diffFromBits(tmpl.bits))) return;

      // BLOCK FOUND!
      console.log(`\n★ BLOCK FOUND by ${c.address} ★\n`);
      try {
        const res = await submitBlock(currentJob, c.en1, en2Hex, ntimeHex, nonceHex, c.address);
        if (res === null || res === undefined) {
          console.log(`[BLOCK ACCEPTED] miner=${c.address}`);
          await fetchTemplate();
          broadcast(true);
        } else {
          console.log(`[BLOCK REJECTED] ${res}`);
        }
      } catch(e) { console.error('[BLOCK ERROR]', e.message); }
      break;
    }

    default: result(c, id, null, [20, 'Unknown method']);
  }
}

// Rough network difficulty from bits field
function diffFromBits(bitsHex) {
  const bits = parseInt(bitsHex, 16);
  const exp  = bits >> 24;
  const mant = bits & 0xffffff;
  const target = BigInt(mant) * (1n << (8n * BigInt(exp - 3)));
  return Number(DIFF1 / target);
}

// Simple varDiff
function varDiff(c) {
  const now = Date.now();
  if (!c.diffStart) { c.diffStart = now; c.diffShares = 0; return; }
  c.diffShares++;
  const elapsed = (now - c.diffStart) / 1000;
  if (elapsed < VARDIFF_RETARGET) return;
  const actual = elapsed / c.diffShares;
  if (actual < VARDIFF_TARGET * 0.5) {
    c.diff = Math.min(c.diff * 2, 1);
  } else if (actual > VARDIFF_TARGET * 2) {
    c.diff = Math.max(c.diff / 2, 0.00001);
  }
  c.diffStart = now; c.diffShares = 0;
  setDiff(c, c.diff);
}

function broadcast(clean) {
  if (!currentJob) return;
  clients.forEach(c => { if (c.authorized) notify(c, currentJob, clean); });
}

// Poll for new blocks every 2 seconds
setInterval(async () => {
  try {
    const tmpl = await rpc('getblocktemplate', [{ rules: ['segwit', 'mweb'] }], 5000);
    if (!currentJob || tmpl.previousblockhash !== currentJob.prevHash || tmpl.height !== currentJob.tmpl.height) {
      const txHashes = tmpl.transactions.map(tx => tx.hash);
      const branch   = getMerkleBranch(txHashes);
      const jobId    = (++jobSeq).toString(16).padStart(8, '0');
      currentJob     = { jobId, tmpl, branch, prevHash: tmpl.previousblockhash };
      console.log(`[JOB ${jobId}] height=${tmpl.height}`);
      broadcast(true);
    }
  } catch(_) {}
}, 2000);

// ── Start ─────────────────────────────────────────────────────────────────────
fetchTemplate().then(() => {
  net.createServer(socket => {
    const c = {
      id:         ++clientSeq,
      socket,
      authorized: false,
      en1:        crypto.randomBytes(EN1_SIZE).toString('hex'),
      address:    POOL_ADDR,
      diff:       INIT_DIFF,
      shares:     0,
      diffStart:  null,
      diffShares: 0,
    };
    clients.set(c.id, c);
    console.log(`[CONNECT] #${c.id} ${socket.remoteAddress}`);

    let buf = '';
    socket.on('data', data => {
      buf += data.toString();
      const lines = buf.split('\n'); buf = lines.pop();
      lines.forEach(line => {
        line = line.trim(); if (!line) return;
        try { onMessage(c, JSON.parse(line)); }
        catch(e) { console.error('[PARSE]', e.message); }
      });
    });
    socket.on('error', () => {});
    socket.on('close', () => { clients.delete(c.id); console.log(`[DISCONNECT] #${c.id}`); });
  }).listen(STRATUM_PORT, '0.0.0.0', () => {
    console.log(`\nQWR Stratum Pool\n  stratum+tcp://pool.qweercoin.com:3333\n  ${clients.size} miners connected\n`);
  });
}).catch(e => { console.error('Startup failed:', e); process.exit(1); });

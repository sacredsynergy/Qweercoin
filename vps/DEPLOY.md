# QWR API — VPS Deployment

VPS: 66.42.97.210

## 1. Install dependencies

```bash
apt update && apt install -y nodejs npm nginx certbot python3-certbot-nginx
```

## 2. Deploy API

```bash
mkdir -p /opt/qwr-api
cp index.js package.json /opt/qwr-api/
cd /opt/qwr-api && npm install --production
```

## 3. Systemd service

```bash
cp qwr-api.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable qwr-api
systemctl start qwr-api
systemctl status qwr-api
```

## 4. DNS

At Hosting Ireland, add an A record:
- Host: `api`
- Value: `66.42.97.210`
- TTL: 300

Wait a few minutes for propagation.

## 5. Nginx + TLS

```bash
cp nginx-api.conf /etc/nginx/sites-available/api.qweercoin.com
ln -s /etc/nginx/sites-available/api.qweercoin.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Get Let's Encrypt cert
certbot --nginx -d api.qweercoin.com
```

## 6. Verify

```bash
curl https://api.qweercoin.com/api/status
# → {"ok":true,"blocks":N,"chain":"main"}

curl https://api.qweercoin.com/api/balance/QYourAddressHere
# → {"address":"Q...","balance":0.0,"satoshis":0,"unspentCount":0}
```

## Node requirements

- qweercoind must be running with RPC on 127.0.0.1:9332
- Cookie file must exist at /root/.qweercoin/.cookie
- qweercoind must be fully synced

## Troubleshooting

```bash
journalctl -u qwr-api -f          # API logs
tail -f /root/.qweercoin/debug.log # Node logs
```

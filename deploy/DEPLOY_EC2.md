# Deploy Trade Alerts to AWS EC2 (minimal cost)

Single tiny box: nginx serves the Expo web build + reverse-proxies `/api` to
gunicorn (Flask). The price monitor runs as an in-process thread inside gunicorn
(1 worker). No RDS, no load balancer, no S3 — data lives in local files on EBS.

**Cost:** ~$0 for 12 months on free-tier `t3.micro`/`t4g.micro`, then ~$4-6/mo
(`t4g.nano` + 8 GB EBS). Elastic IP is free while attached.

---

## 1. Launch the instance
- AMI: Amazon Linux 2023 (or Ubuntu 22.04).
- Type: `t4g.micro` (Arm, free-tier eligible) or `t3.micro` (x86).
- Storage: 8 GB gp3 (default).
- Key pair: create/download for SSH.
- Security group inbound:
  - `22` (SSH) — your IP only
  - `80` (HTTP) — anywhere
  - `443` (HTTPS) — anywhere
- Allocate an **Elastic IP** and associate it (stable address, free while attached).

## 2. Build the web app locally
```powershell
cd mobile
# point the web build at your server (domain or http://ELASTIC_IP)
$env:EXPO_PUBLIC_API_URL = "http://YOUR_ELASTIC_IP"
npx expo export -p web        # outputs to mobile/dist
```
> Use `https://your-domain` instead once TLS is set up (step 6).

## 3. Upload files to the server
From the project root (adjust key/host):
```powershell
scp -i key.pem -r `
  app.py main.py monitor.py notifier.py price_fetcher.py excel_manager.py scheduler.py `
  check_watchlist.py requirements.txt config.json sectors.json templates deploy `
  ec2-user@YOUR_ELASTIC_IP:~/trade-alerts/

# web build -> ~/trade-alerts/web
scp -i key.pem -r mobile/dist/* ec2-user@YOUR_ELASTIC_IP:~/trade-alerts/web/
```
> `config.json` holds email/SMS secrets — it is gitignored, upload it manually.
> Never commit it.

## 4. One-time server setup
```bash
ssh -i key.pem ec2-user@YOUR_ELASTIC_IP
cd ~/trade-alerts
bash deploy/setup_ec2.sh      # installs python, nginx, certbot, venv + deps
```

## 5. Start services
```bash
# API + monitor (gunicorn, 1 worker)
sudo cp deploy/gunicorn.service /etc/systemd/system/gunicorn.service
sudo systemctl daemon-reload
sudo systemctl enable --now gunicorn
sudo systemctl status gunicorn        # verify running

# nginx site
sudo cp deploy/nginx.conf /etc/nginx/conf.d/trade-alerts.conf
sudo nginx -t && sudo systemctl reload nginx
```
Visit `http://YOUR_ELASTIC_IP` — app should load and hit `/api/*`.

> Do **not** also install `trade-alerts.service` (the standalone monitor).
> gunicorn already runs the monitor thread; running both = duplicate alerts.

## 6. Free TLS (optional but recommended)
Point a domain's A record at the Elastic IP, then:
```bash
sudo certbot --nginx -d your-domain.com
```
Rebuild the web app with `EXPO_PUBLIC_API_URL=https://your-domain.com` and
re-upload `mobile/dist/*` to `~/trade-alerts/web`.

---

## Updating later
```bash
# backend
scp changed .py files -> ~/trade-alerts/ ; sudo systemctl restart gunicorn
# frontend
rebuild locally -> scp mobile/dist/* -> ~/trade-alerts/web/   (no restart needed)
```

## Logs / ops
```bash
sudo systemctl status gunicorn
tail -f ~/trade-alerts/gunicorn_error.log
tail -f ~/trade-alerts/monitor.log        # monitor prints via gunicorn stdout/journal
journalctl -u gunicorn -f
```

## Cost trimming checklist
- 1 instance only, no ALB (nginx does routing).
- No RDS — file storage on EBS.
- Stop/start via AWS Instance Scheduler if you only need market hours.
- Twilio SMS is pay-per-use; keep `"sms": { "enabled": false }` unless needed.

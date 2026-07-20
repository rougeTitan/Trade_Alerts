# Trade Alerts — Terraform + one-shot deploy

Provisions a single low-cost EC2 box (Elastic IP, security group, auto-generated
SSH key) and deploys the Flask API + Expo web build behind nginx. No RDS, no load
balancer. ~$0 on free tier, ~$4-6/mo after.

## Prerequisites (on your machine)
- [Terraform](https://developer.hashicorp.com/terraform/downloads) >= 1.3
- AWS CLI configured: `aws configure` (needs EC2 / VPC / EIP permissions)
- OpenSSH (`ssh`, `scp`) — built into Windows 10+
- Node + `npx` (for the Expo web build)
- `config.json` present in the repo root (email/SMS secrets — gitignored)

## Configure
```powershell
cd deploy/terraform
Copy-Item terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: set region, and lock allowed_ssh_cidr to YOUR_IP/32
```

## Deploy (one command)
From the repo root:
```powershell
./deploy/deploy.ps1
# with a domain + free TLS (point DNS A record at the Elastic IP first):
./deploy/deploy.ps1 -Domain alerts.example.com
```
The script: `terraform apply` → builds web with `EXPO_PUBLIC_API_URL` → uploads
code + `config.json` + web build → installs venv/deps → starts gunicorn + nginx →
smoke-tests `/api/alerts` → prints the live URL.

## What gets created
- 1x EC2 (`t4g.micro` default, Arm/free-tier), 8 GB gp3
- Elastic IP (stable address)
- Security group: 22 (your CIDR), 80, 443
- Auto-generated key pair; private key saved to `deploy/terraform/trade-alerts-key.pem`

## Updating later
- Backend: re-run `./deploy/deploy.ps1` (re-uploads + restarts gunicorn).
- Frontend only: rebuild + `scp mobile/dist/*` to `~/trade-alerts/web/` (no restart).

## Tear down (stop all charges)
```powershell
cd deploy/terraform
terraform destroy
```

## Cost notes
- Free tier: `t4g.micro`/`t3.micro` 750 h/mo for 12 months.
- After: `t4g.nano` even cheaper — set `instance_type = "t4g.nano"`.
- Elastic IP is free **while attached**; `terraform destroy` releases it.
- Monitor runs in-process (gunicorn, 1 worker) — do not also enable the
  standalone `trade-alerts.service`.

## Security
- Private key + `terraform.tfvars` + state are gitignored. Never commit them.
- `config.json` is uploaded directly, never committed.
- Lock `allowed_ssh_cidr` to your IP.

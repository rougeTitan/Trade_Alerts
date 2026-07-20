<#
  Trade Alerts - one-shot EC2 deploy (Windows PowerShell)

  Provisions infra with Terraform, builds the Expo web app pointed at the new
  server, uploads everything, and starts gunicorn + nginx.

  Prereqs on your machine:
    - terraform, aws CLI configured (aws configure), OpenSSH (ssh/scp), node/npx
    - deploy/terraform/terraform.tfvars created (copy from .example)
    - config.json present in repo root (email/SMS secrets; gitignored)

  Usage:
    ./deploy/deploy.ps1                 # HTTP, IP-only
    ./deploy/deploy.ps1 -Domain alerts.example.com   # also runs certbot TLS
#>

param(
  [string]$Domain = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$TfDir    = Join-Path $PSScriptRoot "terraform"
$MobileDir = Join-Path $RepoRoot "mobile"

function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }

# --- 0. Preflight -----------------------------------------------------------
if (-not (Test-Path (Join-Path $RepoRoot "config.json"))) {
  throw "config.json not found in repo root. Create it (email/SMS secrets) before deploying."
}
if (-not (Test-Path (Join-Path $TfDir "terraform.tfvars"))) {
  Write-Warning "terraform.tfvars not found; using variable defaults (SSH open to 0.0.0.0/0)."
}

# --- 1. Terraform provision -------------------------------------------------
Info "Terraform init + apply"
Push-Location $TfDir
terraform init -input=false
terraform apply -auto-approve
$PublicIp = (terraform output -raw public_ip).Trim()
$KeyFile  = (terraform output -raw private_key_path).Trim()
Pop-Location

# key path may be relative to the terraform dir
if (-not [System.IO.Path]::IsPathRooted($KeyFile)) {
  $KeyFile = Join-Path $TfDir $KeyFile
}
Info "Instance IP: $PublicIp"
Info "SSH key: $KeyFile"

# --- 2. Build the web app pointed at the server -----------------------------
$ApiUrl = if ($Domain) { "https://$Domain" } else { "http://$PublicIp" }
Info "Building web (EXPO_PUBLIC_API_URL=$ApiUrl)"
Push-Location $MobileDir
$env:EXPO_PUBLIC_API_URL = $ApiUrl
npx expo export -p web
Pop-Location
$DistDir = Join-Path $MobileDir "dist"

# --- 3. Wait for SSH --------------------------------------------------------
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "ConnectTimeout=10")
$Target  = "ec2-user@$PublicIp"
Info "Waiting for SSH..."
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    ssh -i $KeyFile @SshOpts $Target "echo ok" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  } catch {}
  Start-Sleep -Seconds 10
}
if (-not $ready) { throw "SSH never became reachable. Check security group / instance." }

# also wait for cloud-init bootstrap marker
Info "Waiting for instance bootstrap (cloud-init)..."
for ($i = 0; $i -lt 30; $i++) {
  ssh -i $KeyFile @SshOpts $Target "test -f ~/trade-alerts/.bootstrap_done" 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 10
}

# --- 4. Upload -------------------------------------------------------------
Info "Uploading backend + config"
$BackendFiles = @(
  "app.py","main.py","monitor.py","notifier.py","price_fetcher.py",
  "excel_manager.py","scheduler.py","check_watchlist.py",
  "requirements.txt","config.json","sectors.json"
) | ForEach-Object { Join-Path $RepoRoot $_ } | Where-Object { Test-Path $_ }

ssh -i $KeyFile @SshOpts $Target "mkdir -p ~/trade-alerts/web"
scp -i $KeyFile @SshOpts $BackendFiles "${Target}:~/trade-alerts/"
scp -i $KeyFile @SshOpts -r (Join-Path $RepoRoot "templates") "${Target}:~/trade-alerts/"
scp -i $KeyFile @SshOpts -r (Join-Path $RepoRoot "deploy")    "${Target}:~/trade-alerts/"

Info "Uploading web build"
scp -i $KeyFile @SshOpts -r "$DistDir/*" "${Target}:~/trade-alerts/web/"

# --- 5. Remote install + start ---------------------------------------------
Info "Installing venv + services on server"
$Remote = @'
set -e
cd ~/trade-alerts
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
sudo cp deploy/gunicorn.service /etc/systemd/system/gunicorn.service
sudo systemctl daemon-reload
sudo systemctl enable --now gunicorn
sudo cp deploy/nginx.conf /etc/nginx/conf.d/trade-alerts.conf
sudo nginx -t
sudo systemctl reload nginx
echo "REMOTE_DONE"
'@
ssh -i $KeyFile @SshOpts $Target $Remote

# --- 6. Optional TLS --------------------------------------------------------
if ($Domain) {
  Info "Requesting TLS cert for $Domain (ensure DNS A record -> $PublicIp first)"
  ssh -i $KeyFile @SshOpts $Target "sudo certbot --nginx -d $Domain --non-interactive --agree-tos --register-unsafely-without-email || echo 'certbot failed; run manually'"
}

# --- 7. Smoke test ----------------------------------------------------------
Info "Smoke testing API"
try {
  $resp = Invoke-WebRequest -Uri "$ApiUrl/api/alerts" -TimeoutSec 20 -UseBasicParsing
  Info "API responded: HTTP $($resp.StatusCode)"
} catch {
  Write-Warning "API smoke test failed: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Deployed. App: $ApiUrl" -ForegroundColor Green
Write-Host "  SSH: ssh -i `"$KeyFile`" $Target" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green

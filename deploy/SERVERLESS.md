# Serverless deployment — scheduled alert checks (AWS Lambda)

Runs the Trade Alerts price check **twice a day (12:00 and 15:00 America/New_York,
weekdays)** and emails you any breached targets. There is **no server to shut down** —
the Lambda only runs for the few seconds each check takes, so cost is effectively $0
(well within the AWS free tier).

## Architecture

```
EventBridge Scheduler                 AWS Lambda (container image)
  ├─ 12:00 ET  input {reset_daily:true} ─┐
  └─ 15:00 ET  input {reset_daily:false} ┤──▶  trade-alerts-checker
                                          │       1. read watchlist.xlsx  ◀── S3 (state bucket)
                                          │       2. fetch live prices (yfinance)
                                          │       3. compare to targets
                                          │       4. email alerts (Gmail SMTP)
                                          │       5. write prices + alert_log ─▶ S3
                                          └───    creds ◀── Secrets Manager
```

- **Compute:** Lambda container image (Python 3.12) in ECR. yfinance/pandas are large,
  so a container is used instead of a zip.
- **State:** `watchlist.xlsx`, `sectors.json`, `alert_log.csv` live in a private S3 bucket.
- **Secrets:** Gmail credentials live in Secrets Manager (sourced from your local
  `config.json` at apply time — never committed).
- **Dedup:** the 12:00 run resets the day's alert log; the 15:00 run reuses it so the
  same breach isn't emailed twice in one day. A fresh day starts clean.

## Prerequisites

- **AWS CLI** configured (`aws configure`) with credentials that can create IAM, Lambda,
  ECR, S3, Secrets Manager, and EventBridge Scheduler resources.
- **Docker Desktop** running (used to build the Lambda image).
- **Terraform** >= 1.3.
- Your `config.json` and `watchlist.xlsx` present in the repo root (both gitignored).

## Deploy

```powershell
cd deploy/terraform-serverless
copy terraform.tfvars.example terraform.tfvars   # edit if you want different times/region

terraform init
terraform apply
```

Terraform will:
1. Create the ECR repo, then **build + push** the image (via Docker) automatically.
2. Create the S3 bucket and upload your local `watchlist.xlsx` + `sectors.json`.
3. Store your email creds in Secrets Manager.
4. Create the Lambda, IAM roles, and the two EventBridge schedules.

Outputs include the Lambda name, S3 bucket, and the schedule summary.

## Hands-off deploy via GitHub Actions (recommended)

`.github/workflows/deploy-serverless.yml` builds the image, pushes to ECR, and runs
Terraform on every push to `main`. No Docker/Terraform/AWS CLI needed on your machine.
After it runs once, AWS fires the Lambda on its own (weekdays 12:00 & 15:00 ET).

Add these repo secrets (**Settings -> Secrets and variables -> Actions**):

| Secret | Required | Value |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | yes | IAM key allowed to create Lambda/ECR/S3/IAM/Secrets/Scheduler |
| `AWS_SECRET_ACCESS_KEY` | yes | matching secret |
| `CONFIG_JSON` | yes | full contents of your local `config.json` (Gmail creds) |
| `AWS_REGION` | no | defaults to `us-east-1` (repo variable also works) |
| `WATCHLIST_B64` | no | base64 of `watchlist.xlsx` so S3 is seeded automatically |

Make `WATCHLIST_B64` (PowerShell):
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("watchlist.xlsx")) | Set-Clipboard
```
Then push (or run the workflow manually from the Actions tab). Done — fully automatic.

> The IAM user needs permissions for ecr, lambda, s3, iam, secretsmanager,
> scheduler, logs, and sts. For least privilege scope it to those services.

---

## Test it now (don't wait for noon)

```powershell
# reset_daily:true mirrors the noon run
aws lambda invoke `
  --function-name trade-alerts-checker `
  --payload '{"reset_daily":true}' `
  --cli-binary-format raw-in-base64-out `
  out.json ; type out.json
```

Check your inbox, and the logs:

```powershell
aws logs tail /aws/lambda/trade-alerts-checker --follow
```

## Update the watchlist / targets later

The watchlist lives in S3. Edit locally, then re-upload:

```powershell
aws s3 cp watchlist.xlsx s3://<state_bucket>/watchlist.xlsx
```

(`<state_bucket>` = the `state_bucket` Terraform output, e.g. `trade-alerts-state-<account_id>`.)

## Change the check times

Edit `noon_cron` / `afternoon_cron` in `terraform.tfvars` (cron is interpreted in
`timezone`, DST-aware) and re-run `terraform apply`. Add more `aws_scheduler_schedule`
blocks for additional times.

## Ship a code change

```powershell
# quick path (no Terraform): rebuild image + update the function
./deploy/lambda/redeploy.ps1 -Region us-east-1 -Project trade-alerts
```

or just `terraform apply` again — the image auto-rebuilds when any source file changes.

## Cost

- Lambda: 2 invocations/weekday × a few seconds → free tier.
- S3: a few small objects → cents.
- Secrets Manager: 1 secret → ~$0.40/mo (delete if you inline creds instead).
- ECR: one small image → cents.
- EventBridge Scheduler: free tier.

## Tear down

```powershell
cd deploy/terraform-serverless
terraform destroy
```

## Notes / limitations

- `BOTH`-direction targets rely on price-crossover detection between checks. With only
  two snapshots/day there's little history, so `BOTH` fires only when the price is within
  ~0.5% of target at check time. `ABOVE` / `BELOW` targets work reliably on a snapshot.
- The Lambda runs outside a VPC so it has direct internet access to Yahoo Finance and Gmail.

# Rebuild the Lambda container image and roll it out WITHOUT re-running Terraform.
# Use this for quick code changes after the stack already exists.
#
# Usage (from anywhere):
#   ./deploy/lambda/redeploy.ps1 -Region us-east-1 -Project trade-alerts
#
# Requires: Docker Desktop running, AWS CLI configured with credentials.

param(
  [string]$Region  = "us-east-1",
  [string]$Project = "trade-alerts"
)
$ErrorActionPreference = "Stop"

# Repo root = two levels up from this script.
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

$AccountId = (aws sts get-caller-identity --query Account --output text).Trim()
$Registry  = "$AccountId.dkr.ecr.$Region.amazonaws.com"
$RepoName  = "$Project-lambda"
$RepoUrl   = "$Registry/$RepoName"
$Tag       = (Get-Date -Format "yyyyMMddHHmmss")
$ImageUri  = "${RepoUrl}:$Tag"
$Function  = "$Project-checker"

Write-Host "Logging in to ECR ($Registry)..." -ForegroundColor Cyan
aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $Registry

Write-Host "Building image $ImageUri ..." -ForegroundColor Cyan
docker build -f deploy/lambda/Dockerfile -t $ImageUri .

Write-Host "Pushing image..." -ForegroundColor Cyan
docker push $ImageUri

Write-Host "Updating Lambda $Function ..." -ForegroundColor Cyan
aws lambda update-function-code `
  --function-name $Function `
  --image-uri $ImageUri `
  --region $Region | Out-Null

Write-Host "Done. $Function now runs $ImageUri" -ForegroundColor Green

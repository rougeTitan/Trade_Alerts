terraform {
  required_version = ">= 1.3.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  registry   = "${local.account_id}.dkr.ecr.${var.region}.amazonaws.com"
  repo_url   = aws_ecr_repository.this.repository_url

  lambda_dir = "${path.module}/${var.repo_root}/deploy/lambda"

  # Rebuild + redeploy the image whenever any source file changes.
  src_hash = sha1(join("", [
    filesha1("${local.lambda_dir}/lambda_function.py"),
    filesha1("${local.lambda_dir}/Dockerfile"),
    filesha1("${local.lambda_dir}/requirements-lambda.txt"),
    filesha1("${path.module}/${var.repo_root}/monitor.py"),
    filesha1("${path.module}/${var.repo_root}/notifier.py"),
    filesha1("${path.module}/${var.repo_root}/price_fetcher.py"),
    filesha1("${path.module}/${var.repo_root}/excel_manager.py"),
  ]))
  image_tag = var.image_tag_override != "" ? var.image_tag_override : substr(local.src_hash, 0, 12)
  image_uri = "${local.repo_url}:${local.image_tag}"

  # Pull the email credential block straight from the (gitignored) config.json.
  email_config = jsondecode(file("${path.module}/${var.repo_root}/config.json")).email

  watchlist_src = "${path.module}/${var.repo_root}/watchlist.xlsx"
  sectors_src   = "${path.module}/${var.repo_root}/sectors.json"
}

# ---------------------------------------------------------------------------
# ECR repository + build/push of the Lambda container image
# ---------------------------------------------------------------------------
resource "aws_ecr_repository" "this" {
  name                 = "${var.project_name}-lambda"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = false
  }
}

# Builds the image from the repo root and pushes the source-hash tag to ECR.
# Requires Docker + AWS CLI available locally and AWS creds in the environment.
resource "null_resource" "docker_build_push" {
  count = var.build_image ? 1 : 0

  triggers = {
    image_tag = local.image_tag
    repo_url  = local.repo_url
  }

  provisioner "local-exec" {
    interpreter = ["PowerShell", "-Command"]
    working_dir = "${path.module}/${var.repo_root}"
    command     = <<-EOT
      $ErrorActionPreference = "Stop"
      aws ecr get-login-password --region ${var.region} | docker login --username AWS --password-stdin ${local.registry}
      docker build -f deploy/lambda/Dockerfile -t ${local.image_uri} .
      docker push ${local.image_uri}
    EOT
  }

  depends_on = [aws_ecr_repository.this]
}

# ---------------------------------------------------------------------------
# S3 bucket for state (watchlist.xlsx, sectors.json, alert_log.csv)
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "state" {
  bucket        = "${var.project_name}-state-${local.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Seed the bucket with the local watchlist + sectors (if present).
resource "aws_s3_object" "watchlist" {
  count  = fileexists(local.watchlist_src) ? 1 : 0
  bucket = aws_s3_bucket.state.id
  key    = "watchlist.xlsx"
  source = local.watchlist_src
  etag   = filemd5(local.watchlist_src)
}

resource "aws_s3_object" "sectors" {
  count  = fileexists(local.sectors_src) ? 1 : 0
  bucket = aws_s3_bucket.state.id
  key    = "sectors.json"
  source = local.sectors_src
  etag   = filemd5(local.sectors_src)
}

# ---------------------------------------------------------------------------
# Secrets Manager: email credentials (sourced from local config.json)
# ---------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "email" {
  name                    = "${var.project_name}/email"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "email" {
  secret_id     = aws_secretsmanager_secret.email.id
  secret_string = jsonencode({ email = local.email_config })
}

# ---------------------------------------------------------------------------
# IAM role for the Lambda
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.project_name}-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "lambda_perms" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:*:*:*"]
  }
  statement {
    sid       = "S3State"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.state.arn}/*"]
  }
  statement {
    sid       = "ReadSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.email.arn]
  }
}

resource "aws_iam_role_policy" "lambda_perms" {
  name   = "${var.project_name}-lambda-policy"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_perms.json
}

# ---------------------------------------------------------------------------
# Lambda function (container image)
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.project_name}-checker"
  retention_in_days = 14
}

resource "aws_lambda_function" "checker" {
  function_name = "${var.project_name}-checker"
  role          = aws_iam_role.lambda.arn
  package_type  = "Image"
  image_uri     = local.image_uri
  timeout       = var.lambda_timeout
  memory_size   = var.lambda_memory
  architectures = ["x86_64"]

  environment {
    variables = {
      STATE_BUCKET  = aws_s3_bucket.state.bucket
      SECRET_ARN    = aws_secretsmanager_secret.email.arn
      TIMEZONE      = var.timezone
      WATCHLIST_KEY = "watchlist.xlsx"
      ALERT_LOG_KEY = "alert_log.csv"
    }
  }

  depends_on = [
    null_resource.docker_build_push,
    aws_iam_role_policy.lambda_perms,
    aws_cloudwatch_log_group.lambda,
  ]
}

# ---------------------------------------------------------------------------
# EventBridge Scheduler -> Lambda (12:00 and 15:00 in var.timezone)
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${var.project_name}-scheduler-role"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "scheduler_invoke" {
  statement {
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.checker.arn]
  }
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name   = "${var.project_name}-scheduler-invoke"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler_invoke.json
}

resource "aws_scheduler_schedule" "noon" {
  name                         = "${var.project_name}-noon"
  schedule_expression          = var.noon_cron
  schedule_expression_timezone = var.timezone

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.checker.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ reset_daily = true })
  }
}

resource "aws_scheduler_schedule" "afternoon" {
  name                         = "${var.project_name}-3pm"
  schedule_expression          = var.afternoon_cron
  schedule_expression_timezone = var.timezone

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.checker.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ reset_daily = false })
  }
}

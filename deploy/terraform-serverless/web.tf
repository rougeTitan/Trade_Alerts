# ===========================================================================
# Web dashboard tier: Flask -> Lambda (Function URL) + static frontend on
# S3 + CloudFront. Reuses the same state bucket, secret, and IAM role as the
# scheduled checker.
# ===========================================================================

locals {
  web_dir = "${path.module}/${var.repo_root}/deploy/lambda-web"

  web_src_hash = sha1(join("", [
    filesha1("${local.web_dir}/lambda_web.py"),
    filesha1("${local.web_dir}/Dockerfile"),
    filesha1("${local.web_dir}/requirements-web.txt"),
    filesha1("${path.module}/${var.repo_root}/app.py"),
    filesha1("${path.module}/${var.repo_root}/monitor.py"),
    filesha1("${path.module}/${var.repo_root}/notifier.py"),
    filesha1("${path.module}/${var.repo_root}/price_fetcher.py"),
    filesha1("${path.module}/${var.repo_root}/excel_manager.py"),
  ]))
  web_image_tag = var.web_image_tag_override != "" ? var.web_image_tag_override : substr(local.web_src_hash, 0, 12)
  web_repo_url  = aws_ecr_repository.web.repository_url
  web_image_uri = "${local.web_repo_url}:${local.web_image_tag}"
}

# ---------------------------------------------------------------------------
# ECR + image build for the web API
# ---------------------------------------------------------------------------
resource "aws_ecr_repository" "web" {
  name                 = "${var.project_name}-web"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = false
  }
}

resource "null_resource" "web_build_push" {
  count = var.build_image ? 1 : 0

  triggers = {
    image_tag = local.web_image_tag
    repo_url  = local.web_repo_url
  }

  provisioner "local-exec" {
    interpreter = ["PowerShell", "-Command"]
    working_dir = "${path.module}/${var.repo_root}"
    command     = <<-EOT
      $ErrorActionPreference = "Stop"
      aws ecr get-login-password --region ${var.region} | docker login --username AWS --password-stdin ${local.registry}
      docker build -f deploy/lambda-web/Dockerfile -t ${local.web_image_uri} .
      docker push ${local.web_image_uri}
    EOT
  }

  depends_on = [aws_ecr_repository.web]
}

# ---------------------------------------------------------------------------
# Web Lambda + public Function URL
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "web" {
  name              = "/aws/lambda/${var.project_name}-web"
  retention_in_days = 14
}

resource "aws_lambda_function" "web" {
  function_name = "${var.project_name}-web"
  role          = aws_iam_role.lambda.arn
  package_type  = "Image"
  image_uri     = local.web_image_uri
  timeout       = 60
  memory_size   = 1024
  architectures = ["x86_64"]

  environment {
    variables = {
      STATE_BUCKET       = aws_s3_bucket.state.bucket
      SECRET_ARN         = aws_secretsmanager_secret.email.arn
      TIMEZONE           = var.timezone
      AUTO_START_MONITOR = "0"
    }
  }

  depends_on = [
    null_resource.web_build_push,
    aws_iam_role_policy.lambda_perms,
    aws_cloudwatch_log_group.web,
  ]
}

# IAM-authed Function URL (a public NONE URL is blocked by an Org guardrail).
# CloudFront reaches it via Origin Access Control, SigV4-signing each request.
resource "aws_lambda_function_url" "web" {
  function_name      = aws_lambda_function.web.function_name
  authorization_type = "AWS_IAM"
  invoke_mode        = "BUFFERED"
}

# Allow the CloudFront distribution (and only it) to invoke the Function URL.
resource "aws_lambda_permission" "web_url" {
  statement_id           = "AllowCloudFrontInvoke"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.web.function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = aws_cloudfront_distribution.frontend.arn
  function_url_auth_type = "AWS_IAM"
}

# ---------------------------------------------------------------------------
# Frontend: private S3 bucket served through CloudFront (HTTPS)
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "frontend" {
  bucket        = "${var.project_name}-web-${local.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project_name}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# OAC so CloudFront SigV4-signs requests to the Lambda Function URL origin.
resource "aws_cloudfront_origin_access_control" "lambda" {
  name                              = "${var.project_name}-lambda-oac"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Managed policies: never cache API responses, forward everything except Host
# (Host must be excluded so OAC can set it for correct SigV4 signing).
data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

# SPA fallback done at the edge on the S3 behavior ONLY: rewrite extensionless
# paths (e.g. /dashboard) to /index.html. /api/* is a separate behavior, so API
# responses are never rewritten (unlike a distribution-wide custom_error_response).
resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "${var.project_name}-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var req = event.request;
      var seg = req.uri.split('/').pop();
      if (seg.indexOf('.') === -1) { req.uri = '/index.html'; }
      return req;
    }
  EOT
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  default_root_object = "index.html"
  comment             = "${var.project_name} dashboard"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "frontend-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # Lambda Function URL as an origin for the /api/* routes.
  origin {
    domain_name              = replace(replace(aws_lambda_function_url.web.function_url, "https://", ""), "/", "")
    origin_id                = "lambda-api"
    origin_access_control_id = aws_cloudfront_origin_access_control.lambda.id

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # API calls -> Lambda origin (signed, uncached, all methods).
  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "lambda-api"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  default_cache_behavior {
    target_origin_id       = "frontend-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  # SPA fallback handled by the spa_rewrite CloudFront Function on the S3
  # behavior (see above); no distribution-wide custom_error_response so it
  # cannot clobber /api responses.

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  price_class = "PriceClass_100"
}

data "aws_iam_policy_document" "frontend_bucket" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_bucket.json
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------
output "web_function_url" {
  description = "Backend API base URL (Lambda Function URL)."
  value       = aws_lambda_function_url.web.function_url
}

output "web_ecr_repository_url" {
  value = aws_ecr_repository.web.repository_url
}

output "frontend_bucket" {
  description = "S3 bucket that holds the built web app."
  value       = aws_s3_bucket.frontend.bucket
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.frontend.id
}

output "dashboard_url" {
  description = "Open this in a browser to use the dashboard."
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

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

resource "aws_lambda_function_url" "web" {
  function_name      = aws_lambda_function.web.function_name
  authorization_type = "NONE"

  cors {
    allow_origins = ["*"]
    allow_methods = ["*"]
    allow_headers = ["*"]
    max_age       = 86400
  }
}

resource "aws_lambda_permission" "web_url" {
  statement_id           = "AllowPublicFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.web.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
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

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  default_root_object = "index.html"
  comment             = "${var.project_name} dashboard"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "frontend-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    target_origin_id       = "frontend-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]

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

  # SPA fallback: unknown paths return index.html.
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

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

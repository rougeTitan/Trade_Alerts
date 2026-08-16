variable "region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Name prefix for all resources."
  type        = string
  default     = "trade-alerts"
}

variable "timezone" {
  description = "IANA timezone for the schedules and alert timestamps."
  type        = string
  default     = "America/New_York"
}

variable "noon_cron" {
  description = "EventBridge cron for the midday run (in var.timezone). Weekdays 12:00."
  type        = string
  default     = "cron(0 12 ? * MON-FRI *)"
}

variable "afternoon_cron" {
  description = "EventBridge cron for the afternoon run (in var.timezone). Weekdays 15:00."
  type        = string
  default     = "cron(0 15 ? * MON-FRI *)"
}

variable "lambda_timeout" {
  description = "Lambda timeout in seconds (price fetch for ~90 tickers)."
  type        = number
  default     = 180
}

variable "lambda_memory" {
  description = "Lambda memory (MB). More memory = more CPU = faster yfinance calls."
  type        = number
  default     = 1024
}

variable "image_tag_override" {
  description = "Optional fixed image tag. Leave empty to auto-tag from source hash."
  type        = string
  default     = ""
}

variable "web_image_tag_override" {
  description = "Optional fixed tag for the web dashboard image. Empty = auto source hash."
  type        = string
  default     = ""
}

variable "build_image" {
  description = <<-EOT
    When true (local default), Terraform builds + pushes the Lambda image via a
    local PowerShell + Docker step. Set false in CI, where the workflow builds and
    pushes the image itself and passes image_tag_override.
  EOT
  type        = bool
  default     = true
}

# ---- Local files reused from the repo root (../../) --------------------------
variable "repo_root" {
  description = "Path to the repository root, relative to this module."
  type        = string
  default     = "../.."
}

variable "ses_sender" {
  description = "Verified SES email identity to send alerts from. Empty disables email."
  type        = string
  default     = ""
}

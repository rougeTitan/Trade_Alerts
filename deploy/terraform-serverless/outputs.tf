output "lambda_function_name" {
  description = "Name of the scheduled checker Lambda."
  value       = aws_lambda_function.checker.function_name
}

output "state_bucket" {
  description = "S3 bucket holding watchlist.xlsx / sectors.json / alert_log.csv."
  value       = aws_s3_bucket.state.bucket
}

output "secret_arn" {
  description = "Secrets Manager ARN storing the email credentials."
  value       = aws_secretsmanager_secret.email.arn
}

output "ecr_repository_url" {
  description = "ECR repository the Lambda image is pushed to."
  value       = aws_ecr_repository.this.repository_url
}

output "image_uri" {
  description = "Full image URI (with source-hash tag) the Lambda runs."
  value       = local.image_uri
}

output "schedules" {
  description = "The two EventBridge schedules and their local times."
  value = {
    noon      = "${aws_scheduler_schedule.noon.name} @ ${var.noon_cron} (${var.timezone})"
    afternoon = "${aws_scheduler_schedule.afternoon.name} @ ${var.afternoon_cron} (${var.timezone})"
  }
}

output "cognito_region" {
  description = "Cognito User Pool region."
  value       = var.region
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID for mobile client."
  value       = aws_cognito_user_pool.users.id
}

output "cognito_client_id" {
  description = "Cognito User Pool Client ID for mobile app."
  value       = aws_cognito_user_pool_client.mobile.id
}

output "dynamodb_table_name" {
  description = "DynamoDB table name for tenant data."
  value       = aws_dynamodb_table.trade_alerts.name
}

output "dynamodb_table_arn" {
  description = "DynamoDB table ARN for IAM policies."
  value       = aws_dynamodb_table.trade_alerts.arn
}

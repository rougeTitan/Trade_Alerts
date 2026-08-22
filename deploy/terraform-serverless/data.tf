# ===========================================================================
# Multi-user data layer: Cognito + DynamoDB.
# ===========================================================================

# -----------------------------------------------------------------------------
# Cognito User Pool (managed sign-up / sign-in)
# -----------------------------------------------------------------------------
resource "aws_cognito_user_pool" "users" {
  name = "${var.project_name}-users"

  username_attributes = ["email"]

  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
  }

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  schema {
    attribute_data_type = "String"
    name                = "name"
    required            = false
    mutable             = true
  }

  lifecycle {
    ignore_changes = [schema]
  }
}

resource "aws_cognito_user_pool_client" "mobile" {
  name            = "${var.project_name}-mobile"
  user_pool_id    = aws_cognito_user_pool.users.id
  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
  ]

  supported_identity_providers = ["COGNITO"]
}

resource "aws_cognito_user_pool_domain" "users" {
  domain       = "${var.project_name}-${data.aws_caller_identity.current.account_id}"
  user_pool_id = aws_cognito_user_pool.users.id
}

# -----------------------------------------------------------------------------
# DynamoDB single-table
# -----------------------------------------------------------------------------
resource "aws_dynamodb_table" "trade_alerts" {
  name         = "${var.project_name}-data"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "PK"
  range_key = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  ttl {
    enabled        = true
    attribute_name = "ttl"
  }

  point_in_time_recovery {
    enabled = false
  }
}

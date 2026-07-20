terraform {
  required_version = ">= 1.3.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# ---------------------------------------------------------------------------
# Auto-generated SSH key pair (private key saved locally as .pem)
# ---------------------------------------------------------------------------
resource "tls_private_key" "this" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "this" {
  key_name   = var.key_name
  public_key = tls_private_key.this.public_key_openssh
}

resource "local_sensitive_file" "private_key" {
  content         = tls_private_key.this.private_key_pem
  filename        = var.private_key_path
  file_permission = "0400"
}

# ---------------------------------------------------------------------------
# Latest Amazon Linux 2023 AMI (arch must match instance_type)
# ---------------------------------------------------------------------------
data "aws_ssm_parameter" "ami" {
  name = var.ami_ssm_parameter
}

# ---------------------------------------------------------------------------
# Security group: SSH (restricted), HTTP, HTTPS
# ---------------------------------------------------------------------------
resource "aws_security_group" "this" {
  name        = "${var.project_name}-sg"
  description = "Trade Alerts: SSH/HTTP/HTTPS"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-sg" }
}

# ---------------------------------------------------------------------------
# EC2 instance
# ---------------------------------------------------------------------------
resource "aws_instance" "this" {
  ami                    = data.aws_ssm_parameter.ami.value
  instance_type          = var.instance_type
  key_name               = aws_key_pair.this.key_name
  vpc_security_group_ids = [aws_security_group.this.id]
  user_data              = file("${path.module}/user_data.sh")

  root_block_device {
    volume_size = var.root_volume_gb
    volume_type = "gp3"
  }

  tags = { Name = var.project_name }
}

# ---------------------------------------------------------------------------
# Elastic IP (stable address; free while attached)
# ---------------------------------------------------------------------------
resource "aws_eip" "this" {
  domain   = "vpc"
  instance = aws_instance.this.id
  tags     = { Name = "${var.project_name}-eip" }
}

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

variable "instance_type" {
  description = "EC2 instance type. t4g.* = Arm (cheaper, free-tier eligible)."
  type        = string
  default     = "t4g.micro"
}

variable "ami_ssm_parameter" {
  description = <<-EOT
    SSM public parameter for the AMI. Must match the instance_type CPU arch.
      Arm64  (t4g.*): /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64
      x86_64 (t3.*) : /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64
  EOT
  type        = string
  default     = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

variable "root_volume_gb" {
  description = "Root EBS size in GB."
  type        = number
  default     = 8
}

variable "allowed_ssh_cidr" {
  description = "CIDR allowed to SSH (port 22). Set to YOUR_IP/32 for safety."
  type        = string
  default     = "0.0.0.0/0"
}

variable "key_name" {
  description = "Name for the auto-generated EC2 key pair."
  type        = string
  default     = "trade-alerts-key"
}

variable "private_key_path" {
  description = "Local path where the generated private key (.pem) is written."
  type        = string
  default     = "trade-alerts-key.pem"
}

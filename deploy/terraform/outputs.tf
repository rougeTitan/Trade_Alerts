output "public_ip" {
  description = "Elastic IP of the instance."
  value       = aws_eip.this.public_ip
}

output "private_key_path" {
  description = "Local path to the generated SSH private key."
  value       = local_sensitive_file.private_key.filename
}

output "ssh_command" {
  description = "Ready-to-use SSH command."
  value       = "ssh -i ${local_sensitive_file.private_key.filename} ec2-user@${aws_eip.this.public_ip}"
}

output "app_url" {
  description = "HTTP URL once nginx is up."
  value       = "http://${aws_eip.this.public_ip}"
}

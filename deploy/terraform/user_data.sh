#!/bin/bash
# Runs once on first boot (cloud-init). Installs system deps so the app is
# ready for the deploy script to upload files and start services.
set -e

dnf update -y || yum update -y || true

# Python + build basics
dnf install -y python3 python3-pip || yum install -y python3 python3-pip

# Web server
dnf install -y nginx || yum install -y nginx
systemctl enable nginx
systemctl start nginx

# certbot (best-effort; TLS optional). Falls back to pip if no package.
dnf install -y certbot python3-certbot-nginx 2>/dev/null \
  || pip3 install certbot certbot-nginx 2>/dev/null \
  || true

# App directory owned by the login user
mkdir -p /home/ec2-user/trade-alerts/web
chown -R ec2-user:ec2-user /home/ec2-user/trade-alerts

echo "user_data bootstrap complete" > /home/ec2-user/trade-alerts/.bootstrap_done

data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Generate SSH key pair and register it with AWS for this EC2
resource "tls_private_key" "tailscale" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "tailscale" {
  key_name   = "${var.tailscale_instance_name}-key"
  public_key = tls_private_key.tailscale.public_key_openssh
}

resource "local_file" "tailscale_private_key" {
  content         = tls_private_key.tailscale.private_key_pem
  filename        = "${path.module}/${var.tailscale_instance_name}.pem"
  file_permission = "0400"
}

resource "aws_eip" "tailscale" {
  domain = "vpc"
  tags   = { Name = "${var.tailscale_instance_name}-eip" }
}

resource "aws_security_group" "tailscale" {
  name        = "${var.tailscale_instance_name}-sg"
  description = "SSH and Tailscale mesh traffic"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_ingress_cidr]
  }

  ingress {
    description = "Tailscale UDP"
    from_port   = 41641
    to_port     = 41641
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.tailscale_instance_name}-sg" }
}

resource "aws_instance" "tailscale" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = var.tailscale_instance_type
  key_name               = aws_key_pair.tailscale.key_name
  vpc_security_group_ids = [aws_security_group.tailscale.id]

  source_dest_check = false

  user_data = var.tailscale_auth_key == "" ? null : <<-EOT
    #!/bin/bash
    set -euo pipefail
    echo 'net.ipv4.ip_forward = 1' >/etc/sysctl.d/99-tailscale.conf
    echo 'net.ipv6.conf.all.forwarding = 1' >>/etc/sysctl.d/99-tailscale.conf
    sysctl -p /etc/sysctl.d/99-tailscale.conf
    curl -fsSL https://tailscale.com/install.sh | sh
    tailscale up --auth-key='${var.tailscale_auth_key}' --hostname='${var.tailscale_instance_name}' --advertise-exit-node
  EOT

  tags = { Name = var.tailscale_instance_name }
}

resource "aws_eip_association" "tailscale" {
  instance_id   = aws_instance.tailscale.id
  allocation_id = aws_eip.tailscale.id
}

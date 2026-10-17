variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "api_name" {
  description = "HTTP API Gateway name"
  type        = string
  default     = "ip-whitelist-api"
}

variable "lambda_function_name" {
  description = "Lambda function name"
  type        = string
  default     = "ip-whitelist-api"
}

variable "whitelist_table_name" {
  description = "DynamoDB table for whitelisted IPs"
  type        = string
  default     = "ip-whitelist"
}

variable "tailscale_instance_type" {
  description = "EC2 instance type for the Tailscale VM"
  type        = string
  default     = "t3.micro"
}

variable "tailscale_instance_name" {
  description = "Name tag / Tailscale hostname for the VM"
  type        = string
  default     = "tailscale-proxy-node"
}

variable "ssh_ingress_cidr" {
  description = "CIDR allowed to SSH to the Tailscale VM (prefer your IP/32)"
  type        = string
  default     = "0.0.0.0/0"
}

variable "tailscale_auth_key" {
  description = "Tailscale auth key used at first boot (leave empty to install Tailscale manually)"
  type        = string
  default     = ""
  sensitive   = true
}

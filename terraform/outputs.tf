output "api_endpoint" {
  description = "API Gateway base URL"
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "protected_data_url" {
  description = "GET /protected-data URL"
  value       = "${aws_apigatewayv2_api.api.api_endpoint}/protected-data"
}

output "whitelist_url" {
  description = "POST/GET /whitelist URL"
  value       = "${aws_apigatewayv2_api.api.api_endpoint}/whitelist"
}

output "tailscale_public_ip" {
  description = "Static Elastic IP of the Tailscale VM (whitelist this with third parties)"
  value       = aws_eip.tailscale.public_ip
}

output "tailscale_instance_id" {
  description = "EC2 instance ID of the Tailscale VM"
  value       = aws_instance.tailscale.id
}

output "tailscale_private_key_path" {
  description = "Local path to the generated SSH private key (gitignored)"
  value       = local_file.tailscale_private_key.filename
}

output "tailscale_ssh" {
  description = "SSH command for the Tailscale VM"
  value       = "ssh -i ${local_file.tailscale_private_key.filename} ec2-user@${aws_eip.tailscale.public_ip}"
}

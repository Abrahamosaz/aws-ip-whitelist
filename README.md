# aws-ip-whitelist

Terraform demo of an API that only serves protected data to whitelisted client IPs, plus a Tailscale exit node pinned to a static Elastic IP.

Use the API when you need to allow or deny callers by public IPv4 address. Use the exit node when a partner needs one stable source address to whitelist on their side.

## What it deploys

- **HTTP API** (API Gateway) in front of a Node.js 20 Lambda
- **DynamoDB** table of allowed IPv4 addresses
- **EC2** Amazon Linux 2023 instance running Tailscale, with an Elastic IP, IP forwarding, and `--advertise-exit-node`

```
Client ──► API Gateway ──► Lambda ──► DynamoDB (ip whitelist)
                │
                └── GET /protected-data allowed only if source IP is in the table

Your device ──► Tailscale ──► EC2 exit node ──► Elastic IP ──► the internet
```

`GET /protected-data` uses the source IP API Gateway records (`requestContext.http.sourceIp`). A request is allowed only when that address is already in the table.

## API

| Method | Path | Behavior |
| --- | --- | --- |
| `POST` | `/whitelist` | Save an IPv4 address. Optional `label`. `409` if it already exists. |
| `GET` | `/whitelist` | List saved addresses. |
| `GET` | `/protected-data` | `200` if the caller IP is listed, otherwise `403`. |

```bash
# Add an address
curl -X POST "$API/whitelist" \
  -H 'Content-Type: application/json' \
  -d '{"ip":"203.0.113.10","label":"Office"}'

# List them
curl "$API/whitelist"

# Call the gated route (succeeds only from a listed public IP)
curl "$API/protected-data"
```

`POST /whitelist` expects a JSON body:

```json
{ "ip": "203.0.113.10", "label": "Office" }
```

`ip` must be a valid IPv4 address. `label` is optional.

These routes have no authentication. Anyone who can reach the API can add an address. That is fine for a demo; do not treat it as an access-control boundary in production.

A Postman collection for the three routes is in `postman/collections/`. Set `base_url` to the `api_endpoint` output.

## Prerequisites

- Terraform `>= 1.3`
- AWS credentials with permission to create Lambda, API Gateway, DynamoDB, EC2, Elastic IP, IAM, and security groups
- A [Tailscale auth key](https://tailscale.com/kb/1085/auth-keys) if you want the instance to join your tailnet on first boot

## Deploy

```bash
cd lambda && npm install && cd ..

cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` before apply:

- Set `ssh_ingress_cidr` to your IP in CIDR form (`x.x.x.x/32`) instead of `0.0.0.0/0`.
- Set `tailscale_auth_key` if you want Tailscale installed and started by user data. Leave it unset to join the tailnet yourself after SSH.

```bash
terraform init
terraform apply
```

Useful outputs:

| Output | What it is |
| --- | --- |
| `api_endpoint` | Base URL for the API |
| `whitelist_url` | `POST` / `GET /whitelist` |
| `protected_data_url` | `GET /protected-data` |
| `tailscale_public_ip` | Elastic IP to give to partners |
| `tailscale_ssh` | SSH command for the instance |

Terraform writes an SSH private key next to the config (`terraform/<instance-name>.pem`, mode `0400`). That file is gitignored.

## Tailscale exit node

On first boot, if `tailscale_auth_key` is set, user data enables forwarding and runs:

```bash
tailscale up --auth-key=... --hostname=tailscale-proxy-node --advertise-exit-node
```

If you left the key empty, SSH in with the `tailscale_ssh` output and install it yourself:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --hostname=tailscale-proxy-node --advertise-exit-node
```

Approve the exit node in the [Tailscale admin console](https://login.tailscale.com/admin/machines) if your tailnet requires it. On a client:

```bash
tailscale set --exit-node=tailscale-proxy-node
```

Outbound traffic from that client then leaves AWS from `tailscale_public_ip`. Give that address to anyone who needs to whitelist you. To let traffic through the node call this API, `POST` that same address to `/whitelist`.

## Tear down

```bash
cd terraform
terraform destroy
```

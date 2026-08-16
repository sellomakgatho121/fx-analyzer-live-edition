# Deploy to a free always-on cloud VM (the "just log in, it's always running" option)

The phone-hosted setup works but only while this device is on. For a genuinely
hassle-free, always-on, **free forever** host, use a cloud VM. Vercel cannot
run this app's engine/backend (long-running processes), so the VM replaces the
phone as the host — the Vercel site stays as the UI and needs **zero changes**.

## The one-time setup (≈10 minutes, free forever)

### 1. Create the VM — Oracle Cloud Always Free (recommended)

- Sign up at https://signup.cloud.oracle.com (free tier; requires a card only
  for identity verification — nothing is charged).
- Console → **Compute → Instances → Create instance**:
  - Image: **Ubuntu 24.04** (or 22.04)
  - Shape: **VM.Standard.A1.Flex** (Always Free eligible)
  - **4 OCPU / 24 GB RAM** (or even 1 OCPU / 6 GB is enough)
  - Networking: default VCN, assign a **public IP**
  - SSH keys: **Paste the public key** below
- Wait for "Running", note the **public IP**.

```text
PUBLIC SSH KEY TO PASTE:
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJs2UrUOM1drrS0Y4N7Jbade5tgpJCR+UuiBJ8zDjErC fx-analyzer-deploy
```

### 2. Hand off / provision

Either paste the VM's public IP to the assistant and it finishes the job, or
run it yourself (the repo is private and carries a gitignored `.env`, so it is
**pushed over SSH**, not cloned):

```bash
# from this phone, once you know the VM IP:
rsync -az --delete \
  --exclude node_modules --exclude .venv --exclude .next \
  --exclude __pycache__ --exclude .git \
  -e "ssh -i ~/.ssh/id_ed25519_fx" \
  ./ ubuntu@<VM_IP>:~/fx-analyzer

# on the VM:
ssh -i ~/.ssh/id_ed25519_fx ubuntu@<VM_IP>
sudo bash ~/fx-analyzer/deploy/cloud/setup_vps.sh
```

`setup_vps.sh` installs everything and registers three systemd services
(`fx-engine`, `fx-backend`, `fx-tunnel`) that **start at boot and restart on
crash** — no tunnel to babysit, no phone to keep on.

### 3. Done

Open https://fx-analyzer-live.vercel.app → log in → everything works, 24/7.

## Alternatives

- **Render** (free tier): deploy `backend/` + `engine/` as a web service with
  the repo's `Dockerfile`/start command. Free tier sleeps after 15 min of
  inactivity (wakes in ~30 s) — fine for occasional use, not for live trading.
- **Railway / Fly.io**: easy, but free allowances are small/credit-gated.
- Any cheap VPS ($3–6/mo) works the same as Oracle.

## Rollback

To go back to the phone host: shut down the VM (or `systemctl stop fx-*`),
start the local stack (`sh scripts/fx-stack.sh watch &`), and the same URL
works again — the tunnel subdomain is the single point of truth.

#!/bin/bash
# Generate self-signed certificate for HTTPS development

cd /home/alpogue/.openclaw/workspace/tl-voice-inbox/apps/web

# Create certs directory
mkdir -p certs

# Generate certificate
openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj '/CN=localhost' 2>/dev/null

echo "Certificates generated in apps/web/certs/"
echo "Cert: certs/cert.pem"
echo "Key: certs/key.pem"
echo ""
echo "To trust this certificate on devices:"
echo "1. Copy certs/cert.pem to your device"
echo "2. Install it as a trusted certificate"
echo ""
echo "Or use the insecure workaround for testing:"
echo "- iOS Safari: Settings > Advanced > Experimental Features > Allow Media Capture on Insecure Sites"
echo "- Chrome: chrome://flags/#unsafely-treat-insecure-origin-as-secure"

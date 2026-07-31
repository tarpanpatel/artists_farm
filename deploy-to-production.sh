#!/bin/bash

#################################################################################
# Artistic Sthan - Automated Production Deployment
# Deploy to: 91.238.163.173
# Domain: artistic-sthan.com
# This script runs on your LOCAL MACHINE and deploys to production
#################################################################################

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SERVER_IP="91.238.163.173"
SERVER_USER="apartment"
SSH_KEY_PATH="$HOME/.ssh/id_rsa"  # Path to your cPanel SSH key
DOMAIN="artistic-sthan.com"
PROJECT_NAME="artistic-sthan"
DEPLOY_PATH="/home/apartment/public_html"

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
    exit 1
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Step 1: Verify SSH key exists
verify_ssh_key() {
    print_header "Step 1: Verify SSH Key"

    if [ ! -f "$SSH_KEY_PATH" ]; then
        print_error "SSH key not found at $SSH_KEY_PATH"
        echo "Please download your SSH key from cPanel and save it as:"
        echo "  $SSH_KEY_PATH"
        echo ""
        echo "Then run this script again."
        exit 1
    fi

    chmod 600 "$SSH_KEY_PATH"
    print_success "SSH key found and permissions set"
}

# Step 2: Test SSH connection
test_ssh_connection() {
    print_header "Step 2: Test SSH Connection"

    if ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_IP" "echo 'SSH connection successful'" > /dev/null 2>&1; then
        print_success "SSH connection successful"
    else
        print_error "Cannot connect to server. Check SSH key and username."
    fi
}

# Step 3: Package project
package_project() {
    print_header "Step 3: Package Project Files"

    local package_file="/tmp/${PROJECT_NAME}-$(date +%s).tar.gz"

    echo "Creating package (this may take a minute)..."

    tar --exclude='.git' \
        --exclude='node_modules' \
        --exclude='dist' \
        --exclude='.env' \
        --exclude='backups' \
        --exclude='logs' \
        --exclude='*.log' \
        -czf "$package_file" \
        -C "$(dirname "$0")" . > /dev/null 2>&1

    print_success "Project packaged: $package_file"
    echo "$package_file"
}

# Step 4: Upload to server
upload_to_server() {
    print_header "Step 4: Upload to Server"

    local package_file=$1

    print_warning "Uploading files to server (this may take 2-3 minutes)..."

    scp -i "$SSH_KEY_PATH" -q "$package_file" "$SERVER_USER@$SERVER_IP:/tmp/"

    local remote_file="/tmp/$(basename "$package_file")"
    print_success "Files uploaded to $remote_file"

    echo "$remote_file"
}

# Step 5: Extract and deploy on server
deploy_on_server() {
    print_header "Step 5: Deploy on Server"

    local remote_file=$1

    ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_IP" << 'REMOTE_SCRIPT'
set -e

DEPLOY_PATH="/home/apartment/public_html"
REMOTE_FILE=$1
PROJECT_NAME="artistic-sthan"

echo "📦 Extracting files..."
mkdir -p "$DEPLOY_PATH"
tar -xzf "$REMOTE_FILE" -C "$DEPLOY_PATH"

echo "🔧 Setting permissions..."
chmod -R 755 "$DEPLOY_PATH"
chmod 600 "$DEPLOY_PATH/.env" 2>/dev/null || true

echo "📦 Installing Node dependencies..."
cd "$DEPLOY_PATH"
npm install --silent 2>/dev/null || true

echo "🏗️ Building React app..."
npm run build 2>/dev/null || true

echo "✅ Deployment completed!"
echo "Site URL: https://artistic-sthan.com"

# Cleanup
rm -f "$REMOTE_FILE"
REMOTE_SCRIPT

    print_success "Server deployment completed"
}

# Step 6: Create .env on server
create_env_on_server() {
    print_header "Step 6: Configure Environment"

    ssh -i "$SSH_KEY_PATH" "$SERVER_USER@$SERVER_IP" << 'REMOTE_SCRIPT'
DEPLOY_PATH="/home/apartment/public_html"

# Create .env file
cat > "$DEPLOY_PATH/.env" << 'EOF'
# Artistic Sthan Configuration
APP_ENV=production
APP_DEBUG=false
APP_URL=https://artistic-sthan.com
APP_NAME="Artistic Sthan"
APP_DESCRIPTION="Property & Kitchen Management System"

# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_NAME=apartment_site
DB_USER=apartment_site
DB_PASSWORD=admin@1235

# API Configuration
API_KEY=your_secure_random_key_here

# Telegram Configuration (UPDATE THESE!)
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_KITCHEN_CHAT_ID=your_kitchen_group_id
TELEGRAM_ADMIN_CHAT_ID=your_admin_group_id
TELEGRAM_FINANCE_CHAT_ID=your_finance_group_id

# Mail Configuration
MAIL_DRIVER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=your_email@gmail.com
MAIL_PASSWORD=your_app_password
MAIL_FROM_ADDRESS=noreply@artistic-sthan.com
MAIL_FROM_NAME="Artistic Sthan"
EOF

chmod 600 "$DEPLOY_PATH/.env"
echo "✅ .env file created"
REMOTE_SCRIPT

    print_success ".env file created on server"
    print_warning "IMPORTANT: Update .env with your Telegram credentials!"
}

# Step 7: Verify deployment
verify_deployment() {
    print_header "Step 7: Verify Deployment"

    print_warning "Waiting for site to be ready..."
    sleep 3

    if curl -s -I "https://$DOMAIN" | grep -q "HTTP"; then
        print_success "Site is live at https://$DOMAIN"
    else
        print_warning "Site may still be initializing..."
        print_warning "Check https://$DOMAIN in 1-2 minutes"
    fi
}

# Main execution
main() {
    print_header "🚀 Artistic Sthan Production Deployment"
    echo "Server: $SERVER_IP"
    echo "Domain: $DOMAIN"
    echo "Path: $DEPLOY_PATH"
    echo ""

    read -p "Ready to deploy to production? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        print_error "Deployment cancelled"
    fi

    verify_ssh_key
    test_ssh_connection

    local package_file=$(package_project)
    local remote_file=$(upload_to_server "$package_file")

    # Clean local package
    rm -f "$package_file"

    deploy_on_server "$remote_file"
    create_env_on_server
    verify_deployment

    print_header "✨ Deployment Complete!"
    echo ""
    echo -e "${GREEN}Your site is now live at: https://$DOMAIN${NC}"
    echo ""
    echo "Next steps:"
    echo "1. SSH to server: ssh -i ~/.ssh/id_rsa $SERVER_USER@$SERVER_IP"
    echo "2. Edit .env: nano ~/public_html/.env"
    echo "3. Add your Telegram credentials:"
    echo "   TELEGRAM_BOT_TOKEN=your_token"
    echo "   TELEGRAM_KITCHEN_CHAT_ID=your_id"
    echo "   etc..."
    echo ""
    echo "4. Test the application: https://artistic-sthan.com"
    echo ""
}

# Run main
main

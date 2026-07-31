#!/bin/bash

#################################################################################
# Artistic Sthan - Complete Deployment Script
# Domain: artistic-sthan.in
# Database: apartment_site
# Author: Claude
# Date: 2026-07-31
#################################################################################

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="artistic-sthan.in"
DB_NAME="apartment_site"
DB_USER="apartment_site"
DB_PASSWORD="admin@1235"
DB_HOST="localhost"
PROJECT_PATH="/var/www/artistic-sthan.in"
WEB_ROOT="$PROJECT_PATH/public"
SERVER_USER="www-data"
SERVER_GROUP="www-data"

# Functions
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
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "This script must be run as root"
        exit 1
    fi
    print_success "Running as root"
}

# Step 1: Update system
step_update_system() {
    print_header "Step 1: Update System"
    apt-get update
    apt-get upgrade -y
    print_success "System updated"
}

# Step 2: Install dependencies
step_install_dependencies() {
    print_header "Step 2: Install Dependencies"

    apt-get install -y \
        apache2 \
        apache2-utils \
        libapache2-mod-php8.1 \
        php8.1 \
        php8.1-cli \
        php8.1-fpm \
        php8.1-mysql \
        php8.1-mbstring \
        php8.1-xml \
        php8.1-curl \
        php8.1-gd \
        php8.1-zip \
        php-pear \
        mysql-server \
        curl \
        wget \
        git \
        certbot \
        python3-certbot-apache \
        nodejs \
        npm

    print_success "Dependencies installed"
}

# Step 3: Create directory structure
step_create_directories() {
    print_header "Step 3: Create Directory Structure"

    mkdir -p "$PROJECT_PATH"
    mkdir -p "$WEB_ROOT"
    mkdir -p "$PROJECT_PATH/logs"
    mkdir -p "$PROJECT_PATH/backups"

    print_success "Directories created"
}

# Step 4: Create .env file
step_create_env() {
    print_header "Step 4: Create .env File"

    cat > "$PROJECT_PATH/.env" << EOF
# Artistic Sthan Configuration
APP_ENV=production
APP_DEBUG=false
APP_URL=https://$DOMAIN
APP_NAME="Artistic Sthan"
APP_DESCRIPTION="Property & Kitchen Management System"

# Database Configuration
DB_HOST=$DB_HOST
DB_PORT=3306
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

# API Configuration
API_KEY=$(openssl rand -hex 32)

# Telegram Configuration
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
MAIL_FROM_ADDRESS=noreply@$DOMAIN
MAIL_FROM_NAME="Artistic Sthan"
EOF

    chmod 600 "$PROJECT_PATH/.env"
    print_success ".env file created (update with your Telegram & email credentials)"
}

# Step 5: Create database
step_create_database() {
    print_header "Step 5: Create Database"

    mysql -u root << EOF
CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
EOF

    print_success "Database created: $DB_NAME"
}

# Step 6: Configure Apache
step_configure_apache() {
    print_header "Step 6: Configure Apache VirtualHost"

    cat > "/etc/apache2/sites-available/$DOMAIN.conf" << 'EOF'
<VirtualHost *:80>
    ServerName DOMAIN_PLACEHOLDER
    ServerAlias www.DOMAIN_PLACEHOLDER
    ServerAdmin admin@DOMAIN_PLACEHOLDER

    DocumentRoot /var/www/DOMAIN_PLACEHOLDER/public

    # Redirect HTTP to HTTPS
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</VirtualHost>

<VirtualHost *:443>
    ServerName DOMAIN_PLACEHOLDER
    ServerAlias www.DOMAIN_PLACEHOLDER
    ServerAdmin admin@DOMAIN_PLACEHOLDER

    DocumentRoot /var/www/DOMAIN_PLACEHOLDER/public

    # SSL Configuration (will be added by Certbot)
    SSLEngine on

    # Security Headers
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"

    # Logging
    ErrorLog /var/log/apache2/DOMAIN_PLACEHOLDER-error.log
    CustomLog /var/log/apache2/DOMAIN_PLACEHOLDER-access.log combined

    # PHP Configuration
    <FilesMatch \.php$>
        SetHandler "proxy:unix:/run/php/php8.1-fpm.sock|fcgi://localhost"
    </FilesMatch>

    # Directory Configuration
    <Directory /var/www/DOMAIN_PLACEHOLDER/public>
        Options -Indexes
        AllowOverride All
        Require all granted

        # Rewrite Rules
        RewriteEngine On
        RewriteBase /
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule ^(.*)$ index.php?$1 [L,QSA]
    </Directory>

    # Deny access to sensitive files
    <FilesMatch "\.(env|json|sql)$">
        Require all denied
    </FilesMatch>
</VirtualHost>
EOF

    # Replace placeholders
    sed -i "s|DOMAIN_PLACEHOLDER|$DOMAIN|g" "/etc/apache2/sites-available/$DOMAIN.conf"

    # Enable modules and site
    a2enmod rewrite
    a2enmod ssl
    a2enmod headers
    a2enmod proxy
    a2enmod proxy_fcgi
    a2ensite "$DOMAIN.conf"

    # Disable default site
    a2dissite 000-default.conf || true

    # Test Apache config
    if apache2ctl configtest | grep -q "Syntax OK"; then
        systemctl restart apache2
        print_success "Apache configured and restarted"
    else
        print_error "Apache configuration error"
        exit 1
    fi
}

# Step 7: Enable SSL with Let's Encrypt
step_enable_ssl() {
    print_header "Step 7: Enable SSL with Let's Encrypt"

    print_warning "Make sure $DOMAIN DNS is pointing to this server first!"
    read -p "Press Enter when DNS is ready..."

    certbot --apache -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN"

    print_success "SSL certificate installed"
}

# Step 8: Set file permissions
step_set_permissions() {
    print_header "Step 8: Set File Permissions"

    chown -R "$SERVER_USER:$SERVER_GROUP" "$PROJECT_PATH"
    chmod -R 755 "$PROJECT_PATH"
    chmod 600 "$PROJECT_PATH/.env"
    chmod 755 "$PROJECT_PATH/logs" "$PROJECT_PATH/backups"

    print_success "Permissions set correctly"
}

# Step 9: Install Node dependencies
step_install_node_deps() {
    print_header "Step 9: Install Node Dependencies"

    cd "$PROJECT_PATH"
    npm install
    print_success "Node dependencies installed"
}

# Step 10: Build React app
step_build_app() {
    print_header "Step 10: Build React App"

    cd "$PROJECT_PATH"
    npm run build

    # Copy to web root
    cp -r dist/* "$WEB_ROOT/"
    chown -R "$SERVER_USER:$SERVER_GROUP" "$WEB_ROOT"

    print_success "App built and deployed"
}

# Step 11: Create cron jobs
step_setup_crons() {
    print_header "Step 11: Setup Cron Jobs"

    # License expiry checker
    (crontab -u "$SERVER_USER" -l 2>/dev/null; echo "0 8 * * * /usr/bin/php $PROJECT_PATH/php/cron/check_licenses.php >> $PROJECT_PATH/logs/license_checker.log 2>&1") | crontab -u "$SERVER_USER" -

    # Database backup (daily at 2 AM)
    (crontab -u root -l 2>/dev/null; echo "0 2 * * * mysqldump -u $DB_USER -p$DB_PASSWORD $DB_NAME > $PROJECT_PATH/backups/db_backup_\$(date +\%Y\%m\%d_\%H\%M\%S).sql") | crontab -u root -

    print_success "Cron jobs configured"
}

# Step 12: Create backup script
step_create_backup_script() {
    print_header "Step 12: Create Backup Script"

    cat > "$PROJECT_PATH/backup.sh" << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/www/artistic-sthan.in/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="apartment_site"
DB_USER="apartment_site"

# Database backup
mysqldump -u $DB_USER -p"$DB_PASSWORD" $DB_NAME > "$BACKUP_DIR/db_backup_$TIMESTAMP.sql"

# Files backup
tar -czf "$BACKUP_DIR/files_backup_$TIMESTAMP.tar.gz" \
    /var/www/artistic-sthan.in/src \
    /var/www/artistic-sthan.in/php \
    /var/www/artistic-sthan.in/.env

# Remove backups older than 30 days
find "$BACKUP_DIR" -name "*.sql" -mtime +30 -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $TIMESTAMP"
EOF

    chmod +x "$PROJECT_PATH/backup.sh"
    print_success "Backup script created"
}

# Step 13: Verification
step_verify() {
    print_header "Step 13: Verification"

    print_warning "Verifying installation..."

    # Check Apache
    if systemctl is-active --quiet apache2; then
        print_success "Apache is running"
    else
        print_error "Apache is not running"
    fi

    # Check MySQL
    if systemctl is-active --quiet mysql; then
        print_success "MySQL is running"
    else
        print_error "MySQL is not running"
    fi

    # Check database
    if mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SELECT 1" > /dev/null 2>&1; then
        print_success "Database connection successful"
    else
        print_error "Database connection failed"
    fi

    # Check files
    if [ -f "$PROJECT_PATH/.env" ]; then
        print_success ".env file exists"
    else
        print_error ".env file not found"
    fi
}

# Step 14: Summary
step_summary() {
    print_header "Deployment Complete! 🎉"

    echo -e "${GREEN}Your application is ready at: https://$DOMAIN${NC}\n"

    echo "Next steps:"
    echo "1. Update .env file with Telegram credentials:"
    echo "   nano $PROJECT_PATH/.env"
    echo ""
    echo "2. Test the application:"
    echo "   curl -I https://$DOMAIN"
    echo ""
    echo "3. View logs:"
    echo "   tail -f /var/log/apache2/$DOMAIN-error.log"
    echo ""
    echo "4. Check database:"
    echo "   mysql -u $DB_USER -p $DB_NAME"
    echo ""
    echo "Important files:"
    echo "  Config: $PROJECT_PATH/.env"
    echo "  Logs: /var/log/apache2/"
    echo "  Backups: $PROJECT_PATH/backups/"
    echo ""
}

# Main execution
main() {
    print_header "🚀 Artistic Sthan Deployment Script"
    echo "Domain: $DOMAIN"
    echo "Database: $DB_NAME"
    echo "Path: $PROJECT_PATH"
    echo ""

    read -p "Continue with deployment? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        print_error "Deployment cancelled"
        exit 0
    fi

    check_root
    step_update_system
    step_install_dependencies
    step_create_directories
    step_create_env
    step_create_database
    step_configure_apache
    step_enable_ssl
    step_set_permissions
    step_install_node_deps
    step_build_app
    step_setup_crons
    step_create_backup_script
    step_verify
    step_summary
}

# Run main
main

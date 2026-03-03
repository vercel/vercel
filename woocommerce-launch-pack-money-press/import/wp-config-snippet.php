<?php
/**
 * Money Press — wp-config.php additions
 *
 * INSTRUCTIONS:
 * Open wp-config.php on your Hostinger server (via hPanel File Manager or FTP).
 * Copy the constants below and paste them ABOVE the line that says:
 *   "That's all, stop editing! Happy publishing."
 *
 * Do NOT paste the <?php tag — it's already at the top of wp-config.php.
 */

// -----------------------------------------------
// MEMORY — WooCommerce needs more than the default 32MB
// -----------------------------------------------
define( 'WP_MEMORY_LIMIT', '256M' );
define( 'WP_MAX_MEMORY_LIMIT', '512M' );

// -----------------------------------------------
// SECURITY — Unique keys and salts
// Generate YOUR OWN at: https://api.wordpress.org/secret-key/1.1/salt/
// Replace the placeholder lines below entirely with the output from that URL.
// -----------------------------------------------
define( 'AUTH_KEY',         'REPLACE_WITH_GENERATED_VALUE' );
define( 'SECURE_AUTH_KEY',  'REPLACE_WITH_GENERATED_VALUE' );
define( 'LOGGED_IN_KEY',    'REPLACE_WITH_GENERATED_VALUE' );
define( 'NONCE_KEY',        'REPLACE_WITH_GENERATED_VALUE' );
define( 'AUTH_SALT',        'REPLACE_WITH_GENERATED_VALUE' );
define( 'SECURE_AUTH_SALT', 'REPLACE_WITH_GENERATED_VALUE' );
define( 'LOGGED_IN_SALT',   'REPLACE_WITH_GENERATED_VALUE' );
define( 'NONCE_SALT',       'REPLACE_WITH_GENERATED_VALUE' );

// -----------------------------------------------
// SECURITY — Force SSL for admin and logins
// Enable ONLY after your SSL certificate is active in hPanel
// -----------------------------------------------
define( 'FORCE_SSL_ADMIN', true );
define( 'FORCE_SSL_LOGIN', true );

// -----------------------------------------------
// FILE EDITS — Disable theme/plugin editor in WP admin (recommended for live stores)
// -----------------------------------------------
define( 'DISALLOW_FILE_EDIT', true );

// -----------------------------------------------
// AUTOSAVE & REVISIONS — Reduce database bloat
// -----------------------------------------------
define( 'AUTOSAVE_INTERVAL', 120 );   // seconds between autosaves (default 60)
define( 'WP_POST_REVISIONS', 5 );     // keep max 5 revisions per post

// -----------------------------------------------
// CRON — Use real server cron instead of WP pseudo-cron
// In hPanel → Advanced → Cron Jobs, add:
//   Command: php /home/yourusername/public_html/wp-cron.php
//   Schedule: Every 5 minutes (*/5 * * * *)
// Then uncomment the line below:
// -----------------------------------------------
// define( 'DISABLE_WP_CRON', true );

// -----------------------------------------------
// TRASH — Auto-empty trash every 30 days
// -----------------------------------------------
define( 'EMPTY_TRASH_DAYS', 30 );

// -----------------------------------------------
// WOOCOMMERCE — Prevent fatal errors from killing the whole page
// -----------------------------------------------
define( 'WC_LOG_HANDLER', 'WC_Log_Handler_File' );

// -----------------------------------------------
// DEBUG — Set to false on a live store
// -----------------------------------------------
define( 'WP_DEBUG', false );
define( 'WP_DEBUG_LOG', false );
define( 'WP_DEBUG_DISPLAY', false );

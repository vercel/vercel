<?php
mysqli_connect();
print('php_sapi_name=' . php_sapi_name() . PHP_EOL);
print('opcache_enabled=' . opcache_get_status()['opcache_enabled'] . PHP_EOL);

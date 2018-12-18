mkdir -p /root/app/modules
cp /usr/bin/php /root/app/php
cp /usr/sbin/php-fpm /root/app/php-fpm
cp /usr/lib64/php/modules/curl.so /root/app/modules/curl.so
cp /usr/lib64/php/modules/json.so /root/app/modules/json.so
cp /usr/lib64/php/modules/mbstring.so /root/app/modules/mbstring.so
cp /usr/lib64/php/modules/mysqli.so /root/app/modules/mysqli.so
cp /usr/lib64/mysql/libmysqlclient.so.16 /root/app/modules/libmysqlclient.so.16
cp /usr/lib64/php/modules/opcache.so /root/app/modules/opcache.so
rm -rf $(which php)
rm -rf $(which php-fpm)
rm -rf /usr/lib64/php
rm -rf /usr/lib64/mysql
rm -rf /etc/php.d
./php-fpm --help
./php -c php.ini test.php
echo "if you see 'can't connect to local mysql' - it is good - mysql library is found and used"
echo "if you see 'call to undefined function mysqli_connect' - it is bad - something went wrong"

rm -rf ../native
mkdir -p ../native/modules
docker rmi now-php-docker-image --force
docker build . -t now-php-docker-image
docker run now-php-docker-image
docker run now-php-docker-image /bin/cat /usr/sbin/php-fpm > ../native/php-fpm
docker run now-php-docker-image /bin/cat /root/app/php.ini > ../native/php.ini
docker run now-php-docker-image /bin/cat /root/app/php-fpm.ini > ../native/php-fpm.ini
docker run now-php-docker-image /bin/cat /usr/lib64/php/modules/curl.so > ../native/modules/curl.so
docker run now-php-docker-image /bin/cat /usr/lib64/php/modules/json.so > ../native/modules/json.so
docker run now-php-docker-image /bin/cat /usr/lib64/php/modules/mbstring.so > ../native/modules/mbstring.so
docker run now-php-docker-image /bin/cat /usr/lib64/php/modules/mysqli.so > ../native/modules/mysqli.so
docker run now-php-docker-image /bin/cat /usr/lib64/mysql/libmysqlclient.so.16 > ../native/modules/libmysqlclient.so.16
docker run now-php-docker-image /bin/cat /usr/lib64/php/modules/opcache.so > ../native/modules/opcache.so
chmod +x ../native/php-fpm

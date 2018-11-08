rm -rf ../dist
mkdir -p ../dist/modules
docker rmi go-php-builder --force
docker build . -t go-php-builder
docker run go-php-builder
docker run go-php-builder /bin/cat /root/go/app/launcher > ../dist/launcher
docker run go-php-builder /bin/cat /root/go/app/php.ini > ../dist/php.ini
docker run go-php-builder /bin/cat /usr/lib64/libphp7-7.1.so > ../dist/libphp7-7.1.so
docker run go-php-builder /bin/cat /usr/lib64/php/modules/curl.so > ../dist/modules/curl.so
docker run go-php-builder /bin/cat /usr/lib64/php/modules/json.so > ../dist/modules/json.so
docker run go-php-builder /bin/cat /usr/lib64/php/modules/mbstring.so > ../dist/modules/mbstring.so
chmod +x ../dist/launcher

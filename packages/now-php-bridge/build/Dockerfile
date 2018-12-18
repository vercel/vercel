FROM library/centos:6.8
RUN yum -y install wget git
RUN rpm -Uvh https://mirror.webtatic.com/yum/el6/latest.rpm
RUN yum -y install php71w-cli php71w-fpm php71w-mbstring php71w-mysql php71w-opcache
RUN yum -y install epel-release
RUN yum -y install patchelf

RUN mkdir -p /root/app/public

WORKDIR /root/app
COPY ./php.ini /root/app/php.ini
COPY ./php-fpm.ini /root/app/php-fpm.ini
COPY ./test.php /root/app/test.php
COPY ./test.sh /root/app/test.sh

RUN patchelf --set-rpath '$ORIGIN' /usr/bin/php
RUN patchelf --set-rpath '$ORIGIN' /usr/sbin/php-fpm
RUN patchelf --set-rpath '$ORIGIN' /usr/lib64/php/modules/mysqli.so

CMD ["/bin/bash", "test.sh"]

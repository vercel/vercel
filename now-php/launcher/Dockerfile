FROM library/centos:6.8
RUN yum -y install wget git
RUN rpm -Uvh https://mirror.webtatic.com/yum/el6/latest.rpm
RUN yum -y install php71w-cli php71w-devel php71w-embedded php71w-mbstring
RUN yum -y install epel-release
RUN yum -y install golang

RUN mkdir -p /root/go/app/public

RUN go get -v github.com/aws/aws-lambda-go/lambda
RUN go get -v github.com/aws/aws-lambda-go/events
RUN go get -v github.com/deuill/go-php

WORKDIR /root/go/app
COPY ./launcher.go /root/go/app/launcher.go
COPY ./php.ini /root/go/app/php.ini
COPY ./test.go /root/go/app/test.go
COPY ./test.php /root/go/app/public/test.php
COPY ./test.sh /root/go/app/test.sh

RUN GOOS=linux GOARCH=amd64 CGO_ENABLED=1 go build -o launcher launcher.go
RUN GOOS=linux GOARCH=amd64 CGO_ENABLED=1 go build -o test test.go

RUN strip launcher
RUN strip test

CMD ["/bin/bash", "test.sh"]

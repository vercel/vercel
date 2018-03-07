FROM mhart/alpine-node:latest

LABEL name "now-cli-dockerfile-test"

RUN mkdir /app
WORKDIR /app
COPY package.json /app
COPY yarn.lock /app
RUN yarn
COPY index.js /app

EXPOSE 3000
CMD ["yarn", "start"]

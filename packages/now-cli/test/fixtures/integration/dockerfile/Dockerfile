
  FROM mhart/alpine-node:latest

  LABEL name "now-cli-dockerfile-now-builders-ci-bot-255"

  RUN mkdir /app
  WORKDIR /app
  COPY package.json /app
  RUN yarn
  COPY index.js /app

  EXPOSE 3000
  CMD ["yarn", "start"]

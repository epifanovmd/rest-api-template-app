ARG NODE_VERSION=16.14.2

FROM node:${NODE_VERSION}

WORKDIR .
COPY . ./react-app

WORKDIR ./react-app

RUN yarn

EXPOSE 3232
EXPOSE 8181
CMD ["yarn", "server"]

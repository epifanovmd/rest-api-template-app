ARG NODE_VERSION=20.10.0

FROM node:${NODE_VERSION}

WORKDIR .
COPY . ./backend

WORKDIR ./backend

RUN yarn
RUN yarn build

EXPOSE 3232
EXPOSE 8181
CMD ["yarn", "server"]

ARG NODE_VERSION=16.14.2

FROM node:${NODE_VERSION}

WORKDIR .
COPY . ./backend

WORKDIR ./backend

RUN mkdir ./media

VOLUME /media

RUN yarn

EXPOSE 3232
EXPOSE 8181
CMD ["yarn", "server"]

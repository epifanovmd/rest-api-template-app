# WIREGUARD API

##### Stack:
  - Typescript
  - Koa
  - Tsoa (Swagger generator)
  

### Installation
```sh
$ git clone https://github.com/epifanovmd/rest-api-template-app.git
$ cd rest-api-template-app
$ yarn
```

### Run
```sh
$ yarn server
```
```sh
REST API Server running on : http://localhost:8181
```

### Run in docker container with postgres
```sh
$ [[ $(docker ps -f name=backend_container -q -a) != '' ]] && docker rm --force $(docker ps -f name=backend_container -q -a)
$ docker compose up -d --no-deps --build --force-recreate
$ docker image prune -a --force
```

License
----

MIT

**Free Software, Good Work!**

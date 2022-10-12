# REST-full API

##### Stack:
  - Typescript
  - Koa
  - Tsoa (Swagger generator)
  - Sequelize (ORM)
  - JWT
  - Postgre SQL
  - WebSocket
  

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
REST API Server running on : http://localhost:5000
```

### Start in docker container with postgres
```sh
$ docker compose -f compose-postgres.yml up --force-recreate -d
$
$ docker build -f Dockerfile -t backend:latest .
$ [[ $(docker ps -f name=backend_container -q -a) != '' ]] && docker rm --force $(docker ps -f name=backend_container -q -a)
$ docker run -u root -d --restart=always --network server-net -p 8085:8181 --name backend_container backend:latest
$ docker image prune -a --force
```

License
----

MIT

**Free Software, Good Work!**

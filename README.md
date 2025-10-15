# REST API TEMPLATE

##### Stack:
  - Typescript
  - Koa
  - Tsoa (Swagger generator)

# Настройка сервера

- ### Установка docker and docker-compose

```
sudo apt update
sudo apt install curl software-properties-common ca-certificates apt-transport-https -y
curl -f -s -S -L https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu jammy stable"
sudo apt update
apt-cache policy docker-ce
sudo apt install docker-ce -y
sudo systemctl status docker
sudo apt-get install docker-compose
```


- ### На стороне клинета
Создание ssh ключей и копирование на сервер
```
ssh-keygen -t rsa -b 4096 -C "ssh-comment" -f ssh_name
ssh-copy-id -i ~/.ssh/ssh_name.pub root@147.45.133.109  
```

- ### На стороне сервера

sudo nano /etc/ssh/sshd_config

```
+- PasswordAuthentication yes --> no

++ PubkeyAuthentication yes
++ ChallengeResponseAuthentication no

```
sudo systemctl reload ssh


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
$ bash start.sh
```

License
----

MIT

**Free Software, Good Work!**

const { workerData, parentPort } = require("worker_threads");

const {
  CommentsController,
} = require("./Services/Comments/CommentsController");
const { PostsController } = require("./Services/Posts/PostsController");
const { AuthController } = require("./Services/Users/AuthController");
const { UsersController } = require("./Services/Users/UsersController");

const controllers = {
  CommentsController,
  PostsController,
  AuthController,
  UsersController,
};

const { validatedArgs, controllerName, controllerMethod } = workerData;

const controller = new controllers[controllerName]();

controller[controllerMethod]
  .apply(controller, validatedArgs)
  .then(data => parentPort.postMessage(data));

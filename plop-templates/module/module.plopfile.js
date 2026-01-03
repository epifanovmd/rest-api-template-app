module.exports = plop => {
  plop.setGenerator("module", {
    description: "Создает module",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Введите название модуля:",
      },
    ],
    actions: [
      {
        type: "add",
        path: "src/modules/{{dashCase name}}/index.ts",
        templateFile: "plop-templates/module/index.ts.hbs",
      },
      {
        type: "add",
        path: "src/modules/{{dashCase name}}/{{dashCase name}}.controller.ts",
        templateFile: "plop-templates/module/module.controller.ts.hbs",
      },
      {
        type: "add",
        path: "src/modules/{{dashCase name}}/{{dashCase name}}.entity.ts",
        templateFile: "plop-templates/module/module.entity.ts.hbs",
      },
      {
        type: "add",
        path: "src/modules/{{dashCase name}}/{{dashCase name}}.service.ts",
        templateFile: "plop-templates/module/module.service.ts.hbs",
      },

      {
        type: "modify",
        path: "src/modules/index.ts",
        pattern: /(\/\/ EXPORT CONTROLLER HERE)/gi,
        template:
          // eslint-disable-next-line quotes
          'export { {{properCase name}}Controller } from "./{{dashCase name}}";\n$1',
      },

      {
        type: "modify",
        path: "src/app.controllers.ts",
        pattern: /(\/\/ EXPORT CONTROLLER HERE)/gi,
        template:
          // eslint-disable-next-line quotes
          "{{properCase name}}Controller,\n$1",
      },
    ],
  });
};

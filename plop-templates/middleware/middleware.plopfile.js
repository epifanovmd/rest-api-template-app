module.exports = plop => {
  plop.setGenerator("middleware", {
    description: "Создает middleware",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Введите название middleware:",
      },
    ],
    actions: [
      {
        type: "add",
        path: "src/middleware/{{dashCase name}}.middleware.ts",
        templateFile: "plop-templates/middleware/middleware.ts.hbs",
      },
      {
        type: "modify",
        path: "src/middleware/index.ts",
        pattern: /(\/\/ EXPORT MIDDLEWARE HERE)/gi,
        // eslint-disable-next-line quotes
        template: 'export * from "./{{dashCase name}}.middleware";\n$1',
      },
    ],
  });
};

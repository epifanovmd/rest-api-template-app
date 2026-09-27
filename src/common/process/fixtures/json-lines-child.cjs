// Дочерний процесс для тестов process-runner: режим — первый аргумент.
const readline = require("readline");

const mode = process.argv[2];
const emit = message => process.stdout.write(`${JSON.stringify(message)}\n`);

const runTask = () => {
  let input = "";

  process.stdin.on("data", chunk => {
    input += chunk;
  });
  process.stdin.on("end", () => {
    const data = input.trim() ? JSON.parse(input) : null;

    switch (mode) {
      case "ok":
        process.stderr.write("stderr line\n");
        process.stdout.write("not json\n");
        emit({ event: "progress", value: 0.5 });
        emit({ event: "result", data: { echo: data } });
        break;
      case "exit-code":
        emit({ event: "progress", value: 0.1 });
        process.stderr.write("boom happened\n");
        process.exit(3);
        break;
      case "error-event":
        emit({ event: "error", code: "BAD_INPUT", message: "плохой вход" });
        break;
      case "hang":
        setInterval(() => undefined, 1000);
        break;
      case "stubborn":
        process.on("SIGTERM", () => undefined);
        emit({ event: "progress", value: 0 });
        setInterval(() => undefined, 1000);
        break;
      default:
        process.exit(1);
    }
  });
};

const runWorker = () => {
  const rl = readline.createInterface({ input: process.stdin });
  const cancelled = new Set();

  rl.on("line", line => {
    const { id, task, params } = JSON.parse(line);

    switch (task) {
      case "hello":
        if (mode === "worker-silent") return;
        emit({ id, event: "result", data: { pid: process.pid } });
        break;
      case "echo":
        emit({ id, event: "result", data: params });
        break;
      case "slow":
        emit({ id, event: "progress", value: 0.5, text: "half" });
        setTimeout(() => {
          if (!cancelled.has(id)) emit({ id, event: "result", data: params });
        }, params.ms);
        break;
      case "cancel":
        cancelled.add(id);
        break;
      case "boom":
        emit({ id, event: "error", code: "BOOM", message: "упало" });
        break;
      case "crash":
        process.exit(7);
        break;
      default:
        emit({ id, event: "error", message: `unknown task ${task}` });
    }
  });
};

if (mode.startsWith("worker")) runWorker();
else runTask();

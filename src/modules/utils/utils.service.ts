import * as child_process from "child_process";

import { Injectable } from "../../core";

@Injectable()
export class UtilsService {
  isValidIPv4(str) {
    const blocks = str.split(".");

    if (blocks.length !== 4) {
      return false;
    }

    for (let value of blocks) {
      value = parseInt(value, 10);
      if (Number.isNaN(value)) {
        return false;
      }
      if (value < 0 || value > 255) {
        return false;
      }
    }

    return true;
  }

  exec(cmd: string): Promise<string> {
    if (process.platform !== "linux") {
      return Promise.resolve("");
    }

    return new Promise((resolve, reject) => {
      child_process.exec(
        cmd,
        {
          shell: "bash",
        },
        (err, stdout) => {
          if (err) {
            return reject(err);
          }

          return resolve(String(stdout).trim());
        },
      );
    });
  }
}

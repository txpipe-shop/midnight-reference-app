import * as fs from "fs";
import { createWriteStream } from "node:fs";
import * as path from "path";
import pino from "pino";
import pinoPretty from "pino-pretty";

export const createLogger = (logPath: string): pino.Logger => {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const pretty: pinoPretty.PrettyStream = pinoPretty({
    colorize: true,
    sync: true,
  });
  const level =
    process.env.DEBUG_LEVEL !== undefined &&
    process.env.DEBUG_LEVEL !== null &&
    process.env.DEBUG_LEVEL !== ""
      ? process.env.DEBUG_LEVEL
      : "info";
  return pino(
    {
      level,
      depthLimit: 20,
    },
    pino.multistream([
      { stream: pretty, level },
      { stream: createWriteStream(logPath), level },
    ]),
  );
};

import pino from "pino";

export function createLogger(level: string, pretty: boolean) {
  return pino({
    level,
    transport: pretty
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        }
      : undefined,
  });
}

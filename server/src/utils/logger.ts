/** Winston logger: colorized console in development, JSON in production. */

import winston from 'winston';

const isDevelopment = (process.env.NODE_ENV ?? 'development') === 'development';

const developmentFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    const metaRecord = meta as Record<string, unknown>;
    const keys = Object.keys(metaRecord).filter((key) => !key.startsWith('Symbol'));
    const metaStr =
      keys.length > 0 ? ` ${JSON.stringify(Object.fromEntries(keys.map((k) => [k, metaRecord[k]])))}` : '';
    return `${String(timestamp)} ${String(level)}: ${String(message)}${metaStr}`;
  }),
);

const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json(),
);

const logger = winston.createLogger({
  levels: winston.config.npm.levels,
  level: isDevelopment ? 'debug' : 'info',
  transports: [
    new winston.transports.Console({
      format: isDevelopment ? developmentFormat : productionFormat,
    }),
  ],
});

export default logger;

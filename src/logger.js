const { createLogger, format, transports } = require('winston');

const { 
  combine, timestamp, prettyPrint, colorize, align, printf,
} = format;

const logger = createLogger({
  transports: [
    new transports.Console(),
  ],
  format: combine(
    colorize(),
    prettyPrint(),
    timestamp(),
    align(),
    printf(info => `${info.timestamp} ${info.level}: ${info.message}`),
  ),
});

module.exports = logger;

import chalk from 'chalk';
import ora, { type Ora } from 'ora';

export interface Logger {
  info(message: string): void;
  verbose(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  spinner(message: string): Ora;
}

export function createLogger(verbose = false, noColor = false): Logger {
  if (noColor) {
    chalk.level = 0;
  }
  const c = chalk;

  return {
    info(message: string) {
      console.error(c.blue('ℹ'), message);
    },
    verbose(message: string) {
      if (verbose) {
        console.error(c.gray('⋮'), message);
      }
    },
    warn(message: string) {
      console.error(c.yellow('⚠'), message);
    },
    error(message: string) {
      console.error(c.red('✖'), message);
    },
    spinner(message: string) {
      return ora({ text: message, isSilent: false, isEnabled: !noColor });
    },
  };
}

import type { DwnServer } from './dwn-server.js';

export const gracefulShutdown = async (dwnServer: DwnServer): Promise<void> => {
  await dwnServer.stop();
  console.log('http server stopped.. exiting');
  process.exit(0);
};

export type ProcessHandlers = {
  unhandledRejectionHandler: (reason: any, promise: Promise<any>) => void,
  uncaughtExceptionHandler: (err: Error) => void,
  sigintHandler: () => Promise<void>,
  sigtermHandler: () => Promise<void>
};


export const setProcessHandlers = (dwnServer: DwnServer): ProcessHandlers => {
  const unhandledRejectionHandler = (reason: any, promise: Promise<any>): void => {
    console.error(
      `Unhandled promise rejection. Reason: ${reason}. Promise: ${JSON.stringify(
        promise,
      )}`,
    );
  };

  const uncaughtExceptionHandler = (err: Error): void => {
    console.error('Uncaught exception:', err.stack || err);
  };

  const sigintHandler = async (): Promise<void> => {
    console.log('exit signal received [SIGINT]. starting graceful shutdown');
    await gracefulShutdown(dwnServer);
  };

  const sigtermHandler = async (): Promise<void> => {
    console.log('exit signal received [SIGTERM]. starting graceful shutdown');
    await gracefulShutdown(dwnServer);
  };

  process.on('unhandledRejection', unhandledRejectionHandler);
  process.on('uncaughtException', uncaughtExceptionHandler);
  process.on('SIGINT', sigintHandler);
  process.on('SIGTERM', sigtermHandler);

  // Store handlers to be able to remove them later
  return {
    unhandledRejectionHandler,
    uncaughtExceptionHandler,
    sigintHandler,
    sigtermHandler
  };
};

export const unsetProcessHandlers = (handlers: ProcessHandlers): void => {
  const { 
    unhandledRejectionHandler, 
    uncaughtExceptionHandler, 
    sigintHandler, 
    sigtermHandler 
  } = handlers;

  process.removeListener('unhandledRejection', unhandledRejectionHandler);
  process.removeListener('uncaughtException', uncaughtExceptionHandler);
  process.removeListener('SIGINT', sigintHandler);
  process.removeListener('SIGTERM', sigtermHandler);
};
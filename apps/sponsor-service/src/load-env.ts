import { loadEnvFile } from 'node:process';

export const loadServiceEnv = () => {
  try {
    loadEnvFile(new URL('../.env', import.meta.url));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
};

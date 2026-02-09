import cors from 'cors';
import express from 'express';
import { config } from './config';
import router from './routes';

async function main() {
  const app = express();
  app.use(cors());

  app.use('/api', router);

  app.listen(config.PORT, () => {
    console.log(`Server is running on port ${config.PORT}`);
  });
}

main().catch(console.error);
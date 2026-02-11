import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import router from './routes/index.js';

async function main() {
  const app = express();
  app.use(cors());

  app.use('/api', router);

  app.listen(config.PORT, () => {
    console.log(`Server is running on port ${config.PORT}`);
  });
}

main().catch(console.error);
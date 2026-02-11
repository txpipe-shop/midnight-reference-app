import { Router } from 'express';
import { deploy } from './deploy.js';
import { getTrue } from './get-true.js';

// TODO: Improve (add) error handling
const router: Router = Router();

router.post('/deploy', async (req, res) => {
  try {
    const contractAddress = await deploy(req, res);
    res.status(201).json({ contractAddress });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("get-true", async (req, res) => {
  try {
    const trueResponse = await getTrue(req, res);
    res.status(200).json({ trueResponse });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
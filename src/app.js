import cors from 'cors';
import express from 'express';
import { rpcRouter } from './rpc-router.js';

export const app = express();

app.use(cors());

app.post('/', express.json({ type: '*/*' }), async (req, res) => {
  console.log(req.body);
  const result = await rpcRouter.handle(req.body, { transport: 'http' });

  return res.json(result);
});
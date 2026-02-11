import type { ContractAddress } from '@midnight-ntwrk/compact-runtime';
import type { ExampleContractProviders } from '@midnight-reference-app/contract';
import type { Request, Response } from 'express';
import { ExampleContract } from '../contract.js';

export async function getTrue(req: Request, res: Response) {
  const { providers, contractAddress }: { providers: ExampleContractProviders, contractAddress: ContractAddress } = req.body;
  const contract = await ExampleContract.join(providers, contractAddress);
  const trueResponse = await contract.returnTrue();
  return trueResponse;
}
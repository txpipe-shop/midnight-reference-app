import { ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { Request, Response } from 'express';
import { ExampleContract, ExampleContractProviders } from '../contract';

export async function getTrue(req: Request, res: Response) {
  const { providers, contractAddress }: { providers: ExampleContractProviders, contractAddress: ContractAddress } = req.body;
  const contract = await ExampleContract.join(providers, contractAddress);
  const trueResponse = await contract.returnTrue();
  return trueResponse;
}
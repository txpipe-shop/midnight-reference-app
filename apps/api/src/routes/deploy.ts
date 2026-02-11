import type { ExampleContractProviders } from '@midnight-reference-app/contract';
import type { Request, Response } from 'express';
import { ExampleContract } from "../contract.js";

export async function deploy(req: Request, res: Response) {
  const { providers }: { providers: ExampleContractProviders } = req.body;

  const contract = await ExampleContract.deploy(providers);
  const contractAddress = contract.deployedContractAddress;

  return contractAddress;
}

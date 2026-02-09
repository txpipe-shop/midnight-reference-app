import { Request, Response } from 'express';
import { ExampleContract, ExampleContractProviders } from "../contract";

export async function deploy(req: Request, res: Response) {
  const { providers }: { providers: ExampleContractProviders } = req.body;

  const contract = await ExampleContract.deploy(providers);
  const contractAddress = contract.deployedContractAddress;

  return contractAddress;
}

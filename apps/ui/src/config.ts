import { z } from 'zod';

export const MidnightNetworkSchema = z.enum(['undeployed', 'preview'], 'preprod');

export type MidnightNetwork = z.infer<typeof MidnightNetworkSchema>;

export const MIDNIGHT_NETWORK: MidnightNetwork = MidnightNetworkSchema.catch('undeployed').parse(
  import.meta.env.VITE_MN_NETWORK
);

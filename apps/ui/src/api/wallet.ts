import type { Configuration, ConnectedAPI, ConnectionStatus, InitialAPI } from "@midnight-ntwrk/dapp-connector-api";
import { pipe as fnPipe } from "fp-ts/function";
import { catchError, concatMap, filter, firstValueFrom, interval, map, take, throwError, timeout } from "rxjs";
import type { ShieldedAddress } from "../context/WalletContext";

const checkProofServerStatus = async (proofServerUri: string | undefined): Promise<boolean> => {
  try {
    if (!proofServerUri) return false;
    const response = await fetch(proofServerUri);
    return response.ok;
  } catch (error) {
    return false;
  }
};

export class MidnightBrowserWalletApi {
  private constructor(
    public initialAPI: InitialAPI | undefined,
    public connectedAPI: ConnectedAPI | undefined,
    public serviceUriConfig: Configuration | undefined,
    public status: ConnectionStatus | undefined,
    public shieldedAddresses: ShieldedAddress | undefined,
    public proofServerOnline: boolean,
  ) { }

  static async connectToWallet(): Promise<MidnightBrowserWalletApi> {
    return firstValueFrom(
      fnPipe(
        interval(100),
        map(() => window.midnight?.mnLace),
        filter((initialAPI): initialAPI is InitialAPI => !!initialAPI),
        take(1),
        timeout({
          first: 1_000,
          with: () =>
            throwError(() => new Error("Could not find wallet initial API"),
            ),
        }),
        concatMap(async (initialAPI) => { return { connectedAPI: await initialAPI.connect("undeployed"), initialAPI, }; }),
        catchError((e, apis) => e ? throwError(() => new Error("Application is not authorized")) : apis),
        concatMap(async ({ initialAPI, connectedAPI }) => {
          if (!connectedAPI) throw new Error("Connected API is undefined");

          const serviceUriConfig = await connectedAPI.getConfiguration();
          const status = await connectedAPI.getConnectionStatus();
          const shieldedAddresses = await connectedAPI.getShieldedAddresses();
          const proofServerOnline = await checkProofServerStatus(serviceUriConfig.proverServerUri,);

          return new MidnightBrowserWalletApi(
            initialAPI,
            connectedAPI,
            serviceUriConfig,
            status,
            shieldedAddresses,
            proofServerOnline,
          );
        }),
      )
    )
  }

  disconnect(): void {
    this.initialAPI = undefined;
    this.connectedAPI = undefined;
    this.serviceUriConfig = undefined;
    this.status = undefined;
    this.shieldedAddresses = undefined;
  }
}
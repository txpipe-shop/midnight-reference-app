import { useContext } from "react";
import { ProvidersContext, type ProvidersState } from "../context/ProvidersContext";

export const useProviders = (): ProvidersState | null => {
  const providerState = useContext(ProvidersContext);
  if (!providerState) {
    console.warn("[useProviders] not ready yet.");
    return null;
  }
  return providerState;
};

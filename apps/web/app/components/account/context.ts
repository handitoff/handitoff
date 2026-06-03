import type { Dispatch, SetStateAction } from "react";
import { useOutletContext } from "react-router";
import type {
  AccountUser,
  HandoffSession,
  ReceiveRequest,
  ReceiveSessionLive,
  ReceiveSettings,
} from "../../lib/account";

// Shared state for the account area. The layout owns it (so toggles and accepted
// requests persist across tab navigation); tabs read and mutate it through this
// hook. When the backend lands, the setters become fetchers / websocket sends.
export type AccountContextValue = {
  user: AccountUser;
  setUser: Dispatch<SetStateAction<AccountUser>>;
  receive: ReceiveSettings;
  setReceive: Dispatch<SetStateAction<ReceiveSettings>>;
  requests: ReceiveRequest[];
  setRequests: Dispatch<SetStateAction<ReceiveRequest[]>>;
  liveReceive: ReceiveSessionLive[];
  sessions: HandoffSession[];
};

export function useAccount(): AccountContextValue {
  return useOutletContext<AccountContextValue>();
}

import {
  Connection,
  wbinit,
  connect as wbconnect,
  KeyValuePairs,
  KeyValuePair,
  Key,
  Value,
  TransactionID,
  Handshake,
} from "worterbuch-js";
import React from "react";

type MaybeConnection = Connection | undefined;

export type Worterbuch = {
  connection: MaybeConnection;
  separator: string;
  wildcard: string;
  multiWildcard: string;
};

const wasm = wbinit();

export const WbContext = React.createContext<Worterbuch | undefined>(undefined);

function useWorterbuch(address: string): Worterbuch {
  const [wb, setWb] = React.useState<MaybeConnection>();
  const [separator, setSeparator] = React.useState<string>("/");
  const [wildcard, setWildcard] = React.useState<string>("?");
  const [multiWildcard, setMultiWildcard] = React.useState<string>("#");

  React.useEffect(() => {
    console.log("WASM init");
    wasm.then((wasm) => {
      console.log(wasm);
      console.log("Connecting to WS server...");
      const conn = wbconnect(address, true);
      conn.onclose = () => setWb(undefined);
      conn.onhandshake = (handshake: Handshake) => {
        console.log("Handshake complete.");
        setSeparator(handshake.separator);
        setWildcard(handshake.wildcard);
        setMultiWildcard(handshake.multiWildcard);
        setWb(conn);
      };
    });
  }, []);

  return {
    connection: wb,
    separator,
    wildcard,
    multiWildcard,
  };
}

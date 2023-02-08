import {
  connect as wbconnect,
  Connection,
  RequestPattern,
  Key,
  KeyValuePairs,
} from "worterbuch-js";
import React, { useEffect, useRef, useState } from "react";

const WbContext = React.createContext<WB>({
  connection: undefined,
  separator: "/",
  wildcard: "?",
  multiWildcard: "#",
  address: "ws://worterbuch.homelab/ws",
});

type WB = {
  connection: Connection | undefined;
  separator: string;
  wildcard: string;
  multiWildcard: string;
  address: string | undefined;
};

export type Config = {
  backendScheme: string;
  backendHost: string;
  backendPort: number | undefined;
  backendPath: string;
};

function useWorterbuch(
  address: string | undefined,
  automaticReconnect: boolean
): WB {
  const [conn, setConn] = React.useState<undefined | Connection>();
  const [separator, setSeparator] = React.useState<string>("/");
  const [wildcard, setWildcard] = React.useState<string>("?");
  const [multiWildcard, setMultiWildcard] = React.useState<string>("#");
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (address && (attempt === 0 || automaticReconnect)) {
      console.log("Connecting to worterbuch server at", address);
      const conn = wbconnect(address);
      conn.onclose = () => {
        console.error("Connection to worterbuch closed.");
        if (automaticReconnect) {
          console.log(`Trying to reconnect in 3 seconds ...`);
          setTimeout(() => setAttempt(attempt + 1), 3000);
        }
        setConn(undefined);
      };
      conn.onhandshake = (handshake) => {
        setSeparator(handshake.separator);
        setWildcard(handshake.wildcard);
        setMultiWildcard(handshake.multiWildcard);
        setConn(conn);
      };
    }
  }, [address, attempt, automaticReconnect]);

  return {
    connection: conn,
    separator,
    wildcard,
    multiWildcard,
    address,
  };
}

export type WorterbuchProps = {
  children: any;
  config: Config;
  automaticReconnect?: boolean;
  json: boolean;
};

export function Worterbuch({
  children,
  config,
  automaticReconnect,
}: WorterbuchProps) {
  const port = config.backendPort ? `:${config.backendPort}` : "";
  const address = config
    ? `${config.backendScheme}://${config.backendHost}${port}${config.backendPath}`
    : undefined;

  const wb = useWorterbuch(address, automaticReconnect || false);

  return <WbContext.Provider value={wb}>{children}</WbContext.Provider>;
}

export function useGet<T>(): (
  keySegments: string[],
  consumer: (value: T | undefined, deleted?: T) => void
) => void {
  const wb = React.useContext(WbContext);
  return (
    keySegments: string[],
    consumer: (value: T | undefined, deleted?: T) => void
  ) => {
    const key = keySegments.join(wb.separator);
    if (wb.connection) {
      wb.connection.get(key, (e) => consumer(e.value, e.deleted));
    }
  };
}

export function useDelete<T>(): (
  keySegments: string[],
  consumer?: (value: T | undefined) => void
) => void {
  const wb = React.useContext(WbContext);
  return (keySegments: string[], consumer?: (value: T | undefined) => void) => {
    const key = keySegments.join(wb.separator);
    if (wb.connection) {
      wb.connection.del(key, (e) => {
        if (consumer) {
          consumer(e.deleted);
        }
      });
    }
  };
}

export function useGetValue<T>(
  ...keySegments: string[]
): (consumer: (value: T | undefined, deleted?: T) => void) => void {
  const wb = React.useContext(WbContext);
  const key = useTopic(keySegments);
  return (consumer: (value: T | undefined, deleted?: T) => void) => {
    if (wb.connection) {
      wb.connection.get(key, (e) => consumer(e.value, e.deleted));
    }
  };
}

export function useDeleteKey<T>(
  ...keySegments: string[]
): (consumer: (value: T | undefined, deleted?: T) => void) => void {
  const wb = React.useContext(WbContext);
  const key = useTopic(keySegments);
  return (consumer: (value: T | undefined, deleted?: T) => void) => {
    if (wb.connection) {
      wb.connection.del(key, (e) => consumer(e.value, e.deleted));
    }
  };
}

export function useSubscribe<T>(...keySegments: string[]): T | undefined {
  const wb = React.useContext(WbContext);
  const [value, setValue] = React.useState<T | undefined>();
  const key = useTopic(keySegments);
  React.useEffect(() => {
    if (wb.connection) {
      const sub = wb.connection.subscribe(key, (e) => setValue(e.value));
      return () => {
        if (wb.connection) {
          wb.connection.unsubscribe(sub);
        }
      };
    }
  }, [key, wb.connection]);
  return value;
}

export function useSubscribeWithInitValue<T>(
  initialValue: T,
  ...keySegments: string[]
): T {
  const wb = React.useContext(WbContext);
  const [value, setValue] = React.useState<T>(initialValue);
  const key = useTopic(keySegments);
  React.useEffect(() => {
    if (wb.connection) {
      const sub = wb.connection.subscribe(key, (e) => setValue(e.value));
      return () => {
        if (wb.connection) {
          wb.connection.unsubscribe(sub);
        }
      };
    }
  }, [key, wb.connection]);
  return value;
}

export function usePSubscribe<T>(...keySegments: string[]) {
  const wb = React.useContext(WbContext);
  const key = useTopic(keySegments);
  const [values, update] = React.useReducer(
    (
      state: Map<Key, T>,
      event: { keyValuePairs?: KeyValuePairs; deleted?: KeyValuePairs }
    ) => {
      if (event.keyValuePairs) {
        event.keyValuePairs.forEach((kvp) => {
          state.set(kvp.key, kvp.value);
        });
      }
      if (event.deleted) {
        event.deleted.forEach((kvp) => {
          state.delete(kvp.key);
        });
      }
      return new Map(state);
    },
    new Map()
  );
  React.useEffect(() => {
    if (wb.connection) {
      const sub = wb.connection.pSubscribe(key, update);
      return () => {
        if (wb.connection) {
          wb.connection.unsubscribe(sub);
        }
      };
    }
  }, [key, wb.connection]);
  return values;
}

export function useTopic(segemnts: string[]): string {
  return segemnts.join("/");
}

export function useCreateTopic() {
  const separator = "/";
  return (...segemnts: string[]) => segemnts.join(separator);
}

export function useWorterbuchConnected(): [boolean, string | undefined] {
  const [connected, setConnected] = React.useState<boolean>(false);
  const wb = React.useContext(WbContext);
  React.useEffect(() => {
    setConnected(wb.connection !== undefined && wb.connection !== null);
  }, [wb.connection]);
  return [connected, wb.address];
}

export function useSet() {
  const wb = React.useContext(WbContext);
  return (keySegments: string[], value: any) => {
    const key = keySegments.join(wb.separator);
    return wb.connection?.set(key, value);
  };
}

export function useSetValue(...keySegemnts: string[]) {
  const wb = React.useContext(WbContext);
  const key = useTopic(keySegemnts);
  return (value: any) => wb.connection?.set(key, value);
}

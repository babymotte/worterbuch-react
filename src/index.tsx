import {
  connect as wbconnect,
  Worterbuch,
  Key,
  KeyValuePairs,
  Children,
  Value,
} from "worterbuch-js";
import React, { useEffect, useRef, useState } from "react";

const WbContext = React.createContext<WB>({
  connection: undefined,
  address: undefined,
});

type WB = {
  connection: Worterbuch | undefined;
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
  const [conn, setConn] = React.useState<undefined | Worterbuch>();
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!conn && address && (attempt === 0 || automaticReconnect)) {
      console.log("Connecting to worterbuch server at", address);
      wbconnect(address)
        .then((conn) => {
          conn.onclose = () => {
            console.error("Connection to worterbuch closed.");
            setConn(undefined);
            attemptReconnect(automaticReconnect, setAttempt);
          };
          setConn(conn);
        })
        .catch((e) => {
          console.error("Could not connect to server:", e);
          attemptReconnect(automaticReconnect, setAttempt);
        });
    }
  }, [address, attempt, automaticReconnect]);

  function attemptReconnect(
    automaticReconnect: boolean,
    setAttempt: (attempt: number) => void
  ) {
    if (automaticReconnect) {
      console.log("Trying to reconnect in 3 seconds ...");
      setTimeout(() => setAttempt(attempt + 1), 3000);
    }
  }

  return {
    connection: conn,
    address,
  };
}

export type WorterbuchProps = {
  children: any;
  config: Config;
  automaticReconnect?: boolean;
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

export function useGetLater(): (
  key: string,
  consumer: (value: Value | null) => void
) => void {
  const wb = React.useContext(WbContext);
  return (key: string, consumer: (value: Value | null) => void) => {
    if (wb.connection) {
      wb.connection.getAsync(key, consumer);
    }
  };
}

export function useGet<T>(
  key: string
): (consumer: (value: T | null) => void) => void {
  const wb = React.useContext(WbContext);
  return (consumer: (value: T | null) => void) => {
    if (wb.connection) {
      wb.connection.getAsync(key, (val) => consumer(val as T));
    }
  };
}

export function useDeleteLater(): (
  key: string,
  consumer?: (value: Value | null) => void
) => void {
  const wb = React.useContext(WbContext);
  return (key: string, consumer?: (value: Value | null) => void) => {
    if (wb.connection) {
      wb.connection.deleteAsync(key, consumer);
    }
  };
}

export function useDelete<T>(
  key: string
): (consumer: (value: T | null) => void) => void {
  const wb = React.useContext(WbContext);
  return (consumer: (value: T | null) => void) => {
    if (wb.connection) {
      wb.connection.deleteAsync(key, (val) => consumer(val as T));
    }
  };
}

export function useSubscribe<T>(key: string, initialValue?: T): T | null {
  const wb = React.useContext(WbContext);
  const [value, setValue] = React.useState<T | null>(
    initialValue === undefined ? null : initialValue
  );
  React.useEffect(() => {
    if (wb.connection) {
      const sub = wb.connection.subscribe(key, ({ value }) => {
        if (value !== undefined) {
          setValue(value as T);
        } else {
          setValue(null);
        }
      });
      return () => {
        if (wb.connection) {
          wb.connection.unsubscribe(sub);
        }
      };
    } else {
      setValue(null);
    }
  }, [key, wb.connection]);
  return value;
}

export function usePSubscribe<T>(key: string) {
  const wb = React.useContext(WbContext);
  const [values, update] = React.useReducer(
    (
      state: Map<Key, T>,
      event: { keyValuePairs?: KeyValuePairs; deleted?: KeyValuePairs }
    ) => {
      if (event.keyValuePairs) {
        event.keyValuePairs.forEach((kvp) => {
          state.set(kvp.key, kvp.value as T);
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

export function key(...segemnts: string[]): string {
  return segemnts.join("/");
}

export function useWorterbuchConnected(): [boolean, string | undefined] {
  const [connected, setConnected] = React.useState<boolean>(false);
  const wb = React.useContext(WbContext);
  React.useEffect(() => {
    setConnected(wb.connection !== undefined && wb.connection !== null);
  }, [wb.connection]);
  return [connected, wb.address];
}

export function useSetLater() {
  const wb = React.useContext(WbContext);
  return (key: string, value: Value) => {
    return wb.connection?.set(key, value);
  };
}

export function useSet(key: string) {
  const wb = React.useContext(WbContext);
  return (value: Value) => wb.connection?.set(key, value);
}

export function usePublishLater() {
  const wb = React.useContext(WbContext);
  return (key: string, value: Value) => {
    return wb.connection?.publish(key, value);
  };
}

export function usePublish(key: string) {
  const wb = React.useContext(WbContext);
  return (value: Value) => wb.connection?.publish(key, value);
}

export function useLsLater(): (
  parent: string,
  consumer: (children: Children) => void
) => void {
  const wb = React.useContext(WbContext);
  return (parent: string, consumer: (children: Children) => void) => {
    if (wb.connection) {
      wb.connection.lsAsync(parent, consumer);
    }
  };
}

export function useLs(
  parent: string
): (consumer: (children: Children) => void) => void {
  const wb = React.useContext(WbContext);
  return (consumer: (children: Children) => void) => {
    if (wb.connection) {
      wb.connection.lsAsync(parent, consumer);
    }
  };
}

export function useSubscribeLs(parent: string): Children {
  const wb = React.useContext(WbContext);
  const [children, setChildren] = React.useState<Children>([]);
  React.useEffect(() => {
    if (wb.connection) {
      const sub = wb.connection.subscribeLs(parent, setChildren);
      return () => {
        if (wb.connection) {
          wb.connection.unsubscribeLs(sub);
        }
      };
    }
  }, [parent, wb.connection]);
  return children;
}

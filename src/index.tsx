import {
  connect as wbconnect,
  Connection,
  Key,
  KeyValuePairs,
  Children,
} from "worterbuch-js";
import React, { useEffect, useRef, useState } from "react";

const WbContext = React.createContext<WB>({
  connection: undefined,
  address: undefined,
});

type WB = {
  connection: Connection | undefined;
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
          console.log("connected now, updating connection");
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

export function useGet<T>(): (
  keySegments: string[],
  consumer: (value: T | undefined, deleted?: T) => void
) => void {
  const wb = React.useContext(WbContext);
  return (
    keySegments: string[],
    consumer: (value: T | undefined, deleted?: T) => void
  ) => {
    const key = keySegments.join("/");
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
    const key = keySegments.join("/");
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
    } else {
      setValue(undefined);
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
    } else {
      setValue(initialValue);
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
  return (...segemnts: string[]) => segemnts.join("/");
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
    const key = keySegments.join("/");
    return wb.connection?.set(key, value);
  };
}

export function useSetValue(...keySegemnts: string[]) {
  const wb = React.useContext(WbContext);
  const key = useTopic(keySegemnts);
  return (value: any) => wb.connection?.set(key, value);
}

export function usePublish() {
  const wb = React.useContext(WbContext);
  return (keySegments: string[], value: any) => {
    const key = keySegments.join("/");
    return wb.connection?.publish(key, value);
  };
}

export function usePublishValue(...keySegemnts: string[]) {
  const wb = React.useContext(WbContext);
  const key = useTopic(keySegemnts);
  return (value: any) => wb.connection?.publish(key, value);
}

export function useLs() {
  const wb = React.useContext(WbContext);
  return (parentSegments: string[]) => {
    const parent = parentSegments.join("/");
    return wb.connection?.ls(parent);
  };
}

export function useSubscribeLs(...parentSegments: string[]): Children {
  const wb = React.useContext(WbContext);
  const [children, setChildren] = React.useState<Children>([]);
  const parent = useTopic(parentSegments);
  React.useEffect(() => {
    if (wb.connection) {
      const sub = wb.connection.subscribeLs(parent, (e) =>
        setChildren(e.children)
      );
      return () => {
        if (wb.connection) {
          wb.connection.unsubscribeLs(sub);
        }
      };
    }
  }, [parent, wb.connection]);
  return children;
}

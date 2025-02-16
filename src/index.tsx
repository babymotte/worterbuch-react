/*
 * Copyright 2024 Michael Bachmann
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* eslint-disable react-refresh/only-export-components */

import {
  connect as wbconnect,
  Worterbuch,
  Key,
  KeyValuePairs,
  Children,
  Value,
  KeyValuePair,
  PStateEvent,
  RequestPattern,
  TransactionID,
} from "worterbuch-js";
import React from "react";

export { Value, ValueObject, Children } from "worterbuch-js";

export enum ConnectionState {
  NoServerSelected = "NO_SERVER_SELECTED",
  Connecting = "CONNECTING",
  CouldNotConnect = "COULD_NOT_CONNECT",
  Connected = "CONNECTED",
  Disconnected = "DISCONNECTED",
}

export enum ConnectionStatus {
  Warning = "WARNING",
  Error = "ERROR",
  Ok = "OK",
}

const WbContext = React.createContext<WB>({
  connection: undefined,
  address: undefined,
  state: ConnectionState.Disconnected,
  status: ConnectionStatus.Error,
  publishStreams: new Map(),
});

type WB = {
  connection: Worterbuch | undefined;
  address: string | undefined;
  state: ConnectionState;
  status: ConnectionStatus;
  publishStreams: Map<string, TransactionID>;
};

export type Config = {
  backendScheme: string;
  backendAddress: [string, number?][];
  backendPath: string;
  backendAuthToken?: string;
};

function useWorterbuch(
  config: Config,
  automaticReconnect: boolean,
  clientName: string | undefined
): WB {
  const [conn, setConn] = React.useState<undefined | Worterbuch>();
  const [attempt, setAttempt] = React.useState(0);
  const [{ state, status }, setStatusSummary] = React.useState<{
    state: ConnectionState;
    status: ConnectionStatus;
  }>({
    state: ConnectionState.Disconnected,
    status: ConnectionStatus.Error,
  });

  const pubSRef = React.useRef(new Map());

  const address = config.backendAddress.map(
    ([host, port]) =>
      `${config.backendScheme}://${host}:${port || 80}${config.backendPath}`
  );
  const authtoken = config.backendAuthToken;

  const attemptReconnect = React.useCallback(() => {
    if (automaticReconnect) {
      console.log(`Trying to reconnect in 3 seconds …`);
      setTimeout(() => setAttempt(attempt + 1), 3000);
    }
  }, [attempt, automaticReconnect]);

  React.useEffect(() => {
    if (!conn && address && (attempt === 0 || automaticReconnect)) {
      console.log("Connecting to worterbuch server at", address);
      setStatusSummary({
        state: ConnectionState.Connecting,
        status: ConnectionStatus.Warning,
      });
      pubSRef.current.clear();
      wbconnect(address, authtoken)
        .then((conn) => {
          conn.onclose = () => {
            console.error("Connection to worterbuch closed.");
            setConn(undefined);
            setStatusSummary({
              state: ConnectionState.Disconnected,
              status: ConnectionStatus.Error,
            });
            attemptReconnect();
          };
          setConn(conn);
          setStatusSummary({
            state: ConnectionState.Connected,
            status: ConnectionStatus.Ok,
          });
        })
        .catch((e) => {
          console.error("Could not connect to server:", e);
          setStatusSummary({
            state: ConnectionState.CouldNotConnect,
            status: ConnectionStatus.Error,
          });
          attemptReconnect();
        });
    }

    return () => {
      if (conn) {
        console.log("Closing worterbuch connection.");
        setStatusSummary({
          state: ConnectionState.Disconnected,
          status: ConnectionStatus.Error,
        });
        conn.close();
        setConn(undefined);
      }
    };
  }, [address, attempt, attemptReconnect, authtoken, automaticReconnect, conn]);

  React.useEffect(() => {
    if (conn && clientName) {
      conn.setClientName(clientName);
    }
  }, [conn, clientName]);

  return {
    connection: conn,
    address: conn?.serverAddress,
    state,
    status,
    publishStreams: pubSRef.current,
  };
}

export type WorterbuchProps = {
  children: JSX.Element | JSX.Element[];
  config: Config;
  automaticReconnect?: boolean;
  clientName?: string;
};

export function Worterbuch({
  children,
  config,
  automaticReconnect,
  clientName,
}: WorterbuchProps) {
  const wb = useWorterbuch(config, automaticReconnect || false, clientName);

  return <WbContext.Provider value={wb}>{children}</WbContext.Provider>;
}

export function useGetLater<T extends Value>(): (
  key: string
) => Promise<T | undefined> {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (key: string) => {
      if (wb.connection) {
        return wb.connection.get<T>(key);
      }
      return Promise.resolve(undefined);
    },
    [wb.connection]
  );
}

export function useGet<T extends Value>(
  key: string
): () => Promise<T | undefined> {
  const wb = React.useContext(WbContext);
  return React.useCallback(() => {
    if (wb.connection) {
      return wb.connection.get<T>(key);
    }
    return Promise.resolve(undefined);
  }, [wb.connection, key]);
}

export function useSPubInit(key: string) {
  const wb = React.useContext(WbContext);
  if (!wb.publishStreams.has(key)) {
    wb.connection?.sPubInit(key).then((tid) => {
      wb.publishStreams.set(key, tid);
    });
  }
}

export function useSPub(key: string): (value: Value) => void {
  const wb = React.useContext(WbContext);
  const tid = wb.publishStreams.get(key);
  return (value: Value) => {
    if (tid != null) {
      wb.connection?.sPub(tid, value);
    }
  };
}

export function useSPubLater(): (key: string, value: Value) => void {
  const wb = React.useContext(WbContext);
  return (key: string, value: Value) => {
    const tid = wb.publishStreams.get(key);
    if (tid != null) {
      wb.connection?.sPub(tid, value);
    }
  };
}

export function useGetOnce<T extends Value>(key: string): T | undefined {
  const wb = React.useContext(WbContext);
  const [value, setValue] = React.useState<T | undefined>(undefined);
  React.useEffect(() => {
    if (wb.connection) {
      wb.connection
        .get<T>(key)
        .then((val) => setValue(val as T))
        .catch(() => setValue(undefined));
    }
  }, [wb.connection, key]);
  return value;
}

export function usePGetLater<T extends Value>(): (
  pattern: string
) => Promise<KeyValuePairs<T> | undefined> {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (pattern: RequestPattern) => {
      if (wb.connection) {
        return wb.connection.pGet<T>(pattern);
      }
      return Promise.resolve(undefined);
    },
    [wb.connection]
  );
}

export function usePGet<T extends Value>(
  pattern: RequestPattern
): () => Promise<KeyValuePairs<T> | undefined> {
  const wb = React.useContext(WbContext);
  return React.useCallback(() => {
    if (wb.connection) {
      return wb.connection.pGet<T>(pattern);
    }
    return Promise.resolve(undefined);
  }, [wb.connection, pattern]);
}

export function usePGetOnce<T extends Value>(
  pattern: RequestPattern
): KeyValuePairs<T> | undefined {
  const wb = React.useContext(WbContext);
  const [kvps, setKvps] = React.useState<KeyValuePairs<T> | undefined>(
    undefined
  );
  React.useEffect(() => {
    if (wb.connection) {
      wb.connection
        .pGet<T>(pattern)
        .then((kvps) => setKvps(kvps))
        .catch(() => setKvps(undefined));
    }
  }, [wb.connection, pattern]);
  return kvps;
}

export function useDeleteLater<T extends Value>(): (
  key: string
) => Promise<Value | undefined> {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (key: string) => {
      if (wb.connection) {
        return wb.connection.delete<T>(key);
      }
      return Promise.resolve(undefined);
    },
    [wb.connection]
  );
}

export function useDelete<T extends Value>(
  key: string
): () => Promise<Value | undefined> {
  const wb = React.useContext(WbContext);
  return React.useCallback(() => {
    if (wb.connection) {
      return wb.connection.delete<T>(key);
    }
    return Promise.resolve(undefined);
  }, [wb.connection, key]);
}

export function usePDeleteLater<T extends Value>(): (
  pattern: string,
  quiet?: boolean
) => Promise<KeyValuePair<T>[] | undefined> {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (pattern: string, quiet?: boolean) => {
      if (wb.connection) {
        return wb.connection.pDelete<T>(pattern, quiet);
      }
      return Promise.resolve(undefined);
    },
    [wb.connection]
  );
}

export function usePDelete<T extends Value>(
  pattern: string,
  quiet?: boolean
): () => void {
  const wb = React.useContext(WbContext);
  return React.useCallback(() => {
    if (wb.connection) {
      wb.connection.pDelete<T>(pattern, quiet);
    }
  }, [wb.connection, pattern, quiet]);
}

export function useSubscribe<T extends Value>(
  key: string,
  initialValue?: T,
  unique?: boolean,
  liveOnly?: boolean
): T | undefined {
  const wb = React.useContext(WbContext);
  const [value, setValue] = React.useState<T | undefined>(initialValue);
  React.useEffect(() => {
    const conn = wb.connection;
    if (conn) {
      const sub = conn.subscribe<T>(
        key,
        ({ value }) => {
          setValue(value);
        },
        unique,
        liveOnly
      );
      return () => {
        if (conn) {
          conn.unsubscribe(sub);
        }
      };
    } else {
      setValue(undefined);
    }
  }, [key, liveOnly, unique, wb.connection]);
  return value;
}

type PSubState<T> = {
  values: Map<Key, T>;
  pattern: string;
};

export function usePSubscribe<T extends Value>(
  pattern: string,
  unique?: boolean,
  liveOnly?: boolean
) {
  const wb = React.useContext(WbContext);
  const [state, update] = React.useReducer(
    (state: PSubState<T>, event: [string, PStateEvent<T>]) => {
      if (event[0] !== state.pattern) {
        state.values.clear();
        state.pattern = event[0];
      }
      if (event[1].keyValuePairs) {
        event[1].keyValuePairs.forEach((kvp) => {
          state.values.set(kvp.key, kvp.value);
        });
      }
      if (event[1].deleted) {
        event[1].deleted.forEach((kvp) => {
          state.values.delete(kvp.key);
        });
      }
      return { ...state };
    },
    { values: new Map(), pattern: "" }
  );
  React.useEffect(() => {
    const conn = wb.connection;
    if (conn) {
      const sub = conn.pSubscribe<T>(
        pattern,
        (e) => update([pattern, e]),
        unique,
        liveOnly
      );
      return () => {
        if (conn) {
          conn.unsubscribe(sub);
        }
      };
    }
  }, [pattern, liveOnly, unique, wb.connection]);
  return state.values;
}

export function key(...segemnts: string[]): string {
  return segemnts.join("/");
}

export function useWorterbuchConnected(): [
  boolean,
  string | undefined,
  ConnectionStatus,
  ConnectionState
] {
  const wb = React.useContext(WbContext);
  return [
    wb.connection !== undefined && wb.connection !== null,
    wb.address,
    wb.status,
    wb.state,
  ];
}

export function useSetLater<T extends Value>() {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (key: string, value: T) => {
      return wb.connection?.set<T>(key, value);
    },
    [wb.connection]
  );
}

export function useSet<T extends Value>(key: string) {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (value: T) => wb.connection?.set<T>(key, value),
    [wb.connection, key]
  );
}

export function usePublishLater<T extends Value>() {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (key: string, value: T) => {
      return wb.connection?.publish<T>(key, value);
    },
    [wb.connection]
  );
}

export function usePublish<T extends Value>(key: string) {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (value: T) => wb.connection?.publish<T>(key, value),
    [wb.connection, key]
  );
}

export function useLsLater(): (
  parent: string | undefined
) => Promise<Children | undefined> {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (parent: string | undefined) => {
      if (wb.connection) {
        return wb.connection.ls(parent);
      }
      return Promise.resolve(undefined);
    },
    [wb.connection]
  );
}

export function usePLsLater(): (
  parentPattern: string | undefined
) => Promise<Children | undefined> {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (parentPattern: string | undefined) => {
      if (wb.connection) {
        return wb.connection.pLs(parentPattern);
      }
      return Promise.resolve(undefined);
    },
    [wb.connection]
  );
}

export function useLs(
  parent: string | undefined
): () => Promise<Children | undefined> {
  const wb = React.useContext(WbContext);
  return React.useCallback(() => {
    if (wb.connection) {
      return wb.connection.ls(parent);
    }
    return Promise.resolve(undefined);
  }, [wb.connection, parent]);
}

export function usePLs(
  parentPattern: string | undefined
): () => Promise<Children | undefined> {
  const wb = React.useContext(WbContext);
  return React.useCallback(() => {
    if (wb.connection) {
      return wb.connection.pLs(parentPattern);
    }
    return Promise.resolve(undefined);
  }, [wb.connection, parentPattern]);
}

export function useLsOnce(parent: string | undefined): string[] {
  const wb = React.useContext(WbContext);
  const [children, setChildren] = React.useState<string[]>([]);
  React.useEffect(() => {
    if (wb.connection) {
      wb.connection.ls(parent).then(setChildren);
    }
  }, [wb.connection, parent]);
  return children;
}

export function usePLsOnce(parentPattern: string | undefined): string[] {
  const wb = React.useContext(WbContext);
  const [children, setChildren] = React.useState<string[]>([]);
  React.useEffect(() => {
    if (wb.connection) {
      wb.connection.pLs(parentPattern).then(setChildren);
    }
  }, [wb.connection, parentPattern]);
  return children;
}

export function useSubscribeLs(parent: string | undefined): Children {
  const wb = React.useContext(WbContext);
  const [children, setChildren] = React.useState<Children>([]);
  React.useEffect(() => {
    const conn = wb.connection;
    if (conn) {
      const sub = conn.subscribeLs(parent, setChildren);
      return () => {
        if (conn) {
          conn.unsubscribeLs(sub);
        }
      };
    }
  }, [parent, wb.connection]);
  return children;
}

export function useLastWill<T extends Value>(): Promise<
  KeyValuePairs<T> | undefined
> {
  const wb = React.useContext(WbContext);
  return wb.connection?.lastWill<T>() || Promise.resolve(undefined);
}

export function useGraveGoods(): Promise<string[] | undefined> {
  const wb = React.useContext(WbContext);
  return wb.connection?.graveGoods() || Promise.resolve(undefined);
}

export function useSetLastWill<T extends Value>(lastWill: KeyValuePairs<T>) {
  const wb = React.useContext(WbContext);
  React.useEffect(() => {
    wb.connection?.setLastWill<T>(lastWill);
  }, [lastWill, wb.connection]);
}

export function useSetLastWillLater<T extends Value>() {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (lastWill: KeyValuePairs<T>) => wb.connection?.setLastWill<T>(lastWill),
    [wb.connection]
  );
}

export function useSetClientName(clientName: string) {
  const wb = React.useContext(WbContext);
  React.useEffect(() => {
    wb.connection?.setClientName(clientName);
  }, [clientName, wb.connection]);
}

export function useSetClientNamelLater() {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (clientName: string) => wb.connection?.setClientName(clientName),
    [wb.connection]
  );
}

export function useSetGraveGoods(graveGoods: string[]) {
  const wb = React.useContext(WbContext);
  React.useEffect(() => {
    wb.connection?.setGraveGoods(graveGoods);
  }, [graveGoods, wb.connection]);
}

export function useSetGraveGoodsLater() {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (graveGoods: string[]) => wb.connection?.setGraveGoods(graveGoods),
    [wb.connection]
  );
}

export function useWbState<T extends Value>(key: string, initialValue?: T) {
  const wb = React.useContext(WbContext);

  const [state, setState] = React.useState<T | undefined>(initialValue);
  const [connected, setConnected] = React.useState(false);

  React.useEffect(() => {
    const conn = wb.connection;
    if (!connected) {
      conn?.get<T>(key).then((v) => {
        if (!connected && v === undefined) {
          conn?.set(key, initialValue || null);
        }
      });
    }
  }, [connected, initialValue, key, wb.connection]);

  React.useEffect(() => {
    const conn = wb.connection;
    const tid = conn?.cached()?.subscribe<T>(key, (value: T | undefined) => {
      setState(value);
      setConnected(true);
    });
    return () => {
      if (tid !== undefined) {
        conn?.unsubscribe(tid);
      }
    };
  }, [key, wb.connection]);

  React.useEffect(() => {
    if (connected) {
      if (state === undefined) {
        wb.connection?.cached()?.delete(key);
      } else {
        wb.connection?.cached()?.set(key, state);
      }
    }
  }, [connected, key, state, wb.connection]);

  return [state, setState];
}

export function useRawWbClient() {
  return React.useContext(WbContext).connection;
}

export function useExpireCache(maxAge: number, interval?: number) {
  const wb = React.useContext(WbContext);
  wb.connection?.cached()?.expire(maxAge, interval);
}

export function useCachedGet<T extends Value>(
  key: string
): () => Promise<T | undefined> {
  const wb = React.useContext(WbContext);
  return React.useCallback(() => {
    if (wb.connection) {
      return wb.connection.cached().get(key);
    }
    return Promise.resolve(undefined);
  }, [wb.connection, key]);
}

export function useCachedGetLater<T extends Value>(): (
  key: string
) => Promise<T | undefined> {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (key: string) => {
      if (wb.connection) {
        return wb.connection.cached().get(key);
      }
      return Promise.resolve(undefined);
    },
    [wb.connection]
  );
}

export function useCachedSet<T extends Value>(key: string): (value: T) => void {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (value: T) => {
      if (wb.connection) {
        wb.connection.cached().set<T>(key, value);
      }
    },
    [wb.connection, key]
  );
}

export function useCachedSetLater<T extends Value>(): (
  key: string,
  value: T
) => void {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (key: string, value: T) => {
      if (wb.connection) {
        wb.connection.cached().set<T>(key, value);
      }
    },
    [wb.connection]
  );
}

export function useCachedSubscribe<T extends Value>(
  key: string,
  initialValue?: T
): T | undefined {
  const wb = React.useContext(WbContext);
  const [value, setValue] = React.useState<T | undefined>(initialValue);
  React.useEffect(() => {
    const conn = wb.connection;
    if (conn) {
      const sub = conn.cached().subscribe<T>(key, (v: T | undefined) => {
        setValue(v);
      });
      return () => {
        if (conn) {
          conn.unsubscribe(sub);
        }
      };
    } else {
      setValue(undefined);
    }
  }, [key, wb.connection]);
  return value;
}

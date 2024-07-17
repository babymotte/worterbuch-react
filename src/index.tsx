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

import {
  connect as wbconnect,
  Worterbuch,
  Key,
  KeyValuePairs,
  Children,
  Value,
} from "worterbuch-js";
import React from "react";

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
});

type WB = {
  connection: Worterbuch | undefined;
  address: string | undefined;
  state: ConnectionState;
  status: ConnectionStatus;
};

export type Config = {
  backendScheme: string;
  backendHost: string;
  backendPort?: number;
  backendPath: string;
  backendAuthToken?: string;
};

function useWorterbuch(
  address: string | undefined,
  automaticReconnect: boolean,
  authtoken: string | undefined,
  keepaliveTimeout: number | undefined,
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

  const attemptReconnect = React.useCallback(() => {
    if (automaticReconnect) {
      console.log(`Trying to reconnect in 3 seconds …`);
      setTimeout(() => setAttempt(attempt + 1), 3000);
    }
  }, [attempt]);

  React.useEffect(() => {
    if (!conn && address && (attempt === 0 || automaticReconnect)) {
      console.log("Connecting to worterbuch server at", address);
      setStatusSummary({
        state: ConnectionState.Connecting,
        status: ConnectionStatus.Warning,
      });
      wbconnect(address, authtoken, keepaliveTimeout)
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
  }, [
    address,
    attempt,
    attemptReconnect,
    authtoken,
    automaticReconnect,
    conn,
    keepaliveTimeout,
  ]);

  React.useEffect(() => {
    if (conn && clientName) {
      conn.setClientName(clientName);
    }
  }, [conn, clientName]);

  return {
    connection: conn,
    address,
    state,
    status,
  };
}

export type WorterbuchProps = {
  children: any;
  config: Config;
  automaticReconnect?: boolean;
  keepaliveTimeout?: number;
  clientName?: string;
};

export function Worterbuch({
  children,
  config,
  automaticReconnect,
  keepaliveTimeout,
  clientName,
}: WorterbuchProps) {
  const port = config.backendPort ? `:${config.backendPort}` : "";
  const address = config
    ? `${config.backendScheme}://${config.backendHost}${port}${config.backendPath}`
    : undefined;
  const authToken = config.backendAuthToken;

  const wb = useWorterbuch(
    address,
    automaticReconnect || false,
    authToken,
    keepaliveTimeout,
    clientName
  );

  return <WbContext.Provider value={wb}>{children}</WbContext.Provider>;
}

export function useGetLater(): (
  key: string,
  consumer: (value: Value | null) => void
) => void {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (key: string, consumer: (value: Value | null) => void) => {
      if (wb.connection) {
        wb.connection.get(key).then(consumer);
      }
    },
    [wb.connection]
  );
}

export function useGet<T>(
  key: string
): (consumer: (value: T | null) => void) => void {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (consumer: (value: T | null) => void) => {
      if (wb.connection) {
        wb.connection.get(key).then((val) => consumer(val as T));
      }
    },
    [wb.connection, key]
  );
}

export function useGetOnce<T>(key: string): T | null {
  const wb = React.useContext(WbContext);
  const [value, setValue] = React.useState<T | null>(null);
  React.useEffect(() => {
    if (wb.connection) {
      wb.connection
        .get(key)
        .then((val) => setValue(val as T))
        .catch(() => setValue(null));
    }
  }, [wb.connection, key]);
  return value;
}

export function useDeleteLater(): (
  key: string,
  consumer?: (value: Value | null) => void
) => void {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (key: string, consumer?: (value: Value | null) => void) => {
      if (wb.connection) {
        wb.connection.delete(key).then(consumer);
      }
    },
    [wb.connection]
  );
}

export function useDelete<T>(
  key: string
): (consumer: (value: T | null) => void) => void {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (consumer: (value: T | null) => void) => {
      if (wb.connection) {
        wb.connection.delete(key).then((val) => consumer(val as T));
      }
    },
    [wb.connection, key]
  );
}

export function usePDeleteLater(): (key: string) => void {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (key: string) => {
      if (wb.connection) {
        wb.connection.pDelete(key);
      }
    },
    [wb.connection]
  );
}

export function usePDelete(key: string): () => void {
  const wb = React.useContext(WbContext);
  return React.useCallback(() => {
    if (wb.connection) {
      wb.connection.pDelete(key);
    }
  }, [wb.connection, key]);
}

export function useSubscribe<T>(
  key: string,
  initialValue?: T,
  unique?: boolean,
  liveOnly?: boolean
): T | null {
  const wb = React.useContext(WbContext);
  const [value, setValue] = React.useState<T | null>(
    initialValue === undefined ? null : initialValue
  );
  React.useEffect(() => {
    if (wb.connection) {
      const sub = wb.connection.subscribe(
        key,
        ({ value }) => {
          if (value !== undefined) {
            setValue(value as T);
          } else {
            setValue(null);
          }
        },
        unique,
        liveOnly
      );
      return () => {
        if (wb.connection) {
          wb.connection.unsubscribe(sub);
        }
      };
    } else {
      setValue(null);
    }
  }, [key, liveOnly, unique, wb.connection]);
  return value;
}

export function usePSubscribe<T>(
  key: string,
  unique?: boolean,
  liveOnly?: boolean
) {
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
      const sub = wb.connection.pSubscribe(key, update, unique, liveOnly);
      return () => {
        if (wb.connection) {
          wb.connection.unsubscribe(sub);
        }
      };
    }
  }, [key, liveOnly, unique, wb.connection]);
  return values;
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

export function useSetLater() {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (key: string, value: Value) => {
      return wb.connection?.set(key, value);
    },
    [wb.connection]
  );
}

export function useSet(key: string) {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (value: Value) => wb.connection?.set(key, value),
    [wb.connection, key]
  );
}

export function usePublishLater() {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (key: string, value: Value) => {
      return wb.connection?.publish(key, value);
    },
    [wb.connection]
  );
}

export function usePublish(key: string) {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (value: Value) => wb.connection?.publish(key, value),
    [wb.connection, key]
  );
}

export function useLsLater(): (
  parent: string | undefined,
  consumer: (children: Children) => void
) => void {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (parent: string | undefined, consumer: (children: Children) => void) => {
      if (wb.connection) {
        wb.connection.ls(parent).then(consumer);
      }
    },
    [wb.connection]
  );
}

export function usePLsLater(): (
  parentPattern: string | undefined,
  consumer: (children: Children) => void
) => void {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (
      parentPattern: string | undefined,
      consumer: (children: Children) => void
    ) => {
      if (wb.connection) {
        wb.connection.pLs(parentPattern).then(consumer);
      }
    },
    [wb.connection]
  );
}

export function useLs(
  parent: string | undefined
): (consumer: (children: Children) => void) => void {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (consumer: (children: Children) => void) => {
      if (wb.connection) {
        wb.connection.ls(parent).then(consumer);
      }
    },
    [wb.connection, parent]
  );
}

export function usePLs(
  parentPattern: string | undefined
): (consumer: (children: Children) => void) => void {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (consumer: (children: Children) => void) => {
      if (wb.connection) {
        wb.connection.pLs(parentPattern).then(consumer);
      }
    },
    [wb.connection, parent]
  );
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
  }, [wb.connection, parent]);
  return children;
}

export function useSubscribeLs(parent: string | undefined): Children {
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

export function useLastWill(): Promise<KeyValuePairs | undefined> {
  const wb = React.useContext(WbContext);
  return wb.connection?.lastWill() || Promise.resolve(undefined);
}

export function useGraveGoods(): Promise<string[] | undefined> {
  const wb = React.useContext(WbContext);
  return wb.connection?.graveGoods() || Promise.resolve(undefined);
}

export function useSetLastWill(lastWill: KeyValuePairs) {
  const wb = React.useContext(WbContext);
  React.useEffect(() => {
    wb.connection?.setLastWill(lastWill);
  }, [wb.connection]);
}

export function useSetLastWillLater() {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (lastWill: KeyValuePairs) => wb.connection?.setLastWill(lastWill),
    [wb.connection]
  );
}

export function useSetClientName(clientName: string) {
  const wb = React.useContext(WbContext);
  React.useEffect(() => {
    wb.connection?.setClientName(clientName);
  }, [wb.connection]);
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
  }, [wb.connection]);
}

export function useSetGraveGoodsLater() {
  const wb = React.useContext(WbContext);
  return React.useCallback(
    (graveGoods: string[]) => wb.connection?.setGraveGoods(graveGoods),
    [wb.connection]
  );
}

export function useWbState<T>(
  key: string,
  initialValue?: T,
  unique?: boolean,
  liveOnly?: boolean
) {
  const state = useSubscribe<T>(key, initialValue, unique, liveOnly);
  const setState = useSet(key);
  return [state, setState];
}

export function useRawWbClient() {
  return React.useContext(WbContext).connection;
}

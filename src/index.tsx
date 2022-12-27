import {
  wbinit,
  connect as wbconnect,
  Connection,
  RequestPattern,
  Key,
  KeyValuePairs,
} from "worterbuch-js";
import React from "react";

const wasm = wbinit();

const WbContext = React.createContext<WB>({
  connection: undefined,
  separator: "/",
  wildcard: "?",
  multiWildcard: "#",
  json: true,
  address: "ws://worterbuch.homelab/ws",
});

type WB = {
  connection: Connection | undefined;
  separator: string;
  wildcard: string;
  multiWildcard: string;
  json: boolean;
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
  automaticReconnect: boolean,
  json: boolean
): WB {
  const [conn, setConn] = React.useState<undefined | Connection>();
  const [separator, setSeparator] = React.useState<string>("/");
  const [wildcard, setWildcard] = React.useState<string>("?");
  const [multiWildcard, setMultiWildcard] = React.useState<string>("#");
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    wasm.then(() => {
      if (address && (attempt === 0 || automaticReconnect)) {
        console.log("Connecting to worterbuch server at", address);
        const conn = wbconnect(address, json);
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
    });
  }, [address, attempt, automaticReconnect, json]);

  return {
    connection: conn,
    separator,
    wildcard,
    multiWildcard,
    json,
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
  json,
  config,
  automaticReconnect,
}: WorterbuchProps) {
  const port = config.backendPort ? `:${config.backendPort}` : "";
  const address = config
    ? `${config.backendScheme}://${config.backendHost}${port}${config.backendPath}`
    : undefined;

  const wb = useWorterbuch(address, automaticReconnect || false, json);

  return <WbContext.Provider value={wb}>{children}</WbContext.Provider>;
}

export function useGet<T>(): (
  keySegments: string[],
  consumer: (value: T) => void
) => void {
  const wb = React.useContext(WbContext);
  return (keySegments: string[], consumer: (value: T) => void) => {
    const key = keySegments.join(wb.separator);
    if (wb.connection) {
      wb.connection.get(key, consumer);
    }
  };
}

export function useGetValue<T>(
  ...keySegments: string[]
): (consumer: (value: T) => void) => void {
  const wb = React.useContext(WbContext);
  const key = useTopic(keySegments);
  return (consumer: (value: T) => void) => {
    if (wb.connection) {
      wb.connection.get(key, consumer);
    }
  };
}

export function useSubscribe<T>(...keySegments: string[]): T | undefined {
  const wb = React.useContext(WbContext);
  const [value, setValue] = React.useState<T | undefined>();
  const key = useTopic(keySegments);
  React.useEffect(() => {
    if (wb.connection) {
      const sub = wb.connection.subscribe(key, setValue);
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
      const sub = wb.connection.subscribe(key, setValue);
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
    (state: Map<Key, T>, kvps: KeyValuePairs) => {
      kvps.forEach((kvp) => {
        state.set(kvp.key, kvp.value);
      });
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

export function useSubKeys(...patternSegemnts: string[]) {
  const pattern = useTopic(patternSegemnts);
  const tree = useTree(pattern);
  const subKeys: string[][] = [];
  expand(tree, [], subKeys);
  return subKeys;
}

function expand(
  subtree: Map<string, Map<string, any>>,
  path: string[],
  paths: string[][]
) {
  if (subtree.size === 0) {
    paths.push(path);
  } else {
    subtree.forEach((childTree, segment) =>
      expand(childTree, [...path, segment], paths)
    );
  }
}

export function useTree(...patternSegemnts: string[]) {
  const pattern = useTopic(patternSegemnts);
  const wb = React.useContext(WbContext);

  const [tree, update] = React.useReducer(
    (state: Map<Key, any>, kvps: KeyValuePairs) => {
      let changed = false;
      kvps.forEach((kvp) => {
        const split = kvp.key.split(wb.separator);
        const head = split.shift();
        if (head) {
          changed = merge(head, split, state) || changed;
        }
      });
      if (changed) {
        return new Map(state);
      } else {
        return state;
      }
    },
    new Map()
  );

  React.useEffect(() => {
    if (wb.connection) {
      const sub = wb.connection.pSubscribe(pattern, update);
      return () => {
        if (wb.connection) {
          wb.connection.unsubscribe(sub);
        }
      };
    }
  }, [pattern, wb.connection, wb.separator]);

  return tree;
}

function merge(key: string, tail: string[], map: Map<string, any>): boolean {
  let changed = false;
  let child = map.get(key);
  if (!child) {
    changed = true;
    child = new Map();
    map.set(key, child);
  }

  const head = tail.shift();
  if (head) {
    changed = merge(head, tail, child) || changed;
  }

  return changed;
}

export function useSeparator(): string {
  const wb = React.useContext(WbContext);
  return wb.separator;
}

export function useWildcard(): string {
  const wb = React.useContext(WbContext);
  return wb.wildcard;
}

export function useMultiWildcard(): string {
  const wb = React.useContext(WbContext);
  return wb.multiWildcard;
}

export function useTopic(segemnts: string[]): string {
  return segemnts.join(useSeparator());
}

export function useCreateTopic() {
  const separator = useSeparator();
  return (...segemnts: string[]) => segemnts.join(separator);
}

export function useWorterbuchConnected() {
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

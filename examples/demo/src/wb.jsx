import { wbinit, connect as wbconnect } from "worterbuch-js";
import React from "react";

const wasm = wbinit();

const WbContext = React.createContext(undefined);

function useWorterbuch(address, json) {
  const [conn, setConn] = React.useState();
  const [separator, setSeparator] = React.useState("/");
  const [wildcard, setWildcard] = React.useState("?");
  const [multiWildcard, setMultiWildcard] = React.useState("#");

  React.useEffect(() => {
    wasm.then(() => {
      const conn = wbconnect(address, json);
      conn.onclose = () => setConn(undefined);
      conn.onhandshake = (handshake) => {
        setSeparator(handshake.separator);
        setWildcard(handshake.wildcard);
        setMultiWildcard(handshake.multiWildcard);
        setConn(conn);
      };
    });
  }, [address, json]);

  return {
    connection: conn,
    separator,
    wildcard,
    multiWildcard,
  };
}

export function Worterbuch({ address, children }) {
  const wb = useWorterbuch(address);

  return <WbContext.Provider value={wb}>{children}</WbContext.Provider>;
}

export function useSubscribe(key) {
  const wb = React.useContext(WbContext);
  const [value, setValue] = React.useState();
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

export function usePSubscribe(key) {
  const wb = React.useContext(WbContext);
  const mapRef = React.useRef(new Map());
  const [values, setValues] = React.useState();
  React.useEffect(() => {
    if (wb.connection) {
      const sub = wb.connection.pSubscribe(key, (kvps) => {
        kvps.forEach((kvp) => {
          mapRef.current.set(kvp.key, kvp.value);
        });
        setValues(new Map(mapRef.current));
      });
      return () => {
        if (wb.connection) {
          wb.connection.unsubscribe(sub);
        }
      };
    }
  }, [key, wb.connection]);
  return values;
}

export function useSubKeys(pattern) {
  const tree = useTree(pattern);
  const subKeys = [];
  expand(tree, [], subKeys);
  return subKeys;
}

function expand(subtree, path, paths) {
  if (subtree.size === 0) {
    paths.push(path);
  } else {
    subtree.forEach((childTree, segment) =>
      expand(childTree, [...path, segment], paths)
    );
  }
}

export function useTree(pattern) {
  const wb = React.useContext(WbContext);
  const mapRef = React.useRef(new Map());
  const [tree, setTree] = React.useState(new Map());

  React.useEffect(() => {
    if (wb.connection) {
      const sub = wb.connection.pSubscribe(pattern, (kvps) => {
        let changed = false;
        kvps.forEach((kvp) => {
          const split = kvp.key.split(wb.separator);
          changed |= merge(split.shift(), split, mapRef.current);
        });
        if (changed) {
          setTree(new Map(mapRef.current));
        }
      });
      return () => {
        if (wb.connection) {
          wb.connection.unsubscribe(sub);
        }
      };
    }
  }, [pattern, wb.connection, wb.separator]);

  return tree;
}

function merge(key, tail, map) {
  let changed = false;
  let child = map.get(key);
  if (!child) {
    changed = true;
    child = new Map();
    map.set(key, child);
  }

  if (tail.length > 0) {
    changed |= merge(tail.shift(), tail, child);
  }

  return changed;
}

export function useSeparator() {
  const wb = React.useContext(WbContext);
  return wb.separator;
}

import React from "react";
import { useCachedSubscribe, useSubscribe, useWbState } from "worterbuch-react";

function App() {
  const uptime = useSubscribe<number>("$SYS/uptime");

  const [counter, setCounter] = useWbState<number>(
    "worterbuch-react/demo/state",
    0
  );

  const hello = useCachedSubscribe("hello");

  return (
    <div className="App">
      <div>$SYS/uptime: {uptime}</div>
      <div>
        <div>Counter: {`${counter}`}</div>
        <div>
          <button
            onClick={() =>
              (
                setCounter as React.Dispatch<
                  React.SetStateAction<number | undefined>
                >
              )((v: number | undefined) => (v ? v + 1 : 1))
            }
          >
            +
          </button>
        </div>
        <div>Hello {`${hello}`}</div>
      </div>
    </div>
  );
}

export default App;

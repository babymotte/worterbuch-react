import { useSubscribe } from "worterbuch-react";

function App() {
  const uptime = useSubscribe<number>("$SYS/uptime");
  return <div className="App">$SYS/uptime: {uptime}</div>;
}

export default App;

import Value from "./Value";
import { useSeparator, useSubKeys } from "./wb";

export default function Values({ prefix }) {
  const separator = useSeparator();
  const paths = useSubKeys(prefix);
  const values = paths
    .map((p) => p.join(separator))
    .map((p) => <Value wbkey={p} key={p} />);

  return <div>{values}</div>;
}

import { Welcome } from "../welcome/welcome";

export function meta() {
  return [
    { title: "handitoff.io" },
    { name: "description", content: "Move files between your devices in the browser." },
  ];
}

export default function Home() {
  return <Welcome />;
}

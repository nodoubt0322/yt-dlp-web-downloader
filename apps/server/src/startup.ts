export function formatListenUrl(host: string, port: number) {
  const displayHost = host === "0.0.0.0" || host === "::" ? "localhost" : host;
  const normalizedHost = displayHost.includes(":") && !displayHost.startsWith("[") ? `[${displayHost}]` : displayHost;

  return `http://${normalizedHost}:${port}`;
}

import { networkInterfaces } from "node:os";
import { NextResponse } from "next/server";

function privateIpv4() {
  return Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .find((entry) => {
      if (entry.internal || entry.family !== "IPv4") return false;
      return (
        entry.address.startsWith("10.") ||
        entry.address.startsWith("192.168.") ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(entry.address)
      );
    })?.address;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const hostname = requestUrl.hostname;
  if (!["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname)) {
    return NextResponse.json({ origin: requestUrl.origin });
  }
  const address = privateIpv4();
  const port = requestUrl.port ? `:${requestUrl.port}` : "";
  return NextResponse.json({
    origin: address ? `${requestUrl.protocol}//${address}${port}` : requestUrl.origin,
  });
}

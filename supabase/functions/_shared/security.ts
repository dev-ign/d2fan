export interface Claims {
  actionId?: string;
  scope:
    | "operator_test"
    | "reward"
    | "measurement"
    | "capture"
    | "status"
    | "access"
    | "confirm"
    | "unsubscribe";
  sub: string;
  artist: string;
  exp: number;
  iat: number;
}
const encoder = new TextEncoder();
const b64 = (data: Uint8Array) =>
  btoa(String.fromCharCode(...data))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const bytes = (value: string) =>
  Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
async function key(secret: string) {
  if (secret.length < 32) throw new Error("token_configuration");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function signToken(claims: Claims, secret: string) {
  const data = b64(encoder.encode(JSON.stringify(claims)));
  return `${data}.${b64(new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(data))))}`;
}
export async function verifyToken(
  token: unknown,
  scope: Claims["scope"],
  artist: string,
  secret: string,
): Promise<Claims> {
  if (typeof token !== "string" || token.length > 2000)
    throw new Error("unauthorized");
  try {
    const [data, signature, extra] = token.split(".");
    if (
      extra ||
      !data ||
      !signature ||
      !(await crypto.subtle.verify(
        "HMAC",
        await key(secret),
        bytes(signature),
        encoder.encode(data),
      ))
    )
      throw new Error();
    const claims = JSON.parse(new TextDecoder().decode(bytes(data))) as Claims;
    if (
      claims.scope !== scope ||
      claims.artist !== artist ||
      typeof claims.sub !== "string" ||
      claims.exp <= Date.now() / 1000 ||
      claims.iat > Date.now() / 1000 + 30
    )
      throw new Error();
    return claims;
  } catch {
    throw new Error("unauthorized");
  }
}
export async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

import { AxiosError, AxiosHeaders } from "axios";
import pino from "pino";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { REDACT_PATHS, serializeErr } from "./logger";

const SECRET = "s3cret-app-secret";
const TOKEN = "EAAB-long-lived-token";

function metaError(): AxiosError {
  const config = {
    method: "get",
    url: `https://graph.facebook.com/v25.0/oauth/access_token?client_secret=${SECRET}&code=abc`,
    params: { client_secret: SECRET, access_token: TOKEN },
    headers: new AxiosHeaders({ Authorization: `Bearer ${TOKEN}` }),
    data: JSON.stringify({ access_token: TOKEN }),
  };
  return new AxiosError("Request failed with status code 400", "ERR_BAD_REQUEST", config, {}, {
    status: 400,
    statusText: "Bad Request",
    headers: {},
    config,
    data: { error: { message: "Invalid OAuth access token", code: 190 } },
  });
}

function capture(): { log: pino.Logger; output: () => string } {
  let out = "";
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      out += chunk.toString();
      cb();
    },
  });
  const log = pino({ serializers: { err: serializeErr }, redact: { paths: REDACT_PATHS, censor: "[redacted]" } }, stream);
  return { log, output: () => out };
}

describe("serializeErr", () => {
  it("keeps status, path and provider error but drops secrets from axios errors", () => {
    const s = serializeErr(metaError());
    const text = JSON.stringify(s);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(TOKEN);
    expect(s).toMatchObject({
      status: 400,
      method: "get",
      url: "https://graph.facebook.com/v25.0/oauth/access_token",
      data: { error: { code: 190 } },
    });
  });

  it("serializes plain errors normally", () => {
    expect(serializeErr(new Error("boom"))).toMatchObject({ type: "Error", message: "boom" });
  });

  it.each([["a string"], [42], [null], [undefined]])("passes through non-errors: %j", (v) => {
    expect(serializeErr(v)).toBe(v);
  });
});

describe("logger output", () => {
  it("never writes Meta secrets when an axios error is logged", () => {
    const { log, output } = capture();
    log.error({ err: metaError() }, "meta call failed");
    expect(output()).toContain("meta call failed");
    expect(output()).not.toContain(SECRET);
    expect(output()).not.toContain(TOKEN);
  });

  it("redacts secrets logged by key", () => {
    const { log, output } = capture();
    log.info({ appSecret: SECRET, conn: { accessToken: TOKEN } }, "x");
    expect(output()).not.toContain(SECRET);
    expect(output()).not.toContain(TOKEN);
  });
});

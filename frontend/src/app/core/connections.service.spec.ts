import { HttpErrorResponse } from "@angular/common/http";
import { apiErrorMessage, syncRefusedMessage } from "./connections.service";

const httpError = (status: number, error: unknown) => new HttpErrorResponse({ status, error });

describe("syncRefusedMessage", () => {
  it("returns the server message for a 429", () => {
    expect(syncRefusedMessage(httpError(429, { error: "sync_cooldown", message: "Try again in 20 seconds." }))).toBe(
      "Try again in 20 seconds.",
    );
  });

  it("falls back to a generic message when a 429 has no body", () => {
    expect(syncRefusedMessage(httpError(429, null))).toMatch(/Try again/);
  });

  it.each([[httpError(500, { message: "x" })], [httpError(0, null)], [new Error("boom")], [undefined]])(
    "returns null for other failures: %#",
    (err) => {
      expect(syncRefusedMessage(err)).toBeNull();
    },
  );
});

describe("apiErrorMessage", () => {
  it("prefers message over error code", () => {
    expect(apiErrorMessage(httpError(400, { error: "invalid_sync_window", message: "since can't be in the future" }))).toBe(
      "since can't be in the future",
    );
  });

  it("falls back to the error code", () => {
    expect(apiErrorMessage(httpError(400, { error: "app_secret_required" }))).toBe("app_secret_required");
  });

  it.each([[httpError(400, "plain text")], [httpError(400, null)], [new Error("x")]])("returns null without a JSON body: %#", (err) => {
    expect(apiErrorMessage(err)).toBeNull();
  });
});

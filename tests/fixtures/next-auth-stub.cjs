// ABOUTME: Provides controllable NextAuth stub for route testing.
// ABOUTME: Captures last received options and handler for assertions.
let lastOptions;
let lastHandler;

function resetNextAuthStub() {
  lastOptions = undefined;
  lastHandler = undefined;
}

function NextAuth(options) {
  lastOptions = options;
  const handler =
    typeof global.__NEXT_AUTH_HANDLER__ === "function"
      ? global.__NEXT_AUTH_HANDLER__
      : () => undefined;

  lastHandler = handler;
  return handler;
}

NextAuth.default = NextAuth;
NextAuth.__getLastOptions = () => lastOptions;
NextAuth.__getLastHandler = () => lastHandler;
NextAuth.__reset = resetNextAuthStub;

module.exports = NextAuth;

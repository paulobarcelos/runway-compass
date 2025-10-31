// ABOUTME: Verifies MoneyInput component behavior via DOM interactions.
/* eslint-disable @typescript-eslint/no-require-imports */
require("./helpers/setup-dom.cjs");
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const React = require("react");
const { act } = require("react");
const { createRoot } = require("react-dom/client");
const tsnode = require("ts-node");
const tsconfigPaths = require("tsconfig-paths");
const tsconfig = require("../tsconfig.json");

const Module = require("module");
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "@/components/currency/base-currency-context") {
    return require("./helpers/stubs/base-currency-context.tsx");
  }

  return originalLoad(request, parent, isMain);
};

process.on("exit", () => {
  Module._load = originalLoad;
});

tsnode.register({
  transpileOnly: true,
  project: path.resolve(__dirname, "../tsconfig.json"),
  compilerOptions: {
    module: "commonjs",
    jsx: "react-jsx",
    moduleResolution: "node",
  },
});

tsconfigPaths.register({
  baseUrl: path.resolve(__dirname, ".."),
  paths: tsconfig.compilerOptions?.paths ?? {},
});

const {
  BaseCurrencyProvider,
  __setBaseCurrencyTestValue,
  __resetBaseCurrencyTestValue,
} = require("./helpers/stubs/base-currency-context.tsx");

beforeEach(() => {
  __resetBaseCurrencyTestValue();
});

async function renderMoneyInput(props) {
  const { MoneyInput } = require("../src/components/money-input/money-input");

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(
        BaseCurrencyProvider,
        null,
        React.createElement(MoneyInput, props),
      ),
    );
  });

  return {
    container,
    rerender(nextProps) {
      return act(async () => {
        root.render(
          React.createElement(
            BaseCurrencyProvider,
            null,
            React.createElement(MoneyInput, nextProps),
          ),
        );
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    },
  };
}

function createEvent(element, type, init) {
  const win = element?.ownerDocument?.defaultView ?? globalThis;
  const EventCtor = win?.Event ?? Event;
  return new EventCtor(type, { bubbles: true, cancelable: true, ...init });
}

function changeInput(element, value, eventName = "input") {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
  const event = createEvent(element, eventName);
  element.dispatchEvent(event);
}

test("renders amount and currency controls", async () => {
  __setBaseCurrencyTestValue({
    baseCurrency: "USD",
    availableCurrencies: ["USD", "EUR"],
  });

  const instance = await renderMoneyInput({
    id: "deposit",
    label: "Deposit amount",
    value: 1250.5,
    currency: "EUR",
    onChange: () => {},
  });

  const amountInput = instance.container.querySelector("input[type='text']");
  const currencySelect = instance.container.querySelector("select");

  assert.ok(amountInput, "amount input rendered");
  assert.ok(currencySelect, "currency select rendered");
  assert.equal(amountInput.getAttribute("id"), "deposit");
  assert.equal(amountInput.value, "1250.5");
  assert.equal(currencySelect.value, "EUR");

  instance.unmount();
});

test("emits numeric amount changes", async () => {
  __setBaseCurrencyTestValue({
    baseCurrency: "USD",
    availableCurrencies: ["USD", "EUR"],
  });

  const changes = [];
  const instance = await renderMoneyInput({
    label: "Invoice",
    value: 100,
    currency: "USD",
    onChange: (next) => {
      changes.push(next);
    },
  });

  const amountInput = instance.container.querySelector("input[type='text']");
  assert.ok(amountInput);

  await act(async () => {
    changeInput(amountInput, "456.78");
  });

  assert.deepEqual(changes.at(-1), { amount: 456.78, currency: "USD" });

  instance.unmount();
});

test("coerces blank amount to null", async () => {
  __setBaseCurrencyTestValue({
    baseCurrency: "USD",
    availableCurrencies: ["USD", "EUR"],
  });

  let lastChange = null;
  const instance = await renderMoneyInput({
    label: "Refund",
    value: 10,
    currency: "USD",
    onChange: (next) => {
      lastChange = next;
    },
  });

  const amountInput = instance.container.querySelector("input[type='text']");
  assert.ok(amountInput);

  await act(async () => {
    changeInput(amountInput, "", "input");
  });

  assert.deepEqual(lastChange, { amount: null, currency: "USD" });

  instance.unmount();
});

test("emits currency changes", async () => {
  __setBaseCurrencyTestValue({
    baseCurrency: "USD",
    availableCurrencies: ["USD", "EUR", "GBP"],
  });

  let lastChange = null;
  const instance = await renderMoneyInput({
    label: "Subscription",
    value: 19.99,
    currency: "USD",
    onChange: (next) => {
      lastChange = next;
    },
  });

  const select = instance.container.querySelector("select");
  assert.ok(select);

  await act(async () => {
    select.value = "GBP";
    changeInput(select, "GBP", "change");
  });

  assert.deepEqual(lastChange, { amount: 19.99, currency: "GBP" });

  instance.unmount();
});

test("renders base currency preview when enabled", async () => {
  __setBaseCurrencyTestValue({
    baseCurrency: "USD",
    availableCurrencies: ["USD", "EUR"],
    formatAmountWithBase: () => ({
      formattedAmount: "€100.00",
      baseAmount: 110,
      formattedBaseAmount: "$110.00",
    }),
  });

  const instance = await renderMoneyInput({
    label: "Invoice",
    value: 100,
    currency: "EUR",
    showBasePreview: true,
    onChange: () => {},
  });

  const preview = instance.container.querySelector("[data-testid='money-input-base-preview']");
  assert.ok(preview, "preview rendered");
  assert.equal(preview.textContent, "~$110.00");
  assert.equal(preview.getAttribute("aria-live"), "polite");

  instance.unmount();
});

test("hides base preview when amount is blank", async () => {
  __setBaseCurrencyTestValue({
    baseCurrency: "USD",
    availableCurrencies: ["USD", "EUR"],
  });

  const instance = await renderMoneyInput({
    label: "Empty",
    value: null,
    currency: "EUR",
    showBasePreview: true,
    onChange: () => {},
  });

  const preview = instance.container.querySelector("[data-testid='money-input-base-preview']");
  assert.equal(preview, null, "preview should be hidden when amount is blank");

  instance.unmount();
});

test("hides base preview when currency equals base", async () => {
  __setBaseCurrencyTestValue({
    baseCurrency: "USD",
    availableCurrencies: ["USD"],
    formatAmountWithBase: () => ({
      formattedAmount: "$50.00",
      baseAmount: 50,
      formattedBaseAmount: "$50.00",
    }),
  });

  const instance = await renderMoneyInput({
    label: "Same currency",
    value: 50,
    currency: "USD",
    showBasePreview: true,
    onChange: () => {},
  });

  const preview = instance.container.querySelector("[data-testid='money-input-base-preview']");
  assert.equal(preview, null, "preview should be hidden when currency matches base");

  instance.unmount();
});

test("disables currency selector when change not allowed", async () => {
  __setBaseCurrencyTestValue({
    availableCurrencies: ["USD", "EUR"],
  });

  const instance = await renderMoneyInput({
    label: "Locked",
    value: 100,
    currency: "USD",
    allowCurrencyChange: false,
    onChange: () => {},
  });

  const select = instance.container.querySelector("select");
  assert.ok(select);
  assert.equal(select.disabled, true);

  instance.unmount();
});

test("forwards blur events", async () => {
  __setBaseCurrencyTestValue({
    availableCurrencies: ["USD"],
  });

  let blurCount = 0;
  const instance = await renderMoneyInput({
    id: "amount",
    label: "Amount",
    value: 5,
    currency: "USD",
    onBlur: () => {
      blurCount += 1;
    },
    onChange: () => {},
  });

  const amountInput = instance.container.querySelector("input[type='text']");
  assert.ok(amountInput);

  await act(async () => {
    amountInput.focus();
    amountInput.blur();
  });

  assert.equal(blurCount, 1);

  instance.unmount();
});

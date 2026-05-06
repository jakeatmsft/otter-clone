#!/usr/bin/env node

const readline = require("node:readline");

const mode = process.env.SYMPHONY_FAKE_APP_SERVER_MODE || "tool-and-notify";
const pendingResponses = new Map();
let turnCount = 0;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function waitForResponse(id) {
  return new Promise((resolve) => {
    pendingResponses.set(id, resolve);
  });
}

async function handleTurnStart(requestId) {
  turnCount += 1;
  const turnId = `turn-${turnCount}`;

  send({
    id: requestId,
    result: {
      turn: {
        id: turnId,
      },
    },
  });

  if (mode === "tool-and-notify") {
    const toolCallId = 900 + turnCount;
    const responsePromise = waitForResponse(toolCallId);

    send({
      id: toolCallId,
      method: "item/tool/call",
      params: {
        tool: "not_supported",
        arguments: {
          foo: "bar",
        },
      },
    });

    await responsePromise;

    send({
      method: "thread/tokenUsage/updated",
      params: {
        tokenUsage: {
          total: {
            inputTokens: 11,
            outputTokens: 7,
            totalTokens: 18,
          },
        },
      },
    });

    send({
      method: "account/rateLimits/updated",
      params: {
        rateLimits: {
          primary: {
            remaining: 42,
            resetSeconds: 9,
          },
        },
      },
    });

    send({
      method: "turn/completed",
      params: {
        turn: {
          status: "completed",
        },
      },
    });
    return;
  }

  if (mode === "input-required") {
    send({
      method: "turn/input_required",
      params: {
        inputRequired: true,
      },
    });
    return;
  }

  send({
    method: "turn/completed",
    params: {
      turn: {
        status: "completed",
      },
    },
  });
}

const reader = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

reader.on("line", (line) => {
  const raw = String(line).trim();

  if (!raw) {
    return;
  }

  const message = JSON.parse(raw);

  if (Object.prototype.hasOwnProperty.call(message, "id") && !message.method) {
    const resolve = pendingResponses.get(message.id);
    if (resolve) {
      pendingResponses.delete(message.id);
      resolve(message);
    }
    return;
  }

  if (typeof message.method !== "string") {
    return;
  }

  switch (message.method) {
    case "initialize":
      send({
        id: message.id,
        result: {},
      });
      return;

    case "thread/start":
      send({
        id: message.id,
        result: {
          thread: {
            id: "thread-1",
          },
        },
      });
      return;

    case "thread/name/set":
      send({
        id: message.id,
        result: {},
      });
      return;

    case "turn/start":
      handleTurnStart(message.id).catch((error) => {
        send({
          method: "turn/completed",
          params: {
            turn: {
              status: "failed",
            },
            error: {
              message: error.message,
            },
          },
        });
      });
      return;

    default:
      if (Object.prototype.hasOwnProperty.call(message, "id")) {
        send({
          id: message.id,
          error: {
            code: -32601,
            message: `Unsupported method: ${message.method}`,
          },
        });
      }
  }
});

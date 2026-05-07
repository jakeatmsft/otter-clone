const http = require('http');
const next = require('next');
const { WebSocketServer } = require('ws');

const { attachRealtimeBridge } = require('./realtime-bridge');

function getArgValue(flag) {
  const inlineValue = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (inlineValue) {
    return inlineValue.slice(flag.length + 1);
  }

  const flagIndex = process.argv.indexOf(flag);
  if (flagIndex >= 0 && process.argv[flagIndex + 1]) {
    return process.argv[flagIndex + 1];
  }

  return undefined;
}

const dev = process.argv.includes('--dev');
const hostname = getArgValue('--hostname') || process.env.HOST || '0.0.0.0';
const port = Number(getArgValue('--port') || process.env.PORT || 3000);

const app = next({ dev, hostname, port });

app
  .prepare()
  .then(() => {
    const handle = app.getRequestHandler();
    const upgradeHandler =
      typeof app.getUpgradeHandler === 'function' ? app.getUpgradeHandler() : null;
    const realtimeWss = new WebSocketServer({ noServer: true });

    realtimeWss.on('connection', (socket) => {
      attachRealtimeBridge(socket).catch((error) => {
        if (socket.readyState === 1) {
          socket.send(
            JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'Realtime bridge failed.',
            })
          );
          socket.close(1011, 'Realtime bridge failed');
        }
      });
    });

    const server = http.createServer((req, res) => {
      handle(req, res);
    });

    server.on('upgrade', (req, socket, head) => {
      const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      if (requestUrl.pathname === '/api/realtime-transcription') {
        realtimeWss.handleUpgrade(req, socket, head, (websocket) => {
          realtimeWss.emit('connection', websocket, req);
        });
        return;
      }

      if (upgradeHandler) {
        upgradeHandler(req, socket, head);
        return;
      }

      socket.destroy();
    });

    server.listen(port, hostname, () => {
      console.log(
        `> Ready on http://${hostname}:${port} (${dev ? 'development' : 'production'})`
      );
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

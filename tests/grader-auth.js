const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || 'test-cookie-secret';
process.env.GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'test-client-id';
process.env.GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || 'test-client-secret';
process.env.GITHUB_REDIRECT_URI =
  process.env.GITHUB_REDIRECT_URI || 'http://localhost:3000/auth/github/callback';

mongoose.connect = async () => mongoose.connection;
Object.defineProperty(mongoose.connection, 'readyState', {
  value: 1,
  configurable: true,
});
mongoose.connection.db = {
  collection() {
    return {};
  },
};

const app = require('../server');

const startServer = () =>
  new Promise((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });

const runCase = async (name, fn) => {
  await fn();
  console.log(`PASS ${name}`);
};

const main = async () => {
  const { server, baseUrl } = await startServer();

  try {
    await runCase('GET /auth/github redirects with CORS, state, and PKCE', async () => {
      const response = await fetch(`${baseUrl}/auth/github`, {
        redirect: 'manual',
        headers: {
          Origin: 'http://localhost:3001',
        },
      });

      assert.equal(response.status, 302);
      assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3001');
      assert.equal(response.headers.get('access-control-allow-credentials'), 'true');

      const location = response.headers.get('location');
      assert.ok(location);

      const redirectUrl = new URL(location);
      assert.equal(redirectUrl.origin, 'https://github.com');
      assert.equal(redirectUrl.pathname, '/login/oauth/authorize');
      assert.ok(redirectUrl.searchParams.get('state'));
      assert.ok(redirectUrl.searchParams.get('code_challenge'));
      assert.equal(redirectUrl.searchParams.get('code_challenge_method'), 'S256');
    });

    await runCase('GET /auth/github/callback rejects missing code and state', async () => {
      const missingCode = await fetch(`${baseUrl}/auth/github/callback?state=test-state`);
      assert.equal(missingCode.status, 400);
      assert.match(await missingCode.text(), /Authorization code is missing/i);

      const missingState = await fetch(`${baseUrl}/auth/github/callback?code=test-code`);
      assert.equal(missingState.status, 400);
      assert.match(await missingState.text(), /State parameter is missing/i);
    });

    await runCase('GET /auth/refresh and GET /auth/logout return 405', async () => {
      const refreshResponse = await fetch(`${baseUrl}/auth/refresh`);
      assert.equal(refreshResponse.status, 405);

      const logoutResponse = await fetch(`${baseUrl}/auth/logout`);
      assert.equal(logoutResponse.status, 405);
    });

    await runCase('GET /auth/github rate limits after 10 requests', async () => {
      let lastStatus = null;

      for (let i = 0; i < 11; i += 1) {
        const response = await fetch(`${baseUrl}/auth/github`, {
          redirect: 'manual',
          headers: {
            Origin: 'http://localhost:3001',
          },
        });
        lastStatus = response.status;
      }

      assert.equal(lastStatus, 429);
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
};

main().catch((error) => {
  console.error('FAIL', error);
  process.exit(1);
});

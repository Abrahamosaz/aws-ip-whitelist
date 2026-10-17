const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  ScanCommand
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');

const TABLE = process.env.WHITELIST_TABLE;
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const IPV4_REGEX =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$/;

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache'
    },
    body: JSON.stringify(body)
  };
}

function normalizeIp(ip) {
  if (!ip) return '';
  if (ip === '::1') return '127.0.0.1';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

function extractClientIp(event) {
  const sourceIp =
    event.requestContext?.http?.sourceIp ||
    event.requestContext?.identity?.sourceIp ||
    '';

  if (sourceIp) {
    return normalizeIp(sourceIp);
  }

  // Fallback only if sourceIp is missing
  const headers = Object.fromEntries(
    Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
  );

  const forwarded = headers['x-forwarded-for'];
  if (forwarded) {
    const parts = String(forwarded)
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    return normalizeIp(parts[parts.length - 1] || '');
  }

  return normalizeIp(headers['x-real-ip'] || '');
}

function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function routeOf(event) {
  const method =
    event.requestContext?.http?.method || event.httpMethod || 'GET';
  const path = event.rawPath || event.path || '/';
  return { method, path };
}

async function saveWhitelistedIp(body) {
  const { ip, label } = body || {};

  if (!ip || typeof ip !== 'string') {
    return json(400, {
      error: 'Bad Request',
      message: 'Body must include an "ip" string.'
    });
  }

  const cleanIp = ip.trim();
  if (!IPV4_REGEX.test(cleanIp)) {
    return json(400, {
      error: 'Bad Request',
      message: 'Invalid IPv4 address.',
      ip: cleanIp
    });
  }

  const existing = await doc.send(
    new GetCommand({ TableName: TABLE, Key: { ip: cleanIp } })
  );
  if (existing.Item) {
    return json(409, {
      error: 'Conflict',
      message: 'IP is already whitelisted.',
      ip: cleanIp
    });
  }

  const entry = {
    ip: cleanIp,
    id: randomUUID(),
    label: label ? String(label).trim() : null,
    created_at: new Date().toISOString()
  };

  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: entry,
      ConditionExpression: 'attribute_not_exists(ip)'
    })
  );

  return json(201, {
    success: true,
    message: 'IP saved to whitelist.',
    entry
  });
}

async function listWhitelistedIps() {
  const result = await doc.send(new ScanCommand({ TableName: TABLE }));
  const items = (result.Items || [])
    .map((item) => ({
      id: item.id,
      ip: item.ip,
      label: item.label || null,
      created_at: item.created_at
    }))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  return json(200, {
    success: true,
    count: items.length,
    whitelisted_ips: items
  });
}

async function getProtectedData(event) {
  const clientIp = extractClientIp(event);
  console.log(`Protected route request from IP: ${clientIp}`);

  if (!clientIp) {
    return json(403, {
      error: 'Forbidden',
      message: 'Could not determine client IP.',
      your_ip: clientIp
    });
  }

  const result = await doc.send(
    new GetCommand({ TableName: TABLE, Key: { ip: clientIp } })
  );

  if (!result.Item) {
    return json(403, {
      error: 'Forbidden',
      message: 'Access denied. Your public IP is not whitelisted.',
      your_ip: clientIp
    });
  }

  return json(200, {
    success: true,
    message: 'Welcome! Access granted from whitelisted IP.',
    source_ip: clientIp,
    data: { id: 101, item: 'Secure Enterprise Resource' }
  });
}

exports.handler = async (event) => {
  try {
    const { method, path } = routeOf(event);

    if (method === 'POST' && path.endsWith('/whitelist')) {
      return await saveWhitelistedIp(parseBody(event));
    }

    if (method === 'GET' && path.endsWith('/whitelist')) {
      return await listWhitelistedIps();
    }

    if (method === 'GET' && path.endsWith('/protected-data')) {
      return await getProtectedData(event);
    }

    return json(404, {
      error: 'Not Found',
      message: `No route for ${method} ${path}`
    });
  } catch (error) {
    console.error(error);
    return json(500, {
      error: 'Internal Server Error',
      message: error.message || 'Unexpected error'
    });
  }
};

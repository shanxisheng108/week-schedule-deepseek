'use strict';

/**
 * 日程管理小工具 —— 零依赖后端
 * 职责：
 *   1. 静态文件服务（public/）
 *   2. /api/extract  —— 代理调用 DeepSeek，把中文自然语言抽成结构化事件
 * 不依赖任何 npm 包，Node 18+ 直接运行。
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DEEPSEEK_BASE = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
const ENV_KEY = (process.env.DEEPSEEK_API_KEY || '').trim();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/* ------------------------------ 工具函数 ------------------------------ */

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readJsonBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('请求体过大'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('请求体不是合法 JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/** 从模型输出里尽量捞出一个 JSON 对象（防止它包了 ```json 围栏） */
function extractJsonObject(content) {
  if (typeof content !== 'string') throw new Error('模型返回内容为空');
  let text = content.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error('模型返回的不是合法 JSON');
  }
}

/** 字段规范化：宁可留空，也不接受脏值 */
function normalizeEvent(raw) {
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const priority = ['high', 'medium', 'low'].includes(raw && raw.priority) ? raw.priority : 'medium';

  return {
    title: str(raw && raw.title),
    date: isDate(raw && raw.date) ? raw.date : null,
    startTime: isTime(raw && raw.startTime) ? raw.startTime : null,
    endTime: isTime(raw && raw.endTime) ? raw.endTime : null,
    timeText: str(raw && raw.timeText),
    location: str(raw && raw.location),
    priority,
  };
}

/* ------------------------------ 提示词 ------------------------------ */

function buildSystemPrompt(today, weekday) {
  return `你是日程信息抽取引擎。今天是 ${today}（${weekday}），时区 Asia/Shanghai。只输出 JSON。

任务：从用户输入的中文自然语言中抽取日程事件。

必须严格遵守的规则：
1. 只抽取原文明确出现的信息。原文没提到的字段一律为 null，绝对不要猜测、补全或编造。
2. date：格式 YYYY-MM-DD。把"今天/明天/后天/本周三/下周一/月底"等相对表述按今天的日期换算为具体日期。原文没有任何日期线索时，date 为 null。
3. startTime：格式 HH:mm（24 小时制）。原文只说"上午/下午/晚上"而没有具体时刻时，startTime 为 null，但要把原文说法保留在 timeText 中。原文没有任何时间线索时 startTime 为 null。
4. endTime：仅当原文明确给出结束时间时才填写，否则为 null。
5. location：原文明确提到的地点，保持原文措辞（如"樱顶""线上腾讯会议"）；没提到则为 null。
6. title：简洁的事件名，不超过 20 个字，用原文措辞概括，不加修饰词，不写时间地点。
7. priority：仅当原文出现明确的紧迫或重要表述（如"紧急""务必""重要""不能迟到"）时为 "high"；原文明确表示"不急""有空再说""随便"时为 "low"；其余情况一律 "medium"。
8. timeText：原文中描述该事件时间的片段，原样摘录，用于人工核对；没有则为 null。
9. 原文包含多个事件时，每个事件单独一项，不要合并。

输出格式（不要 markdown 代码块，不要任何解释文字）：
{"events":[{"title":"","date":null,"startTime":null,"endTime":null,"timeText":null,"location":null,"priority":"medium"}]}

原文中不存在可识别的日程事件时，输出 {"events":[]}。`;
}

/* ------------------------------ DeepSeek 调用 ------------------------------ */

async function callDeepSeek({ text, apiKey, today, weekday, model }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages: [
          { role: 'system', content: buildSystemPrompt(today, weekday) },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_tokens: 1600,
        response_format: { type: 'json_object' },
        stream: false,
      }),
      signal: controller.signal,
    });

    const raw = await response.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      /* 非 JSON 响应，下面统一按状态码报错 */
    }

    if (!response.ok) {
      const upstream = data && data.error && data.error.message ? data.error.message : raw.slice(0, 200);
      const mapped = {
        400: { msg: '请求格式有误，DeepSeek 未能处理该输入', code: 'BAD_REQUEST', fallback: true },
        401: { msg: 'API Key 无效或已失效，请点右上角「设置」检查', code: 'AUTH_FAILED', fallback: false },
        402: { msg: 'DeepSeek 账户余额不足，请充值后重试', code: 'NO_BALANCE', fallback: false },
        422: { msg: '输入内容无法被解析，请换一种说法', code: 'BAD_INPUT', fallback: true },
        429: { msg: '请求过于频繁或额度已用尽，请稍后再试', code: 'RATE_LIMIT', fallback: false },
        500: { msg: 'DeepSeek 服务内部错误，请稍后再试', code: 'UPSTREAM_ERROR', fallback: true },
        503: { msg: 'DeepSeek 服务繁忙，请稍后再试', code: 'UPSTREAM_ERROR', fallback: true },
      }[response.status] || { msg: `DeepSeek 返回 ${response.status}`, code: 'UPSTREAM_ERROR', fallback: true };

      throw Object.assign(new Error(mapped.msg), {
        status: response.status === 401 || response.status === 402 ? response.status : 502,
        code: mapped.code,
        fallback: mapped.fallback,
        upstream,
      });
    }

    if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
      throw Object.assign(new Error('DeepSeek 返回结构异常'), { status: 502, code: 'BAD_RESPONSE', fallback: true });
    }

    const parsed = extractJsonObject(data.choices[0].message.content);
    const list = Array.isArray(parsed.events) ? parsed.events : [];
    const events = list.map(normalizeEvent).filter((e) => e.title);

    return {
      events,
      usage: data.usage || null,
      model: data.model || model || 'deepseek-chat',
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw Object.assign(new Error('调用 DeepSeek 超时（60 秒），请稍后重试'), {
        status: 504,
        code: 'TIMEOUT',
        fallback: true,
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------ 路由 ------------------------------ */

async function serveStatic(req, res, pathname) {
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, relative);

  // 防目录穿越
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) throw new Error('not a file');

    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // 同源部署，不开放跨域；如需独立前端可在此放开
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }

  if (pathname === '/api/health') {
    sendJson(res, 200, { ok: true, service: 'schedule-tool', time: new Date().toISOString() });
    return;
  }

  if (pathname === '/api/config') {
    sendJson(res, 200, { ok: true, hasServerKey: Boolean(ENV_KEY), endpoint: DEEPSEEK_BASE });
    return;
  }

  if (pathname === '/api/extract' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      const apiKey = (typeof body.apiKey === 'string' && body.apiKey.trim()) || ENV_KEY;

      if (!text) {
        sendJson(res, 400, { ok: false, code: 'EMPTY_INPUT', message: '请输入要解析的日程文本' });
        return;
      }
      if (text.length > 4000) {
        sendJson(res, 400, { ok: false, code: 'TOO_LONG', message: '文本过长，请控制在 4000 字以内' });
        return;
      }
      if (!apiKey) {
        sendJson(res, 400, {
          ok: false,
          code: 'NO_API_KEY',
          message: '未配置 DeepSeek API Key，请在右上角「设置」中填写，或启动时设置环境变量 DEEPSEEK_API_KEY',
        });
        return;
      }

      const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today || '') ? body.today : new Date().toISOString().slice(0, 10);
      const weekday = typeof body.weekday === 'string' && body.weekday ? body.weekday : '';

      const started = Date.now();
      const result = await callDeepSeek({ text, apiKey, today, weekday, model: body.model });

      console.log(
        `[extract] ${new Date().toLocaleTimeString('zh-CN')} | ${text.length} 字 | ${result.events.length} 个事件 | ${Date.now() - started}ms | tokens ${result.usage ? result.usage.total_tokens : '?'}`
      );

      sendJson(res, 200, {
        ok: true,
        events: result.events,
        model: result.model,
        usage: result.usage,
        rawText: text,
      });
    } catch (error) {
      const status = error.status || 500;
      console.error('[extract] 失败:', error.message, error.upstream ? `| upstream: ${error.upstream}` : '');
      sendJson(res, status, {
        ok: false,
        code: error.code || 'SERVER_ERROR',
        message: error.message || '服务端错误',
        fallback: Boolean(error.fallback),
      });
    }
    return;
  }

  if (req.method === 'GET') {
    serveStatic(req, res, pathname);
    return;
  }

  sendJson(res, 405, { ok: false, message: '不支持的请求方法' });
});

server.listen(PORT, HOST, () => {
  const line = '─'.repeat(46);
  console.log(`\n${line}`);
  console.log('  日程管理小工具 · 已启动');
  console.log(line);
  console.log(`  本地地址   http://${HOST}:${PORT}`);
  console.log(`  DeepSeek   ${DEEPSEEK_BASE}`);
  console.log(`  API Key    ${ENV_KEY ? '已通过环境变量配置' : '未配置（可在页面右上角「设置」中填写）'}`);
  console.log(`${line}\n  按 Ctrl+C 停止服务\n`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用，可换一个端口启动：PORT=5174 node server.js`);
  } else {
    console.error('服务启动失败:', error.message);
  }
  process.exit(1);
});

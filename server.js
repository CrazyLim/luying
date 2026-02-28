const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const querystring = require('querystring');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'campgrounds.json');
const CSS_FILE = path.join(__dirname, 'public', 'styles.css');

function readCampgrounds() {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(raw);
}

function saveCampgrounds(campgrounds) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(campgrounds, null, 2), 'utf-8');
}

function slugify(value = '') {
  return value.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

function splitLines(text = '') {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(title, body) {
  return `<!DOCTYPE html>
  <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(title)}</title>
      <link rel="stylesheet" href="/styles.css" />
    </head>
    <body>${body}</body>
  </html>`;
}

function sendHtml(res, html, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function notFound(res, message) {
  const html = layout('页面未找到', `<main class="container not-found"><h1>404</h1><p>${escapeHtml(message)}</p><a class="button" href="/">返回首页</a></main>`);
  sendHtml(res, html, 404);
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      resolve(querystring.parse(body));
    });
  });
}

function homePage(campgrounds) {
  const cityMap = campgrounds.reduce((acc, item) => {
    if (!acc[item.citySlug]) {
      acc[item.citySlug] = { city: item.city, citySlug: item.citySlug, campgrounds: [] };
    }
    acc[item.citySlug].campgrounds.push(item);
    return acc;
  }, {});

  const cityCards = Object.values(cityMap)
    .map((cityBlock) => `<section class="card city-card">
      <h2>${escapeHtml(cityBlock.city)}</h2>
      <p>收录地点：${cityBlock.campgrounds.length} 个</p>
      <ul>${cityBlock.campgrounds.map((camp) => `<li><a href="/camp/${encodeURIComponent(camp.id)}">${escapeHtml(camp.name)}</a></li>`).join('')}</ul>
      <a class="button" href="/city/${encodeURIComponent(cityBlock.citySlug)}">查看该市攻略</a>
    </section>`)
    .join('');

  return layout(
    '中国城市露营攻略',
    `<header class="site-header"><div><h1>中国城市露营攻略</h1><p>按市级维度整理热门露营地点，一站式查看攻略、清单与注意事项。</p></div><a class="button" href="/admin">进入后台管理</a></header>
    <main class="container grid cards">${cityCards}</main>`
  );
}

function cityPage(city, campgrounds) {
  const cards = campgrounds
    .map((camp) => `<article class="card camp-card"><img src="${escapeHtml(camp.heroImage)}" alt="${escapeHtml(camp.name)} 主图" /><div class="card-body"><h2>${escapeHtml(camp.name)}</h2><p>${escapeHtml(camp.summary)}</p><p class="location">📍 ${escapeHtml(camp.location)}</p><a class="button" href="/camp/${encodeURIComponent(camp.id)}">查看完整攻略</a></div></article>`)
    .join('');
  return layout(
    `${city}露营攻略`,
    `<header class="site-header compact"><h1>${escapeHtml(city)}露营攻略</h1><nav><a href="/">返回首页</a><a href="/admin">后台管理</a></nav></header><main class="container grid cards">${cards}</main>`
  );
}

function campPage(camp) {
  return layout(
    `${camp.name} - 露营攻略`,
    `<header class="site-header compact"><h1>${escapeHtml(camp.name)}</h1><nav><a href="/city/${encodeURIComponent(camp.citySlug)}">返回${escapeHtml(camp.city)}</a><a href="/">首页</a></nav></header>
    <main class="container detail-page"><img class="hero" src="${escapeHtml(camp.heroImage)}" alt="${escapeHtml(camp.name)} 主图" />
    <section class="detail-block"><h2>地点信息</h2><p><strong>城市：</strong>${escapeHtml(camp.city)}</p><p><strong>位置：</strong>${escapeHtml(camp.location)}</p><p>${escapeHtml(camp.summary)}</p></section>
    <section class="detail-block"><h2>物品清单</h2><ul>${camp.checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>
    <section class="detail-block"><h2>注意事项</h2><ul>${camp.tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join('')}</ul></section>
    </main>`
  );
}

function adminListPage(campgrounds) {
  const rows = campgrounds
    .map((camp) => `<tr><td>${escapeHtml(camp.city)}</td><td><a href="/camp/${encodeURIComponent(camp.id)}">${escapeHtml(camp.name)}</a></td><td>${escapeHtml(camp.location)}</td><td class="actions"><a href="/admin/campgrounds/${encodeURIComponent(camp.id)}/edit">编辑</a><form method="post" action="/admin/campgrounds/${encodeURIComponent(camp.id)}/delete" onsubmit="return confirm('确认删除该攻略吗？')"><button type="submit">删除</button></form></td></tr>`)
    .join('');
  return layout(
    '后台管理 - 露营攻略',
    `<header class="site-header compact"><h1>后台管理</h1><nav><a href="/">查看前台</a><a class="button" href="/admin/new">新增攻略</a></nav></header>
    <main class="container"><table class="admin-table"><thead><tr><th>城市</th><th>露营地点</th><th>位置</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></main>`
  );
}

function adminFormPage(title, action, camp) {
  return layout(
    title,
    `<header class="site-header compact"><h1>${escapeHtml(title)}</h1><nav><a href="/admin">返回后台列表</a></nav></header>
    <main class="container form-page"><form method="post" action="${escapeHtml(action)}" class="admin-form">
    <label>城市名称（如：杭州市）<input type="text" name="city" value="${escapeHtml(camp.city || '')}" required /></label>
    <label>城市拼音标识（可选，如：hangzhou）<input type="text" name="citySlug" value="${escapeHtml(camp.citySlug || '')}" /></label>
    <label>露营地点名称<input type="text" name="name" value="${escapeHtml(camp.name || '')}" required /></label>
    <label>地点位置<input type="text" name="location" value="${escapeHtml(camp.location || '')}" required /></label>
    <label>主图 URL<input type="url" name="heroImage" value="${escapeHtml(camp.heroImage || '')}" required /></label>
    <label>攻略简介<textarea name="summary" rows="3" required>${escapeHtml(camp.summary || '')}</textarea></label>
    <label>物品清单（每行一项）<textarea name="checklist" rows="6" required>${escapeHtml((camp.checklist || []).join('\n'))}</textarea></label>
    <label>注意事项（每行一项）<textarea name="tips" rows="6" required>${escapeHtml((camp.tips || []).join('\n'))}</textarea></label>
    <button type="submit">保存攻略</button></form></main>`
  );
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/styles.css') {
    const css = fs.readFileSync(CSS_FILE, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
    res.end(css);
    return;
  }

  if (req.method === 'GET' && pathname === '/') {
    return sendHtml(res, homePage(readCampgrounds()));
  }

  if (req.method === 'GET' && pathname.startsWith('/city/')) {
    const citySlug = pathname.replace('/city/', '');
    const all = readCampgrounds();
    const cityItems = all.filter((item) => item.citySlug === citySlug);
    if (cityItems.length === 0) return notFound(res, '未找到该城市的露营地点。');
    return sendHtml(res, cityPage(cityItems[0].city, cityItems));
  }

  if (req.method === 'GET' && pathname.startsWith('/camp/')) {
    const id = pathname.replace('/camp/', '');
    const camp = readCampgrounds().find((item) => item.id === id);
    if (!camp) return notFound(res, '未找到该露营攻略。');
    return sendHtml(res, campPage(camp));
  }

  if (req.method === 'GET' && pathname === '/admin') {
    return sendHtml(res, adminListPage(readCampgrounds()));
  }

  if (req.method === 'GET' && pathname === '/admin/new') {
    return sendHtml(res, adminFormPage('新增露营攻略', '/admin/campgrounds', {}));
  }

  if (req.method === 'POST' && pathname === '/admin/campgrounds') {
    const body = await parseBody(req);
    const citySlug = body.citySlug ? slugify(body.citySlug) : slugify(body.city);
    const campgrounds = readCampgrounds();
    campgrounds.push({
      id: `${citySlug}-${slugify(body.name)}-${Date.now().toString().slice(-4)}`,
      city: body.city,
      citySlug,
      name: body.name,
      location: body.location,
      heroImage: body.heroImage,
      summary: body.summary,
      checklist: splitLines(body.checklist),
      tips: splitLines(body.tips)
    });
    saveCampgrounds(campgrounds);
    return redirect(res, '/admin');
  }

  const editMatch = pathname.match(/^\/admin\/campgrounds\/([^/]+)\/edit$/);
  if (req.method === 'GET' && editMatch) {
    const id = editMatch[1];
    const camp = readCampgrounds().find((item) => item.id === id);
    if (!camp) return notFound(res, '未找到需要编辑的露营攻略。');
    return sendHtml(res, adminFormPage(`编辑攻略：${camp.name}`, `/admin/campgrounds/${id}`, camp));
  }

  const updateMatch = pathname.match(/^\/admin\/campgrounds\/([^/]+)$/);
  if (req.method === 'POST' && updateMatch) {
    const id = updateMatch[1];
    const body = await parseBody(req);
    const campgrounds = readCampgrounds();
    const index = campgrounds.findIndex((item) => item.id === id);
    if (index === -1) return notFound(res, '未找到需要更新的露营攻略。');

    const citySlug = body.citySlug ? slugify(body.citySlug) : slugify(body.city);
    campgrounds[index] = {
      ...campgrounds[index],
      city: body.city,
      citySlug,
      name: body.name,
      location: body.location,
      heroImage: body.heroImage,
      summary: body.summary,
      checklist: splitLines(body.checklist),
      tips: splitLines(body.tips)
    };
    saveCampgrounds(campgrounds);
    return redirect(res, '/admin');
  }

  const deleteMatch = pathname.match(/^\/admin\/campgrounds\/([^/]+)\/delete$/);
  if (req.method === 'POST' && deleteMatch) {
    const id = deleteMatch[1];
    saveCampgrounds(readCampgrounds().filter((item) => item.id !== id));
    return redirect(res, '/admin');
  }

  return notFound(res, '页面不存在，请检查访问地址。');
});

server.listen(PORT, () => {
  console.log(`露营攻略网站已启动：http://localhost:${PORT}`);
});

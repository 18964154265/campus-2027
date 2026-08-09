/**
 * scrape-jobs.js — 抓取各公司校招官网的真实岗位详情页链接
 * 筛选：base 上海 / 香港；分类优先级：商家/用户运营 > 产品/策略运营 > 内容运营
 * 每分类最多 5 个。结果写入 data.json 的 companies[].jobCategories
 * 用法：node scrape-jobs.js
 */
const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "data.json");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const CITY_RE = /上海|香港|Shanghai|Hong\s*Kong/i;
const PER_CAT = 5;
const SEARCH_KWS = ["商家运营", "用户运营", "产品运营", "策略运营", "内容运营", "运营"];

// 分类判定（按优先级顺序检测标题）
const CAT_DEFS = [
  { name: "商家/用户运营", re: /(商家|用户|会员|社群|商户|达人).{0,8}运营|运营.{0,4}(商家|用户)/ },
  { name: "内容运营", re: /(内容|新媒体|社区|创作者|UGC|短视频|直播内容).{0,8}运营/ },
  { name: "产品/策略运营", re: /(产品|策略|行业|业务|数据|电商|游戏|发行|平台|活动|增长|品类|生态).{0,8}运营|发行\/运营|运营培训生|运营（|运营$/ },
];
// 展示顺序（商家/用户 > 产品/策略 > 内容）
const CAT_ORDER = ["商家/用户运营", "产品/策略运营", "内容运营"];

const EXCLUDE_RE = /工程师|安全运营|风控|审核|客服|供应链|物流|仓储/;

function classify(title) {
  if (EXCLUDE_RE.test(title)) return null;
  for (const c of CAT_DEFS) if (c.re.test(title)) return c.name;
  return /运营/.test(title) ? "产品/策略运营" : null;
}

function pickCity(s) {
  return /上海|Shanghai/i.test(s) ? "上海" : "香港";
}

function buildCats(pool) {
  const cats = CAT_ORDER.map(n => ({ name: n, jobs: [] }));
  const seen = new Set();
  for (const job of pool) {
    if (seen.has(job.url)) continue;
    const catName = classify(job.title);
    if (!catName) continue;
    const cat = cats.find(c => c.name === catName);
    if (cat.jobs.length >= PER_CAT) continue;
    seen.add(job.url);
    cat.jobs.push({ title: job.title, city: job.city, url: job.url });
  }
  return cats;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------- 飞书招聘系（字节 / 蔚来 / 小鹏） ----------
async function feishuAdapter(host) {
  const tokRes = await fetch(`https://${host}/api/v1/csrf/token`, {
    method: "POST",
    headers: { "User-Agent": UA, Referer: `https://${host}/campus/position` },
  });
  const cookies = (tokRes.headers.getSetCookie ? tokRes.headers.getSetCookie() : [])
    .map(c => c.split(";")[0]).join("; ");
  const tok = (await tokRes.json()).data.token;

  async function search(kw) {
    const res = await fetch(`https://${host}/api/v1/search/job/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        Referer: `https://${host}/campus/position`,
        "x-csrf-token": tok,
        "website-path": "campus",
        Cookie: cookies,
      },
      body: JSON.stringify({
        keyword: kw, limit: 100, offset: 0,
        portal_type: 3, portal_entrance: 1,
        job_category_id_list: [], location_code_list: [],
        subject_id_list: [], recruitment_id_list: [],
      }),
    });
    const d = await res.json();
    return (d.data && d.data.job_post_list) || [];
  }

  return async function collect() {
    const pool = [];
    const seen = new Set();
    for (const kw of SEARCH_KWS) {
      const list = await search(kw);
      await sleep(400);
      for (const j of list) {
        if (seen.has(j.id)) continue;
        const cityNames = [
          j.city_info && j.city_info.name,
          ...(Array.isArray(j.city_list) ? j.city_list.map(c => c.name) : []),
        ].filter(Boolean).join(" ");
        if (!CITY_RE.test(cityNames)) continue;
        seen.add(j.id);
        pool.push({
          title: (j.title || "").trim(),
          city: pickCity(cityNames),
          url: `https://${host}/campus/position/${j.id}/detail`,
        });
      }
    }
    return buildCats(pool);
  };
}

// ---------- 小米（飞书系自建域 mioffice）----------
// 校招门户 website-path=campus 目前返回 0（2027 届岗位尚未进搜索索引），
// 自动回退到 internship 门户（应届实习/转正实习，面向 2027 届）
async function xiaomiCollect() {
  const host = "xiaomi.jobs.f.mioffice.cn";

  async function tokenFor(refPath) {
    const r = await fetch(`https://${host}/api/v1/csrf/token`, {
      method: "POST",
      headers: { "User-Agent": UA, Referer: `https://${host}/${refPath}/position` },
    });
    const cookies = (r.headers.getSetCookie ? r.headers.getSetCookie() : [])
      .map(c => c.split(";")[0]).join("; ");
    return { tok: (await r.json()).data.token, cookies };
  }

  async function search(portal, kw) {
    const { tok, cookies } = await tokenFor(portal);
    const res = await fetch(`https://${host}/api/v1/search/job/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        Referer: `https://${host}/${portal}/position`,
        "x-csrf-token": tok,
        "website-path": portal,
        Cookie: cookies,
      },
      body: JSON.stringify({
        keyword: kw, limit: 100, offset: 0,
        portal_type: 3, portal_entrance: 1,
        job_category_id_list: [], location_code_list: [],
        subject_id_list: [], recruitment_id_list: [],
      }),
    });
    const d = await res.json();
    return (d.data && d.data.job_post_list) || [];
  }

  async function harvest(portal) {
    const pool = [];
    const seen = new Set();
    for (const kw of SEARCH_KWS) {
      const list = await search(portal, kw);
      await sleep(400);
      for (const j of list) {
        if (seen.has(j.id)) continue;
        const cityNames = [
          j.city_info && j.city_info.name,
          ...(Array.isArray(j.city_list) ? j.city_list.map(c => c.name) : []),
        ].filter(Boolean).join(" ");
        if (!CITY_RE.test(cityNames)) continue;
        seen.add(j.id);
        pool.push({
          title: (j.title || "").trim(),
          city: pickCity(cityNames),
          url: `https://${host}/${portal}/position/${j.id}/detail`,
        });
      }
    }
    return pool;
  }

  let pool = await harvest("campus");
  if (pool.length === 0) pool = await harvest("internship");
  return buildCats(pool);
}

// ---------- 腾讯校招 join.qq.com ----------
async function tencentCollect() {
  async function search(kw) {
    const res = await fetch("https://join.qq.com/api/v1/position/searchPosition", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        Referer: "https://join.qq.com/post.html",
      },
      body: JSON.stringify({ keyword: kw, pageIndex: 1, pageSize: 50, positionTypeList: [], workCityList: [], projectIdList: [] }),
    });
    const d = await res.json();
    return (d.data && d.data.positionList) || [];
  }
  const pool = [];
  const seen = new Set();
  for (const kw of SEARCH_KWS) {
    const list = await search(kw);
    await sleep(400);
    for (const p of list) {
      if (seen.has(p.id)) continue;
      const cities = p.workCities || "";
      if (!CITY_RE.test(cities)) continue;
      if (!/运营/.test(p.positionTitle || "")) continue;
      seen.add(p.id);
      pool.push({
        title: `${p.positionTitle}（${(p.projectName || "校招").trim()}）`,
        city: pickCity(cities),
        url: `https://join.qq.com/post_detail.html?pid=${p.projectId}&id=${p.id}&tid=${p.positionFamily}`,
      });
    }
  }
  return buildCats(pool);
}

// ---------- 主流程 ----------
(async () => {
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const adapters = {
    "字节跳动": await feishuAdapter("jobs.bytedance.com").catch(() => null),
    "腾讯": tencentCollect,
    "蔚来 NIO": await feishuAdapter("nio.jobs.feishu.cn").catch(() => null),
    "小鹏汽车": await feishuAdapter("xiaopeng.jobs.feishu.cn").catch(() => null),
    "小米汽车": xiaomiCollect,
  };

  for (const c of data.companies) {
    const fn = adapters[c.name];
    if (!fn) continue;
    try {
      const cats = await fn();
      const total = cats.reduce((s, x) => s + x.jobs.length, 0);
      c.jobCategories = cats;
      c.jobsFetchedAt = new Date().toISOString().slice(0, 10);
      console.log(`[OK] ${c.name}: ${total} 个岗位 (${cats.map(x => x.jobs.length).join("/")})`);
    } catch (e) {
      console.log(`[FAIL] ${c.name}: ${e.message}`);
    }
  }

  fs.writeFileSync(DATA, JSON.stringify(data, null, 2), "utf8");
  console.log("data.json updated.");
})();

const ACCOUNT_URL = 'https://www.threads.com/@x.stock_men';

const SECTOR_KEYWORDS = [
  { name: 'AI伺服器', keywords: ['AI伺服器', '伺服器', 'GB200', 'GB300', 'NVL', 'ODM', '緯創', '廣達', '英業達', '技嘉'] },
  { name: '記憶體', keywords: ['記憶體', 'DRAM', 'NAND', 'HBM', 'DDR4', 'DDR5', '威剛', '南亞科', '華邦電', '群聯'] },
  { name: '被動元件', keywords: ['被動元件', 'MLCC', '電感', '鉭電', '國巨', '華新科', '奇力新'] },
  { name: 'PCB/載板', keywords: ['PCB', '載板', 'CCL', 'M8', 'M9', 'ABF', '欣興', '台光電', '金像電'] },
  { name: '散熱', keywords: ['散熱', '液冷', '水冷', '機櫃', '雙鴻', '奇鋐', '健策'] },
  { name: '電源', keywords: ['電源', 'BBU', 'UPS', '電源供應器', '台達電', '光寶科', '康舒'] },
  { name: '半導體/封測', keywords: ['半導體', 'CoWoS', '先進封裝', '封測', '台積電', '聯電', '日月光', '京元電'] },
  { name: '機器人', keywords: ['機器人', '人形機器人', '機電', '上銀', '和大'] },
  { name: '矽光子/光通訊', keywords: ['矽光子', 'CPO', '光通訊', '光模組', '聯亞', '波若威', '華星光'] }
];

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/\\u0026/g, '&')
    .replace(/\\u003C/g, '<')
    .replace(/\\u003E/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"');
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function compactText(s) {
  return decodeHtml(s).replace(/\s+/g, ' ').trim();
}

function extractCandidateTexts(html) {
  const texts = [];
  const meta = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)
    || html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
  if (meta) texts.push(meta[1]);

  const textRegexes = [
    /"text"\s*:\s*"((?:\\"|[^"])*)"/g,
    /"caption"\s*:\s*"((?:\\"|[^"])*)"/g,
    /"description"\s*:\s*"((?:\\"|[^"])*)"/g
  ];
  textRegexes.forEach(re => {
    let m;
    while ((m = re.exec(html))) {
      texts.push(m[1]);
    }
  });

  const visible = stripTags(html);
  visible.split(/\s{2,}/).forEach(part => {
    if (/[\u4e00-\u9fff]/.test(part) && part.length >= 12) texts.push(part);
  });

  return unique(texts.map(compactText))
    .filter(t => /[\u4e00-\u9fffA-Za-z0-9]/.test(t))
    .filter(t => !/登入|註冊|Threads|Instagram/.test(t) || t.length > 80)
    .slice(0, 20);
}

function analyzeTexts(texts) {
  const joined = texts.join('\n');
  const stockCodes = unique((joined.match(/\b[1-9]\d{3}\b/g) || []));
  const sectorMentions = SECTOR_KEYWORDS.map(sec => {
    const hits = sec.keywords.filter(k => joined.includes(k));
    return hits.length ? { name: sec.name, keywords: hits.slice(0, 8) } : null;
  }).filter(Boolean);

  const topics = unique([
    ...sectorMentions.map(s => s.name),
    ...stockCodes.map(c => c)
  ]).slice(0, 12);

  return { stockCodes, sectorMentions, topics };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method not allowed' });

  try {
    const upstream = await fetch(ACCOUNT_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.7'
      },
      cache: 'no-store'
    });
    const html = await upstream.text();
    const texts = extractCandidateTexts(html);
    const analysis = analyzeTexts(texts);
    const blocked = upstream.status >= 400 || texts.length === 0;

    res.status(200).json({
      ok: !blocked,
      source: ACCOUNT_URL,
      fetchedAt: new Date().toISOString(),
      status: upstream.status,
      message: blocked ? 'Threads 公開頁可能需要登入或暫時無法解析' : 'ok',
      posts: texts.slice(0, 8).map((text, i) => ({ id: String(i + 1), text })),
      ...analysis
    });
  } catch (e) {
    res.status(200).json({
      ok: false,
      source: ACCOUNT_URL,
      fetchedAt: new Date().toISOString(),
      message: e.message || 'Threads 抓取失敗',
      posts: [],
      stockCodes: [],
      sectorMentions: [],
      topics: []
    });
  }
}

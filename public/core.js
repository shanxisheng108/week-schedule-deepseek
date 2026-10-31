/**
 * 日程小工具 · 纯逻辑模块
 * ------------------------------------------------------------
 * 这里只放不依赖 DOM 的函数：日期换算、本地规则解析、便签格式化。
 * 浏览器中挂到 window.ScheduleCore，Node 中可 require 做单元测试。
 */
(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (global) global.ScheduleCore = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  /* ------------------------------ 日期 ------------------------------ */

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function dateKey(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function parseKey(key) {
    const [y, m, d] = String(key).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(d, n) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }

  /** 以周一为一周起点 */
  function startOfWeek(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const offset = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - offset);
    return x;
  }

  function fmtDateCN(key) {
    const d = parseKey(key);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY_CN[d.getDay()]}`;
  }

  /* ------------------------------ 本地规则解析 ------------------------------ */

  const CN_NUM = {
    零: 0, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
    七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12,
    十三: 13, 十四: 14, 十五: 15, 二十: 20,
  };

  function cnToNum(s) {
    if (s == null || s === '') return null;
    if (/^\d+$/.test(s)) return Number(s);
    return Object.prototype.hasOwnProperty.call(CN_NUM, s) ? CN_NUM[s] : null;
  }

  /**
   * 把一段中文按分句拆成多个候选事件，逐句解析。
   * 只在原文明确出现信息时填值，缺失一律 null。
   */
  function localParse(text, baseDate) {
    const base = baseDate instanceof Date ? baseDate : new Date();
    const segments = String(text)
      .split(/[；;。\n！!？?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);

    const results = [];
    const seen = new Set();
    for (const seg of segments) {
      const item = parseSegment(seg, base);
      if (!item) continue;
      const sig = `${item.title}|${item.date}|${item.startTime}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      results.push(item);
    }
    return results;
  }

  function parseSegment(seg, base) {
    const today = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    let rest = seg;

    /* ---- 日期 ---- */
    let date = null;
    const relMap = { 今天: 0, 今日: 0, 明天: 1, 明日: 1, 后天: 2, 大后天: 3 };
    let m = rest.match(/大后天|后天|明天|明日|今天|今日/);

    if (m) {
      date = dateKey(addDays(today, relMap[m[0]]));
      rest = rest.replace(m[0], ' ');
    } else if ((m = rest.match(/(下下|下|这|本)?\s*(?:周|星期|礼拜)([一二三四五六日天])/))) {
      const dowMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
      const targetDowMon = dowMap[m[2]] === 0 ? 6 : dowMap[m[2]] - 1;
      const curDowMon = (today.getDay() + 6) % 7;
      let delta = targetDowMon - curDowMon;
      if (m[1] === '下') delta += 7;
      else if (m[1] === '下下') delta += 14;
      else if (delta < 0) delta += 7;
      date = dateKey(addDays(today, delta));
      rest = rest.replace(m[0], ' ');
    } else if ((m = rest.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/))) {
      const month = Number(m[1]);
      const day = Number(m[2]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const year = month < today.getMonth() + 1 ? today.getFullYear() + 1 : today.getFullYear();
        date = `${year}-${pad2(month)}-${pad2(day)}`;
        rest = rest.replace(m[0], ' ');
      }
    }

    /* ---- 时刻 ---- */
    let startTime = null;
    let endTime = null;
    let timeText = null;

    const periodMatch = rest.match(/凌晨|早晨|早上|上午|中午|下午|傍晚|晚上|夜里/);
    const period = periodMatch ? periodMatch[0] : '';
    const clockRe = /(\d{1,2}|[一二两三四五六七八九十]{1,3})\s*[点時时:：]\s*(\d{1,2}|半|[一二三四五六七八九十]{1,2})?\s*分?/;
    const cm = rest.match(clockRe);

    if (cm) {
      let hour = cnToNum(cm[1]);
      let minute = 0;
      if (cm[2] === '半') minute = 30;
      else if (cm[2]) minute = cnToNum(cm[2]) || 0;

      if (hour != null && hour <= 24) {
        if (/下午|傍晚|晚上|夜里/.test(period) && hour < 12) hour += 12;
        if (period === '中午' && hour < 11) hour += 12;
        if (hour === 24) hour = 0;
        if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
          startTime = `${pad2(hour)}:${pad2(minute)}`;
          timeText = `${period}${cm[0]}`.trim();
          rest = rest.replace(cm[0], ' ');
        }
      }
    }

    // 结束时刻："到十一点""至 12:00"
    if (startTime) {
      const em = rest.match(/(?:到|至|~|-|—)\s*(\d{1,2}|[一二两三四五六七八九十]{1,3})\s*[点時时:：]?\s*(\d{1,2}|半)?\s*分?/);
      if (em) {
        let eh = cnToNum(em[1]);
        const emin = em[2] === '半' ? 30 : cnToNum(em[2] || '');
        if (eh != null && eh < 12 && parseInt(startTime.slice(0, 2), 10) >= 12) eh += 12;
        if (eh != null && eh >= 0 && eh < 24) {
          endTime = `${pad2(eh)}:${pad2(emin || 0)}`;
          rest = rest.replace(em[0], ' ');
        }
      }
    }

    /* ---- 地点 ---- */
    let location = null;
    const beforeLoc = rest; // 供标题兜底
    const locMatch = rest.match(/(?:在|到|去)\s*([^，,。；;、\s]{1,18})/);
    if (locMatch) {
      const candidate = locMatch[1].replace(
        /(开会|上课|见面|集合|聚餐|面试|讲座|吃饭|讨论|参加|办理|报到|签到|查资料|查文献|自习|复习|借书|还书|打印|值班|听课|汇报|答辩|提交|交|递|领|取|送|买).*$/,
        ''
      );
      if (candidate.length >= 2) {
        location = candidate;
        rest = rest.replace(candidate, ' ');
      }
    }
    if (!location) {
      // 先匹配专有场所名，再退回泛化的「线上」
      const kw =
        rest.match(/(腾讯会议|钉钉会议|会议室|教室|图书馆|办公室|实验室|报告厅|体育馆|食堂|宿舍|教学楼)/) ||
        rest.match(/线上/);
      if (kw) {
        location = kw[1];
        rest = rest.replace(kw[1], ' ');
      }
    }

    /* ---- 标题 ---- */
    const cleanTitle = (s) =>
      String(s)
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^[在到去的\s，,、。；;：:]+/, '')
        .replace(/(这个|那个)?(比较|很|特别)?(重要|急|紧急|要紧)$/, '')
        .trim();

    let title = cleanTitle(rest.split(/[，,]/)[0]);
    if (title.length < 2 || title === location) {
      title = cleanTitle(beforeLoc.split(/[，,]/)[0]);
    }
    title = title.slice(0, 20);

    if (!title || title.length < 2) return null;

    /* ---- 优先级：只依据原文措辞 ---- */
    let priority = 'medium';
    if (/(紧急|务必|重要|不能迟到|必须|deadline|截止)/i.test(seg)) priority = 'high';
    else if (/(不急|有空再说|随便|看情况)/.test(seg)) priority = 'low';

    // 日期、时间、地点全无 → 不认为是日程
    if (!date && !startTime && !location) return null;

    // 只提到了日期、既无时刻也无地点，且整句没有任何动作词 → 判定为闲聊
    const ACTION_RE = /(开|去|到|见|吃|上|听|做|写|交|拿|取|办|参加|讨论|复习|查|买|送|接|考|练|预约|报到|答辩|值班|汇报|聚会|旅行|订|签|约|访|谈|讲|学)/;
    if (!startTime && !location && !ACTION_RE.test(seg)) return null;

    return { title, date, startTime, endTime, timeText, location, priority };
  }

  /* ------------------------------ 便签格式化 ------------------------------ */

  function timeDisplay(e) {
    const parts = [];
    if (e.date) parts.push(fmtDateCN(e.date));
    if (e.startTime) parts.push(e.endTime ? `${e.startTime}–${e.endTime}` : e.startTime);
    if (!parts.length) return e.timeText || null;
    if (!e.date) parts.unshift('日期未提及');
    return parts.join(' ');
  }

  /** 统一便签格式：【事件名 - 时间 - 地点 - 详情】 */
  function noteLine(e) {
    const t = timeDisplay(e) || '未提及';
    const l = e.location || '未提及';
    const d = String(e.detail || '').replace(/\s+/g, ' ').trim() || '未提及';
    return `【${e.title} - ${t} - ${l} - ${d}】`;
  }

  /* ------------------------------ 列表：排序 / 搜索 / 高亮 ------------------------------ */

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /** 日期 → 开始时间 → 创建时间 升序；缺日期的排最后 */
  function sortEvents(list) {
    return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
      const da = a.date || '9999-12-31';
      const db = b.date || '9999-12-31';
      if (da !== db) return da < db ? -1 : 1;
      const ta = a.startTime || '99:99';
      const tb = b.startTime || '99:99';
      if (ta !== tb) return ta < tb ? -1 : 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  /** 压缩空白 + 转小写，用于不区分大小写的子串比对 */
  function normalizeText(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /**
   * 在「详情」字段（用户输入的原始文本）中做子串匹配。
   * 关键词为空 → 返回全部日程（已排序）。
   */
  function filterEvents(list, keyword) {
    const sorted = sortEvents(list);
    const q = normalizeText(keyword);
    if (!q) return sorted;
    return sorted.filter((e) => normalizeText(e && e.detail).includes(q));
  }

  /**
   * 渲染命中位置附近的一段原文，命中处包 <mark>。
   * 每段都先转义再拼接，详情里的尖括号不会被当成标签。
   */
  function highlightHTML(text, keyword) {
    const source = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!source) return '';

    const clip = (s) => (s.length > 130 ? `${s.slice(0, 130)}…` : s);
    const q = String(keyword || '').trim();
    if (!q) return escapeHTML(clip(source));

    const lower = source.toLowerCase();
    const ql = q.toLowerCase();
    const first = lower.indexOf(ql);
    if (first < 0) return escapeHTML(clip(source));

    const radius = 34;
    const start = Math.max(0, first - radius);
    const end = Math.min(source.length, first + ql.length + radius);
    const slice = source.slice(start, end);
    const sliceLower = slice.toLowerCase();

    let out = '';
    let cursor = 0;
    let idx = sliceLower.indexOf(ql);
    while (idx !== -1) {
      out += escapeHTML(slice.slice(cursor, idx));
      out += `<mark>${escapeHTML(slice.slice(idx, idx + ql.length))}</mark>`;
      cursor = idx + ql.length;
      idx = sliceLower.indexOf(ql, cursor);
    }
    out += escapeHTML(slice.slice(cursor));

    return `${start > 0 ? '…' : ''}${out}${end < source.length ? '…' : ''}`;
  }

  return {
    WEEKDAY_CN,
    pad2,
    dateKey,
    parseKey,
    addDays,
    startOfWeek,
    fmtDateCN,
    localParse,
    parseSegment,
    timeDisplay,
    noteLine,
    escapeHTML,
    sortEvents,
    normalizeText,
    filterEvents,
    highlightHTML,
  };
});

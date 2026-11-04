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

  /** 仅月日；跨年区间才带年份 */
  function fmtMonthDay(key, withYear) {
    const d = parseKey(key);
    const md = `${d.getMonth() + 1}月${d.getDate()}日`;
    return withYear ? `${d.getFullYear()}年${md}` : md;
  }

  /** b - a 的天数差（按自然日计，规避夏令时导致的 23/25 小时） */
  function dayDiff(aKey, bKey) {
    const a = parseKey(aKey);
    const b = parseKey(bKey);
    const ms = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
      - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    return Math.round(ms / 86400000);
  }

  /* ------------------------ 时点类 / 时段类 ------------------------ */

  /**
   * 时段类（持续性日程）：跨越连续多天。
   * 单日事件即使有起止时刻（09:00–11:00）也不算，那是「时点类」。
   */
  function isSpan(e) {
    return Boolean(e && e.date && e.endDate && e.endDate > e.date);
  }

  /** 事件是否落在某一天：单日精确相等；时段类落在闭区间内 */
  function occursOn(e, key) {
    if (!e || !e.date || !key) return false;
    if (e.date === key) return true;
    return isSpan(e) && e.date <= key && key <= e.endDate;
  }

  /**
   * 是否该进周视图的「全天」栏：
   * 时段类（持续多天）一律进全天栏；时点类只有没给具体时刻时进。
   */
  function isAllDayLike(e) {
    return isSpan(e) || !(e && e.startTime);
  }

  /** 持续天数；单日事件为 1 */
  function spanDays(e) {
    return isSpan(e) ? dayDiff(e.date, e.endDate) + 1 : 1;
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
      const sig = `${item.title}|${item.date}|${item.endDate || ''}|${item.startTime}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      results.push(item);
    }
    return results;
  }

  /** 校验月日是否真实存在（挡掉 2 月 30 日这类脏值） */
  function validMonthDay(month, day) {
    if (!(month >= 1 && month <= 12)) return false;
    if (!(day >= 1 && day <= 31)) return false;
    const probe = new Date(2024, month - 1, day); // 闰年基准，容忍 2 月 29 日
    return probe.getMonth() === month - 1 && probe.getDate() === day;
  }

  /**
   * 识别「时段类」区间，只认原文写明的范围；认不出就返回 null，交给单日逻辑。
   * 返回 { date, endDate, text }，text 是命中的原文片段，便于从句子中剔除。
   */
  function parseSpanRange(text, today) {
    const yearFor = (month) => (month < today.getMonth() + 1 ? today.getFullYear() + 1 : today.getFullYear());
    const mk = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

    /* 1) 10月26日到11月1日 */
    let m = text.match(
      /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?\s*(?:到|至|~|～|—|－|-|、)\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/
    );
    if (m) {
      const sm = +m[1];
      const sd = +m[2];
      const em = +m[3];
      const ed = +m[4];
      if (validMonthDay(sm, sd) && validMonthDay(em, ed)) {
        const sy = yearFor(sm);
        const ey = em < sm ? sy + 1 : sy;
        const start = mk(sy, sm, sd);
        const end = mk(ey, em, ed);
        if (end > start) return { date: start, endDate: end, text: m[0] };
      }
    }

    /* 2) 10月26日到31日（同月省略月份） */
    m = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?\s*(?:到|至|~|～|—|－|-)\s*(\d{1,2})\s*[日号]/);
    if (m) {
      const sm = +m[1];
      const sd = +m[2];
      const ed = +m[3];
      if (validMonthDay(sm, sd) && validMonthDay(sm, ed) && ed > sd) {
        const sy = yearFor(sm);
        return { date: mk(sy, sm, sd), endDate: mk(sy, sm, ed), text: m[0] };
      }
    }

    /* 3) 这周一到周五 / 下周一至下周五 */
    m = text.match(
      /((?:这|本|下)?\s*(?:周|星期|礼拜))\s*([一二三四五六日天])\s*(?:到|至|~|～|—|－|-)\s*(?:周|星期|礼拜)?\s*([一二三四五六日天])/
    );
    if (m) {
      const dowMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
      const toMon = (dow) => (dow === 0 ? 6 : dow - 1);
      const curDowMon = (today.getDay() + 6) % 7;
      const nextWeek = /下/.test(m[1]);
      const thisWeek = /这|本/.test(m[1]);

      let ds = toMon(dowMap[m[2]]) - curDowMon;
      if (nextWeek) ds += 7;
      else if (!thisWeek && ds < 0) ds += 7;

      let de = toMon(dowMap[m[3]]) - curDowMon;
      if (nextWeek) de += 7;
      else if (de < ds) de += 7;

      return { date: dateKey(addDays(today, ds)), endDate: dateKey(addDays(today, de)), text: m[0] };
    }

    /* 4) 「每天 / 连续 / 为期」才认为是持续性表述，避免「三天后交材料」被误判 */
    if (!/每(?:天|日)|连续|为期|持续/.test(text)) return null;

    /* 4a) 连续七天 / 未来三天每天 */
    m = text.match(/(?:连续|未来|接下来|为期)?\s*([一二两三四五六七八九十]{1,3}|\d{1,2})\s*天(?:内|里)?/);
    if (m) {
      const n = cnToNum(m[1]);
      if (n && n >= 2 && n <= 90) {
        return {
          date: dateKey(today),
          endDate: dateKey(addDays(today, n - 1)),
          text: m[0],
        };
      }
    }

    /* 4b) 一周内每天 / 这周每天 → 本周一至周日 */
    m = text.match(/(?:未来|接下来)?(?:这|本|整)?\s*一?\s*(?:周|星期|礼拜)(?:内|里)?/);
    if (m) {
      const monday = addDays(today, -((today.getDay() + 6) % 7));
      return {
        date: dateKey(monday),
        endDate: dateKey(addDays(monday, 6)),
        text: m[0],
      };
    }

    // 4c) 只说了「每天」却没有任何日期线索：不猜，交给「待安排」
    return null;
  }

  function parseSegment(seg, base) {
    const today = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    let rest = seg;

    /* ---- 日期区间（时段类）优先，认不出再退回单日 ---- */
    let date = null;
    let endDate = null;
    const span = parseSpanRange(rest, today);

    if (span) {
      date = span.date;
      endDate = span.endDate;
      rest = rest.replace(span.text, ' ');
      // 「每天 / 每日」是持续性的修饰词，和区间一起消化掉，别留在标题里
      rest = rest.replace(/每(?:天|日)/g, ' ');
    } else {
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
        .replace(/每(?:天|日)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^[在到去的\s，,、。；;：:]+/, '')
        // 时刻被摘掉后常留下"下午 ""早上 "这样的时段词，一并削掉
        .replace(/^(?:凌晨|早晨|早上|上午|中午|下午|傍晚|晚上|夜里)\s*/, '')
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

    return { title, date, endDate, startTime, endTime, timeText, location, priority };
  }

  /* ------------------------------ 便签格式化 ------------------------------ */

  function timeDisplay(e) {
    if (!e) return null;

    // 时段类：显示完整区间 + 持续天数 + 每天的时段
    if (isSpan(e)) {
      const crossYear = e.date.slice(0, 4) !== e.endDate.slice(0, 4);
      const range = `${fmtMonthDay(e.date, crossYear)}–${fmtMonthDay(e.endDate, crossYear)}`;
      const daily = e.startTime ? `每天 ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : '全天';
      return `${range}（${spanDays(e)} 天）· ${daily}`;
    }

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
    fmtMonthDay,
    dayDiff,
    isSpan,
    occursOn,
    isAllDayLike,
    spanDays,
    localParse,
    parseSegment,
    parseSpanRange,
    timeDisplay,
    noteLine,
    escapeHTML,
    sortEvents,
    normalizeText,
    filterEvents,
    highlightHTML,
  };
});

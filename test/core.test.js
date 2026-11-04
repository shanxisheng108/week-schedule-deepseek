'use strict';

/**
 * core.js 单元测试（node test/core.test.js）
 * 基准日期固定为 2026-10-31（周六），避免"今天"漂移导致断言不稳定。
 */

const assert = require('node:assert');
const core = require('../public/core.js');

const BASE = new Date(2026, 9, 31); // 2026-10-31 周六

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

console.log('\n日期工具');

test('dateKey / parseKey 往返一致', () => {
  assert.strictEqual(core.dateKey(new Date(2026, 9, 31)), '2026-10-31');
  assert.strictEqual(core.dateKey(core.parseKey('2026-01-05')), '2026-01-05');
});

test('startOfWeek 以周一为起点（周六 → 本周一）', () => {
  assert.strictEqual(core.dateKey(core.startOfWeek(BASE)), '2026-10-26');
  // 周日应归到前一个周一
  assert.strictEqual(core.dateKey(core.startOfWeek(new Date(2026, 10, 1))), '2026-10-26');
});

test('fmtDateCN 输出中文星期', () => {
  assert.strictEqual(core.fmtDateCN('2026-10-31'), '10月31日 周六');
});

console.log('\n本地规则解析');

test('相对日期 + 具体时刻 + 地点', () => {
  const [e] = core.localParse('明天下午三点半在樱顶开会，讨论毕业论文选题', BASE);
  assert.strictEqual(e.date, '2026-11-01');
  assert.strictEqual(e.startTime, '15:30');
  assert.strictEqual(e.location, '樱顶');
  assert.ok(e.title.includes('开会'));
});

test('周几换算：已过去的周五顺延到下周', () => {
  const [e] = core.localParse('周五晚上七点线上腾讯会议，聊课题进展', BASE);
  assert.strictEqual(e.date, '2026-11-06');
  assert.strictEqual(e.startTime, '19:00');
  assert.strictEqual(e.location, '腾讯会议');
});

test('具体月日 + 起止时间 + 图书馆', () => {
  const [e] = core.localParse('10月28日上午九点到十一点在图书馆查文献', BASE);
  assert.strictEqual(e.date, '2026-10-28');
  assert.strictEqual(e.startTime, '09:00');
  assert.strictEqual(e.endTime, '11:00');
  assert.strictEqual(e.location, '图书馆');
});

test('缺地点时返回 null，不臆造', () => {
  const [e] = core.localParse('周三下午两点和导师电话沟通论文', BASE);
  assert.strictEqual(e.location, null);
  assert.strictEqual(e.startTime, '14:00');
});

test('缺时间时 startTime 为 null，保留原文时间描述', () => {
  const [e] = core.localParse('下周一在行政楼交材料', BASE);
  assert.strictEqual(e.date, '2026-11-02');
  assert.strictEqual(e.startTime, null);
  assert.strictEqual(e.location, '行政楼');
  assert.strictEqual(e.priority, 'medium');
});

test('优先级只依据原文措辞', () => {
  const urgent = core.localParse('明天上午九点务必到会议室开会', BASE)[0];
  assert.strictEqual(urgent.priority, 'high');

  const relaxed = core.localParse('周六下午三点去图书馆还书，不急', BASE)[0];
  assert.strictEqual(relaxed.priority, 'low');
});

test('多事件按分号拆分', () => {
  const list = core.localParse(
    '明天下午三点在樱顶开会；周五晚上七点线上腾讯会议；10月28日上午九点在图书馆查文献',
    BASE
  );
  assert.strictEqual(list.length, 3);
  assert.deepStrictEqual(list.map((x) => x.date), ['2026-11-01', '2026-11-06', '2026-10-28']);
});

test('无任何日程线索的句子不产生事件', () => {
  assert.strictEqual(core.localParse('今天心情不错，天气很好', BASE).length, 0);
});

console.log('\n便签格式化');

test('缺失字段标注「未提及」', () => {
  const line = core.noteLine({
    title: '组会',
    date: '2026-10-31',
    startTime: '14:30',
    endTime: null,
    location: null,
    detail: '明天下午三点半开会',
  });
  assert.strictEqual(line, '【组会 - 10月31日 周六 14:30 - 未提及 - 明天下午三点半开会】');
});

test('完整字段按【事件名 - 时间 - 地点 - 详情】输出', () => {
  const line = core.noteLine({
    title: '论文讨论',
    date: '2026-11-01',
    startTime: '15:30',
    endTime: '16:30',
    location: '樱顶',
    detail: '明天下午三点半在樱顶讨论论文',
  });
  assert.strictEqual(line, '【论文讨论 - 11月1日 周日 15:30–16:30 - 樱顶 - 明天下午三点半在樱顶讨论论文】');
});

console.log('\n搜索与排序');

const EVENTS = [
  { id: 'b', title: '课程汇报', date: '2026-10-27', startTime: '14:00', createdAt: 2,
    detail: '周二下午两点在教五楼做课程汇报，讲 AI 对就业结构的影响。' },
  { id: 'a', title: '论文开题讨论', date: '2026-10-27', startTime: '09:00', createdAt: 1,
    detail: '上午九点在樱顶会议室开会，讨论毕业论文选题。' },
  { id: 'c', title: '待办', date: null, startTime: null, createdAt: 3,
    detail: '给奇宏回信，聊聊最近读《资本论》的感受。' },
];

test('关键词为空时返回全部日程，并按日期/时间升序', () => {
  const list = core.filterEvents(EVENTS, '');
  assert.strictEqual(list.length, 3);
  assert.deepStrictEqual(list.map((e) => e.id), ['a', 'b', 'c']); // 无日期的排最后
});

test('中文子串匹配', () => {
  const list = core.filterEvents(EVENTS, '樱顶');
  assert.deepStrictEqual(list.map((e) => e.id), ['a']);
});

test('不区分大小写', () => {
  assert.deepStrictEqual(core.filterEvents(EVENTS, 'ai').map((e) => e.id), ['b']);
  assert.deepStrictEqual(core.filterEvents(EVENTS, 'AI').map((e) => e.id), ['b']);
});

test('无匹配时返回空数组', () => {
  assert.deepStrictEqual(core.filterEvents(EVENTS, '滑雪'), []);
});

test('只匹配详情原文，标题命中不算', () => {
  const list = [{ id: 'x', title: '樱顶会议', date: '2026-10-27', startTime: '09:00',
    detail: '下午三点开会。' }];
  assert.deepStrictEqual(core.filterEvents(list, '樱顶'), []);
});

test('高亮命中处并保留上下文', () => {
  const html = core.highlightHTML('上午九点在樱顶会议室开会，讨论毕业论文选题。', '樱顶');
  assert.ok(html.includes('<mark>樱顶</mark>'));
  assert.ok(html.includes('会议室开会'));
});

test('高亮前先转义，详情里的标签不会被当成 HTML', () => {
  const html = core.highlightHTML('<img src=x onerror=alert(1)> 讨论论文', '讨论');
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('<mark>讨论</mark>'));
});

test('长文本只截取命中附近片段并加省略号', () => {
  const long = `${'前'.repeat(80)}关键词${'后'.repeat(80)}`;
  const html = core.highlightHTML(long, '关键词');
  assert.ok(html.startsWith('…'));
  assert.ok(html.endsWith('…'));
  assert.ok(html.length < long.length);
});

console.log('\n时段类（持续多天）');

test('isSpan 只认「跨越一天的区间」，同日结束不算', () => {
  assert.strictEqual(core.isSpan({ date: '2026-10-26', endDate: '2026-11-01' }), true);
  assert.strictEqual(core.isSpan({ date: '2026-10-26', endDate: '2026-10-26' }), false);
  assert.strictEqual(core.isSpan({ date: '2026-10-26', startTime: '09:00', endTime: '11:00' }), false);
  assert.strictEqual(core.isSpan({ date: null, endDate: '2026-11-01' }), false);
});

test('occursOn：区间闭区间内每天命中，区间外不命中', () => {
  const e = { date: '2026-10-26', endDate: '2026-11-01' };
  assert.strictEqual(core.occursOn(e, '2026-10-26'), true);
  assert.strictEqual(core.occursOn(e, '2026-10-29'), true);
  assert.strictEqual(core.occursOn(e, '2026-11-01'), true);
  assert.strictEqual(core.occursOn(e, '2026-10-25'), false);
  assert.strictEqual(core.occursOn(e, '2026-11-02'), false);
});

test('时点类事件只在自己那一天命中', () => {
  const e = { date: '2026-10-27', startTime: '14:00' };
  assert.strictEqual(core.occursOn(e, '2026-10-27'), true);
  assert.strictEqual(core.occursOn(e, '2026-10-28'), false);
});

test('isAllDayLike：时段类即使带时刻也进「全天」栏', () => {
  assert.strictEqual(core.isAllDayLike({ date: '2026-10-26', endDate: '2026-11-01', startTime: '09:00' }), true);
  assert.strictEqual(core.isAllDayLike({ date: '2026-10-26' }), true);
  assert.strictEqual(core.isAllDayLike({ date: '2026-10-26', startTime: '09:00' }), false);
});

test('spanDays 含首尾，单日为 1', () => {
  assert.strictEqual(core.spanDays({ date: '2026-10-26', endDate: '2026-11-01' }), 7);
  assert.strictEqual(core.spanDays({ date: '2026-10-26' }), 1);
});

test('区间解析：跨月 / 同月省略 / 周区间 / 连续N天 / 一周内', () => {
  const at = (t) => core.parseSpanRange(t, BASE);

  assert.deepStrictEqual([at('10月26日到11月1日').date, at('10月26日到11月1日').endDate],
    ['2026-10-26', '2026-11-01']);

  assert.deepStrictEqual([at('10月26日到31日').date, at('10月26日到31日').endDate],
    ['2026-10-26', '2026-10-31']);

  // BASE 是 2026-10-31 周六：「这周一到周五」落在本周
  assert.deepStrictEqual([at('这周一到周五').date, at('这周一到周五').endDate],
    ['2026-10-26', '2026-10-30']);

  assert.deepStrictEqual([at('连续七天每天跑步').date, at('连续七天每天跑步').endDate],
    ['2026-10-31', '2026-11-06']);

  assert.deepStrictEqual([at('一周内每天学慕课').date, at('一周内每天学慕课').endDate],
    ['2026-10-26', '2026-11-01']);
});

test('没有持续性措辞时不误判为区间', () => {
  assert.strictEqual(core.parseSpanRange('三天后交材料', BASE), null);
  assert.strictEqual(core.parseSpanRange('明天下午三点开会', BASE), null);
});

test('localParse 产出 endDate，且单日事件 endDate 为 null', () => {
  const [span] = core.localParse('这周一到周五每天下午两点学慕课', BASE);
  assert.strictEqual(span.date, '2026-10-26');
  assert.strictEqual(span.endDate, '2026-10-30');
  assert.strictEqual(span.startTime, '14:00');

  const [single] = core.localParse('明天下午三点半在樱顶开会', BASE);
  assert.strictEqual(single.endDate, null);
});

test('只说了「每天」但没有任何日期线索 → 不猜日期', () => {
  const list = core.localParse('每天背单词', BASE);
  assert.strictEqual(list.length, 0);
});

console.log('\n时段类的展示');

test('timeDisplay 输出区间、天数与每日时段', () => {
  const line = core.timeDisplay({
    date: '2026-10-26', endDate: '2026-11-01', startTime: '09:00', endTime: '10:00',
  });
  assert.strictEqual(line, '10月26日–11月1日（7 天）· 每天 09:00–10:00');
});

test('时段类便签仍按【事件名 - 时间 - 地点 - 详情】输出', () => {
  const line = core.noteLine({
    title: '计量慕课',
    date: '2026-10-26',
    endDate: '2026-11-01',
    startTime: null,
    location: null,
    detail: '这周一到周日每天学计量慕课',
  });
  assert.strictEqual(line, '【计量慕课 - 10月26日–11月1日（7 天）· 全天 - 未提及 - 这周一到周日每天学计量慕课】');
});

test('指定日期查询：跨天事件在区间内每一天都能被筛出来', () => {
  const list = [
    { id: 'span', title: '慕课', date: '2026-10-26', endDate: '2026-10-30', detail: 'x' },
    { id: 'one', title: '组会', date: '2026-10-28', startTime: '14:00', detail: 'y' },
  ];
  const onDate = (k) => list.filter((e) => core.occursOn(e, k)).map((e) => e.id);

  assert.deepStrictEqual(onDate('2026-10-26'), ['span']);
  assert.deepStrictEqual(onDate('2026-10-28'), ['span', 'one']);
  assert.deepStrictEqual(onDate('2026-10-31'), []);
});

console.log(`\n结果：${passed} 通过 / ${failed} 失败\n`);
process.exit(failed ? 1 : 0);
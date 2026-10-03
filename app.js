/* Pocket Ledger: pocket money, expenses and spending insights.
   All data lives in localStorage under STORE_KEY. No build step, no dependencies. */
(function () {
  'use strict';

  var STORE_KEY = 'pocket-ledger.v1';
  var DEFAULT_CATEGORIES = [
    'Food & Snacks', 'Transport', 'Entertainment', 'Shopping', 'Education',
    'Mobile & Internet', 'Gifts', 'Health', 'Other'
  ];
  var CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'NZD', 'SGD', 'AED', 'JPY',
    'NPR', 'PKR', 'BDT', 'LKR', 'ZAR', 'NGN', 'KES', 'PHP', 'MYR'];
  var REGION_CURRENCY = {
    IN: 'INR', US: 'USD', GB: 'GBP', AU: 'AUD', CA: 'CAD', NZ: 'NZD', SG: 'SGD', AE: 'AED',
    JP: 'JPY', NP: 'NPR', PK: 'PKR', BD: 'BDT', LK: 'LKR', ZA: 'ZAR', NG: 'NGN', KE: 'KES',
    PH: 'PHP', MY: 'MYR', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', IE: 'EUR'
  };
  var WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  /* ---------- helpers ---------- */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function round2(n) { return Math.round(n * 100) / 100; }
  function sum(arr, fn) { return arr.reduce(function (s, x) { return s + (fn ? fn(x) : x); }, 0); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function monthKeyOf(iso) { return iso.slice(0, 7); }
  function currentMonthKey() { return monthKeyOf(todayISO()); }
  function shiftMonth(key, delta) {
    var y = +key.slice(0, 4), m = +key.slice(5, 7) - 1 + delta;
    var d = new Date(y, m, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }
  function daysInMonth(key) { return new Date(+key.slice(0, 4), +key.slice(5, 7), 0).getDate(); }
  function monthLabel(key, short) {
    var d = new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, 1);
    return d.toLocaleDateString(undefined, short ? { month: 'short' } : { month: 'long', year: 'numeric' });
  }
  function dateLabel(iso) {
    var d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  function weekdayIndex(iso) { return (new Date(iso + 'T00:00:00').getDay() + 6) % 7; } // Mon = 0
  function pct(part, whole) { return whole > 0 ? Math.round((part / whole) * 100) : 0; }

  /* ---------- state ---------- */
  function guessCurrency() {
    try {
      var loc = (navigator.languages && navigator.languages[0]) || navigator.language || '';
      var region = (loc.split('-')[1] || '').toUpperCase();
      return REGION_CURRENCY[region] || 'INR';
    } catch (e) { return 'INR'; }
  }
  function emptyState(currency) {
    return {
      version: 1,
      sample: false,
      settings: { currency: currency || guessCurrency(), goalName: '', goalAmount: 0, categories: DEFAULT_CATEGORIES.slice(), limits: {} },
      months: {},
      expenses: []
    };
  }
  function normalize(s) {
    var base = emptyState(s && s.settings && s.settings.currency);
    if (!s || typeof s !== 'object') return base;
    base.sample = !!s.sample;
    var st = s.settings || {};
    base.settings.goalName = String(st.goalName || '');
    base.settings.goalAmount = num(st.goalAmount);
    if (Array.isArray(st.categories) && st.categories.length) base.settings.categories = st.categories.map(String);
    if (st.limits && typeof st.limits === 'object') base.settings.limits = st.limits;
    if (s.months && typeof s.months === 'object') base.months = s.months;
    if (Array.isArray(s.expenses)) {
      base.expenses = s.expenses.filter(function (e) {
        return e && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && num(e.amount) > 0;
      }).map(function (e) {
        return {
          id: e.id || uid(), date: e.date, amount: round2(num(e.amount)),
          category: String(e.category || 'Other'), reason: String(e.reason || ''),
          type: e.type === 'want' ? 'want' : 'need', method: String(e.method || 'Cash')
        };
      });
    }
    return base;
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* storage blocked or corrupt: fall through */ }
    return null;
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function monthData(key) {
    if (!state.months[key]) state.months[key] = { allowance: 0, savingTarget: 0, extras: [] };
    var m = state.months[key];
    if (!Array.isArray(m.extras)) m.extras = [];
    return m;
  }
  function peekMonth(key) { return state.months[key] || { allowance: 0, savingTarget: 0, extras: [] }; }

  /* ---------- sample data ---------- */
  var SAMPLE_ALLOWANCE = { INR: 4000, JPY: 20000, PKR: 10000, NPR: 6000, BDT: 5000, LKR: 12000, NGN: 30000, KES: 5000, PHP: 2500 };
  function sampleState(currency) {
    var s = emptyState(currency);
    s.sample = true;
    var allowance = SAMPLE_ALLOWANCE[currency] || 200;
    var unit = allowance / 100; // amounts below are in "% of allowance"
    var seed = 7;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    var templates = [
      [3, 'Food & Snacks', 'Samosa and chai at the canteen', 'want'],
      [5, 'Food & Snacks', 'Lunch with friends after class', 'want'],
      [2, 'Food & Snacks', 'Chips and a cold drink', 'want'],
      [4, 'Transport', 'Bus pass top-up', 'need'],
      [2.5, 'Transport', 'Auto ride home', 'need'],
      [9, 'Entertainment', 'Movie ticket and popcorn', 'want'],
      [6, 'Entertainment', 'Game top-up', 'want'],
      [14, 'Shopping', 'New T-shirt', 'want'],
      [6, 'Education', 'Notebooks and pens', 'need'],
      [10, 'Mobile & Internet', 'Monthly phone recharge', 'need'],
      [8, 'Gifts', "Friend's birthday gift", 'want'],
      [3, 'Health', 'Pharmacy', 'need']
    ];
    var thisKey = currentMonthKey();
    [-2, -1, 0].forEach(function (delta) {
      var key = shiftMonth(thisKey, delta);
      s.months[key] = { allowance: allowance, savingTarget: round2(allowance * 0.2), extras: [] };
      if (delta === -1) s.months[key].extras.push({ id: uid(), note: 'Birthday money from grandparents', amount: round2(allowance * 0.25) });
      var lastDay = delta === 0 ? new Date().getDate() : daysInMonth(key);
      var count = delta === 0 ? Math.max(4, Math.round(lastDay * 0.55)) : 13 - delta * 2;
      // Fixed monthly items first
      s.expenses.push({ id: uid(), date: key + '-02', amount: round2(10 * unit), category: 'Mobile & Internet', reason: 'Monthly phone recharge', type: 'need', method: 'UPI / Wallet' });
      for (var i = 0; i < count; i++) {
        var t = templates[Math.floor(rnd() * templates.length)];
        if (t[1] === 'Mobile & Internet') t = templates[0];
        // Food grows month over month so the guide has something to say
        var boost = t[1] === 'Food & Snacks' ? 1 + (delta + 2) * 0.25 : 1;
        var day = 1 + Math.floor(rnd() * lastDay);
        s.expenses.push({
          id: uid(), date: key + '-' + pad(day),
          amount: round2(t[0] * unit * (0.7 + rnd() * 0.6) * boost),
          category: t[1], reason: t[2], type: t[3],
          method: rnd() > 0.5 ? 'Cash' : 'UPI / Wallet'
        });
      }
    });
    s.settings.goalName = 'New headphones';
    s.settings.goalAmount = round2(allowance * 1.5);
    s.settings.limits = { 'Food & Snacks': round2(allowance * 0.3), 'Entertainment': round2(allowance * 0.15) };
    return s;
  }

  var state = load();
  if (!state) { state = sampleState(guessCurrency()); save(); }
  var view = { month: currentMonthKey(), tab: 'overview', editing: null };

  /* ---------- money formatting ---------- */
  var fmtCache = {};
  function fmt(n, opts) {
    var cur = state.settings.currency;
    var dec = opts && opts.whole ? 0 : (Math.abs(n % 1) > 0.004 ? 2 : 0);
    var k = cur + dec;
    if (!fmtCache[k]) {
      try { fmtCache[k] = new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, minimumFractionDigits: dec, maximumFractionDigits: dec }); }
      catch (e) { fmtCache[k] = { format: function (x) { return cur + ' ' + x.toFixed(dec); } }; }
    }
    return fmtCache[k].format(n);
  }
  function compact(n) {
    var cur = state.settings.currency;
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, notation: 'compact', maximumFractionDigits: 1 }).format(n); }
    catch (e) { return fmt(n, { whole: true }); }
  }
  function currencySymbol() {
    try {
      var parts = new Intl.NumberFormat(undefined, { style: 'currency', currency: state.settings.currency }).formatToParts(0);
      var p = parts.find(function (x) { return x.type === 'currency'; });
      return p ? p.value : state.settings.currency;
    } catch (e) { return state.settings.currency; }
  }

  /* ---------- analysis ---------- */
  function expensesIn(key) { return state.expenses.filter(function (e) { return monthKeyOf(e.date) === key; }); }
  function byCategory(list) {
    var out = {};
    list.forEach(function (e) { out[e.category] = (out[e.category] || 0) + e.amount; });
    return out;
  }
  function analyze(key) {
    var m = peekMonth(key);
    var list = expensesIn(key);
    var income = num(m.allowance) + sum(m.extras || [], function (x) { return num(x.amount); });
    var spent = sum(list, function (e) { return e.amount; });
    var savingTarget = num(m.savingTarget);
    var spendLimit = Math.max(0, income - savingTarget);
    var dim = daysInMonth(key);
    var cur = currentMonthKey();
    var isCurrent = key === cur, isPast = key < cur;
    var dayNow = isCurrent ? new Date().getDate() : (isPast ? dim : 0);
    var daysLeft = isCurrent ? dim - dayNow + 1 : (isPast ? 0 : dim);
    var cats = byCategory(list);
    var catList = Object.keys(cats).map(function (c) { return { name: c, amount: cats[c] }; })
      .sort(function (a, b) { return b.amount - a.amount; });
    var prevKey = shiftMonth(key, -1);
    var prevList = expensesIn(prevKey);
    var prevCats = byCategory(prevList);
    var needs = sum(list.filter(function (e) { return e.type === 'need'; }), function (e) { return e.amount; });
    var wants = spent - needs;
    var weekday = [0, 0, 0, 0, 0, 0, 0];
    list.forEach(function (e) { weekday[weekdayIndex(e.date)] += e.amount; });
    var daily = new Array(dim).fill(0);
    list.forEach(function (e) { var d = +e.date.slice(8, 10); if (d >= 1 && d <= dim) daily[d - 1] += e.amount; });
    var projected = isCurrent && dayNow >= 5 ? (spent / dayNow) * dim : null;
    return {
      key: key, m: m, list: list, income: income, spent: spent, left: income - spent,
      savingTarget: savingTarget, spendLimit: spendLimit, dim: dim, dayNow: dayNow, daysLeft: daysLeft,
      isCurrent: isCurrent, isPast: isPast, cats: cats, catList: catList, prevKey: prevKey,
      prevSpent: sum(prevList, function (e) { return e.amount; }), prevCats: prevCats,
      prevHasData: prevList.length > 0,
      needs: needs, wants: wants, weekday: weekday, daily: daily, projected: projected,
      saved: income - spent
    };
  }

  function buildInsights(a) {
    var out = [];
    function add(level, title, text) { out.push({ level: level, title: title, text: text }); }
    var limits = state.settings.limits || {};

    if (a.income <= 0) {
      add('info', 'Add your pocket money for ' + monthLabel(a.key),
        'Enter what you received on the Overview tab so the guide can tell you how much is safe to spend.');
    }
    if (a.list.length === 0) {
      add('info', 'No expenses noted yet', 'Note down each thing you buy, even small snacks. The guide gets more useful with every entry.');
      return finish();
    }

    if (a.income > 0 && a.spent > a.income) {
      add('critical', 'You have spent more than you received',
        'You are ' + fmt(a.spent - a.income) + ' over the ' + fmt(a.income) + ' you had this month. Pause wants until next month.');
    } else if (a.income > 0 && a.savingTarget > 0 && a.spent > a.spendLimit) {
      add('warning', 'You are spending your savings',
        'To save ' + fmt(a.savingTarget) + ' you could spend ' + fmt(a.spendLimit) + '. You are ' + fmt(a.spent - a.spendLimit) + ' past that.');
    }

    if (a.projected !== null && a.income > 0 && a.spent <= a.spendLimit) {
      var target = a.spendLimit || a.income;
      if (a.projected > target * 1.03) {
        add(a.projected > a.income ? 'critical' : 'warning', 'Your pace is too fast',
          'At ' + fmt(a.spent / a.dayNow) + ' a day you will spend about ' + fmt(a.projected, { whole: true }) +
          ' by month end. Keep it under ' + fmt(Math.max(0, (target - a.spent) / a.daysLeft)) + ' a day for the next ' + a.daysLeft + ' days.');
      }
    }

    var top = a.catList[0];
    var topShare = pct(top.amount, a.spent);
    if (topShare >= 40 && a.catList.length > 1) {
      add('critical', 'Most of your money goes to ' + top.name,
        top.name + ' is ' + topShare + '% of your spending (' + fmt(top.amount) + '). Try setting a limit for it on the Stats tab and trim 10–20%.');
    } else if (topShare >= 30 && a.catList.length > 1) {
      add('warning', top.name + ' is your biggest spend',
        topShare + '% of your spending (' + fmt(top.amount) + ') went to ' + top.name + '. Keep an eye on it.');
    } else {
      add('info', 'Your top category is ' + top.name, topShare + '% of your spending (' + fmt(top.amount) + ').');
    }

    a.catList.forEach(function (c) {
      var lim = num(limits[c.name]);
      if (lim <= 0) return;
      var p = pct(c.amount, lim);
      if (p >= 100) add('critical', c.name + ' is over its limit', 'Spent ' + fmt(c.amount) + ' of a ' + fmt(lim) + ' limit (' + p + '%).');
      else if (p >= 80) add('warning', c.name + ' is close to its limit', 'Spent ' + fmt(c.amount) + ' of ' + fmt(lim) + ' (' + p + '%). Only ' + fmt(lim - c.amount) + ' left.');
    });

    var wantShare = pct(a.wants, a.spent);
    if (wantShare > 50) {
      add('critical', 'More than half your spending was on wants',
        wantShare + '% (' + fmt(a.wants) + ') was optional. Try the 24-hour rule before buying anything you don\'t need.');
    } else if (wantShare > 35) {
      add('warning', 'Wants are taking a big share', wantShare + '% (' + fmt(a.wants) + ') of your spending was on wants. Aim for under 30%.');
    } else if (a.spent > 0) {
      add('good', 'Good balance of needs and wants', 'Only ' + wantShare + '% of your spending was on wants.');
    }

    if (a.prevHasData) {
      a.catList.forEach(function (c) {
        var before = a.prevCats[c.name] || 0;
        var threshold = Math.max(a.income * 0.05, a.spent * 0.05);
        if (before > 0 && c.amount >= before * 1.4 && c.amount - before >= threshold) {
          add('warning', c.name + ' went up ' + pct(c.amount - before, before) + '%',
            'You spent ' + fmt(c.amount) + ' this month vs ' + fmt(before) + ' in ' + monthLabel(a.prevKey) + '.');
        }
      });
    }

    var smallCap = Math.max(a.income, a.spent) * 0.04;
    var groups = {};
    a.list.forEach(function (e) {
      if (e.amount <= smallCap) { (groups[e.category] = groups[e.category] || []).push(e); }
    });
    Object.keys(groups).forEach(function (c) {
      var g = groups[c];
      if (g.length >= 6) {
        var total = sum(g, function (e) { return e.amount; });
        add('warning', g.length + ' small buys on ' + c + ' add up',
          'Small purchases on ' + c + ' came to ' + fmt(total) + '. They are easy to miss, so set a weekly cap.');
      }
    });

    var biggest = a.list.slice().sort(function (x, y) { return y.amount - x.amount; })[0];
    if (a.income > 0 && biggest.amount > a.income * 0.25) {
      add('warning', 'One purchase took a big bite',
        '"' + biggest.reason + '" cost ' + fmt(biggest.amount) + ', which is ' + pct(biggest.amount, a.income) + '% of your money this month.');
    }

    var weekend = a.weekday[5] + a.weekday[6];
    var weekendShare = pct(weekend, a.spent);
    if (weekendShare >= 50 && a.list.length >= 6) {
      add('info', 'Weekends are when you spend', weekendShare + '% of your spending happened on Saturday and Sunday. Plan weekend outings ahead.');
    }

    if (a.income > 0 && a.savingTarget > 0 && a.spent <= a.spendLimit) {
      if (a.isPast) add('good', 'You saved ' + fmt(a.saved), 'You beat your saving target of ' + fmt(a.savingTarget) + ' for ' + monthLabel(a.key) + '.');
      else if (a.projected === null || a.projected <= a.spendLimit) add('good', 'On track to save ' + fmt(a.savingTarget), 'Keep spending at this pace and you will hit your saving target for the month.');
    }

    return finish();

    function finish() {
      var rank = { critical: 0, warning: 1, info: 2, good: 3 };
      return out.sort(function (x, y) { return rank[x.level] - rank[y.level]; });
    }
  }

  function healthScore(insights, a) {
    if (!a.list.length) return null;
    var score = 100;
    insights.forEach(function (i) {
      if (i.level === 'critical') score -= 22;
      else if (i.level === 'warning') score -= 10;
      else if (i.level === 'good') score += 4;
    });
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /* ---------- rendering: shared ---------- */
  function setText(id, t) { var el = document.getElementById(id); if (el) el.textContent = t; }
  function renderInsightList(el, items) {
    el.innerHTML = items.map(function (i) {
      var icon = { critical: '!', warning: '!', good: '✓', info: 'i' }[i.level];
      var tag = { critical: 'Caution', warning: 'Watch', good: 'Nice', info: 'Note' }[i.level];
      return '<li class="insight ' + i.level + '"><span class="ico" aria-hidden="true">' + icon + '</span>' +
        '<h3><span class="tag">' + tag + '</span>' + esc(i.title) + '</h3><p>' + esc(i.text) + '</p></li>';
    }).join('');
  }

  function render() {
    $('#monthInput').value = view.month;
    $$('.js-month-label').forEach(function (el) { el.textContent = monthLabel(view.month); });
    var sym = currencySymbol();
    $$('.js-cur').forEach(function (el) { el.textContent = sym; });
    $('#sampleBanner').hidden = !state.sample;
    renderCategoryOptions();
    var a = analyze(view.month);
    var insights = buildInsights(a);
    renderOverview(a, insights);
    if (view.tab === 'expenses') renderExpenses();
    if (view.tab === 'stats') renderStats(a);
    if (view.tab === 'guide') renderGuide(a, insights);
    if (view.tab === 'settings') renderSettings();
  }

  function renderCategoryOptions() {
    var cats = allCategories();
    var sel = $('#expCategory'), keep = sel.value;
    sel.innerHTML = cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    if (cats.indexOf(keep) >= 0) sel.value = keep;
    var f = $('#filterCat'), fk = f.value;
    f.innerHTML = '<option value="">All categories</option>' + cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    f.value = fk;
  }
  function allCategories() {
    var cats = state.settings.categories.slice();
    state.expenses.forEach(function (e) { if (cats.indexOf(e.category) < 0) cats.push(e.category); });
    return cats;
  }

  /* ---------- overview ---------- */
  function renderOverview(a, insights) {
    var m = peekMonth(view.month);
    var ai = $('#allowanceInput'), st = $('#savingTargetInput');
    if (document.activeElement !== ai) ai.value = m.allowance ? m.allowance : '';
    if (document.activeElement !== st) st.value = m.savingTarget ? m.savingTarget : '';

    var extras = m.extras || [];
    setText('extraCount', extras.length);
    $('#extraList').innerHTML = extras.map(function (x) {
      return '<li><span>' + esc(x.note || 'Extra') + '</span><span class="amt">' + fmt(num(x.amount)) + '</span>' +
        '<button class="link-btn" type="button" data-del-extra="' + esc(x.id) + '" aria-label="Remove ' + esc(x.note) + '">Remove</button></li>';
    }).join('');

    setText('kvIn', fmt(a.income));
    setText('kvSpent', fmt(a.spent));
    setText('kvLeft', fmt(a.left));
    $('#kvLeft').classList.toggle('neg', a.left < 0);
    if (a.isPast) setText('kvDaily', 'Month ended');
    else if (a.income <= 0) setText('kvDaily', '—');
    else {
      var safe = (a.spendLimit - a.spent) / Math.max(1, a.daysLeft);
      setText('kvDaily', safe > 0 ? fmt(safe) : fmt(0));
      $('#kvDaily').classList.toggle('neg', safe <= 0);
    }

    var fill = $('#meterFill'), status = $('#meterStatus');
    var usedPct = a.income > 0 ? (a.spent / a.income) * 100 : 0;
    fill.style.width = Math.min(100, usedPct) + '%';
    fill.className = 'meter-fill' + (a.spent > a.income && a.income > 0 ? ' over' : (a.spent > a.spendLimit && a.income > 0 ? ' warn' : ''));
    var tgt = $('#meterTarget');
    tgt.hidden = !(a.income > 0 && a.savingTarget > 0);
    tgt.style.left = a.income > 0 ? Math.min(100, (a.spendLimit / a.income) * 100) + '%' : '0';
    $('#budgetMeter').setAttribute('aria-label', 'Spent ' + Math.round(usedPct) + '% of money in');
    setText('meterText', a.income > 0 ? Math.round(usedPct) + '% of your money used' : 'Enter your pocket money to see your budget');
    if (a.income <= 0) { status.className = 'pill none'; status.textContent = 'No budget yet'; }
    else if (a.spent > a.income) { status.className = 'pill over'; status.textContent = 'Overspent'; }
    else if (a.spent > a.spendLimit || (a.projected !== null && a.projected > a.spendLimit * 1.03)) { status.className = 'pill warn'; status.textContent = 'Slow down'; }
    else { status.className = 'pill good'; status.textContent = 'On track'; }

    renderGoal();

    var top = insights.filter(function (i) { return i.level === 'critical' || i.level === 'warning'; }).slice(0, 3);
    if (!top.length) top = insights.slice(0, 2);
    renderInsightList($('#topInsights'), top);
  }

  function renderGoal() {
    var s = state.settings, box = $('#goalBox');
    if (!s.goalName || !(s.goalAmount > 0)) {
      box.innerHTML = '<span>Set a long-term saving goal in Settings to track progress here.</span>';
      return;
    }
    // Saved so far = income minus spending across every month up to and including today's month
    var keys = Object.keys(state.months).filter(function (k) { return k <= currentMonthKey(); });
    var saved = 0;
    keys.forEach(function (k) { var a = analyze(k); saved += a.isCurrent ? 0 : a.saved; });
    saved = Math.max(0, saved);
    var p = Math.min(100, pct(saved, s.goalAmount));
    var pastMonths = keys.filter(function (k) { return k < currentMonthKey(); }).length;
    var avg = pastMonths ? saved / pastMonths : 0;
    var remaining = Math.max(0, s.goalAmount - saved);
    var eta = remaining <= 0 ? 'Goal reached! 🎉' : (avg > 0 ? 'About ' + Math.ceil(remaining / avg) + ' more month(s) at your average saving of ' + fmt(avg, { whole: true }) + '/month.' : 'Save something this month to start the countdown.');
    box.innerHTML = '<div><strong>' + esc(s.goalName) + '</strong>: ' + fmt(saved, { whole: true }) + ' of ' + fmt(s.goalAmount, { whole: true }) + ' (' + p + '%)</div>' +
      '<div class="goal-bar" role="img" aria-label="' + p + '% of goal saved"><i style="width:' + p + '%"></i></div><div>' + esc(eta) + '</div>';
  }

  /* ---------- expenses ---------- */
  function renderExpenses() {
    var text = $('#filterText').value.trim().toLowerCase();
    var cat = $('#filterCat').value, type = $('#filterType').value;
    var rows = expensesIn(view.month).filter(function (e) {
      return (!cat || e.category === cat) && (!type || e.type === type) &&
        (!text || e.reason.toLowerCase().indexOf(text) >= 0 || e.category.toLowerCase().indexOf(text) >= 0);
    }).sort(function (x, y) { return y.date < x.date ? -1 : y.date > x.date ? 1 : 0; });
    $('#expenseRows').innerHTML = rows.map(function (e) {
      return '<tr><td class="date">' + esc(dateLabel(e.date)) + '</td><td>' + esc(e.category) + '</td>' +
        '<td class="reason">' + esc(e.reason) + '<div class="hint" style="margin:0;font-size:.78rem">' + esc(e.method) + '</div></td>' +
        '<td><span class="tag-type ' + e.type + '">' + (e.type === 'want' ? 'Want' : 'Need') + '</span></td>' +
        '<td class="num">' + fmt(e.amount) + '</td>' +
        '<td class="actions"><button type="button" data-edit="' + e.id + '">Edit</button><button type="button" class="del" data-del="' + e.id + '">Delete</button></td></tr>';
    }).join('');
    setText('expenseTotal', fmt(sum(rows, function (e) { return e.amount; })));
    $('#expenseEmpty').hidden = expensesIn(view.month).length > 0;
  }

  /* ---------- charts (hand-built SVG) ---------- */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(w, h) {
    var s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    s.setAttribute('width', w); s.setAttribute('height', h);
    return s;
  }
  function el(name, attrs, parent, text) {
    var n = document.createElementNS(SVGNS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function niceStep(raw) {
    if (raw <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  // Even ticks covering [lo, hi] with about `count` steps
  function niceTicks(lo, hi, count) {
    var step = niceStep((hi - lo) / count || 1);
    var start = Math.floor(lo / step) * step, end = Math.ceil(hi / step) * step;
    if (end <= start) end = start + step;
    var ticks = [];
    for (var v = start; v <= end + step / 2; v += step) ticks.push(round2(v));
    return { min: start, max: end, ticks: ticks };
  }
  // Bar with 4px rounded data-end and square baseline end
  function barPath(x, y, w, h, dir) {
    var r = Math.min(4, (dir === 'h' ? h : w) / 2, dir === 'h' ? w : h);
    if (r <= 0 || w <= 0 || h <= 0) return 'M' + x + ',' + y + 'h' + Math.max(0, w) + 'v' + Math.max(0, h) + 'h' + (-Math.max(0, w)) + 'Z';
    if (dir === 'h') { // grows right, rounded on right end
      return 'M' + x + ',' + y + 'h' + (w - r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + 'v' + (h - 2 * r) +
        'a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + r + 'h' + (-(w - r)) + 'Z';
    }
    if (dir === 'down') { // negative bar grows down from baseline, rounded at bottom
      return 'M' + x + ',' + y + 'h' + w + 'v' + (h - r) + 'a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + r + 'h' + (-(w - 2 * r)) +
        'a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + (-r) + 'Z';
    }
    // grows up, rounded on top
    return 'M' + x + ',' + (y + h) + 'v' + (-(h - r)) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + (-r) + 'h' + (w - 2 * r) +
      'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + 'v' + (h - r) + 'Z';
  }
  function emptyChart(host, msg) { host.innerHTML = '<p class="chart-empty">' + esc(msg) + '</p>'; }
  function widthOf(host) { return Math.max(260, Math.floor(host.clientWidth || host.parentNode.clientWidth || 320)); }

  function chartCategories(a) {
    var host = $('#catChart');
    if (!a.catList.length) return emptyChart(host, 'No spending this month yet.');
    var W = widthOf(host), rowH = 34, labelW = Math.min(150, W * 0.36), valueW = 92;
    var H = a.catList.length * rowH + 4;
    var s = svg(W, H), max = a.catList[0].amount, plotW = W - labelW - valueW;
    var limits = state.settings.limits || {};
    a.catList.forEach(function (c, i) {
      var y = i * rowH + 6, bh = 18;
      var w = Math.max(2, (c.amount / max) * plotW);
      var g = el('g', { 'class': 'mark' }, s);
      el('text', { x: labelW - 10, y: y + bh / 2 + 4, 'text-anchor': 'end', 'class': 'label-text' }, g, truncate(c.name, labelW));
      el('path', { d: barPath(labelW, y, w, bh, 'h'), fill: 'var(--series-1)' }, g);
      el('text', { x: labelW + w + 8, y: y + bh / 2 + 4, 'class': 'value-text' }, g, compact(c.amount) + ' · ' + pct(c.amount, a.spent) + '%');
      var lim = num(limits[c.name]);
      var prev = a.prevCats[c.name] || 0;
      var tip = '<div>' + esc(c.name) + '</div><b>' + fmt(c.amount) + '</b> · ' + pct(c.amount, a.spent) + '% of spending' +
        (lim > 0 ? '<br>Limit ' + fmt(lim) + ' (' + pct(c.amount, lim) + '% used)' : '') +
        (a.prevHasData ? '<br>Last month ' + fmt(prev) : '');
      el('rect', { x: 0, y: i * rowH, width: W, height: rowH, 'class': 'hit', 'data-tip': tip }, g);
    });
    host.innerHTML = ''; host.appendChild(s);
  }
  function truncate(t, px) { var max = Math.floor(px / 7); return t.length > max ? t.slice(0, max - 1) + '…' : t; }

  function chartPace(a) {
    var host = $('#paceChart');
    if (a.income <= 0 && !a.list.length) return emptyChart(host, 'Add your pocket money and expenses to see your pace.');
    var W = widthOf(host), H = 230, L = 52, R = 14, T = 26, B = 26;
    var pw = W - L - R, ph = H - T - B;
    var lastDay = a.isPast ? a.dim : (a.isCurrent ? a.dayNow : 0);
    var cum = [], run = 0;
    for (var d = 0; d < lastDay; d++) { run += a.daily[d]; cum.push(run); }
    var target = a.spendLimit > 0 ? a.spendLimit : a.income;
    var scale = niceTicks(0, Math.max(target, run, a.income, 1), 4), yMax = scale.max;
    var x = function (day) { return L + (day / a.dim) * pw; };
    var y = function (v) { return T + ph - (v / yMax) * ph; };
    var s = svg(W, H);
    scale.ticks.forEach(function (v, t) {
      var yy = y(v);
      el('line', { x1: L, x2: W - R, y1: yy, y2: yy, 'class': t === 0 ? 'baseline' : 'gridline' }, s);
      el('text', { x: L - 8, y: yy + 4, 'text-anchor': 'end', 'class': 'axis-text' }, s, compact(v));
    });
    [1, 8, 15, 22, a.dim].forEach(function (day) {
      el('text', { x: x(day), y: H - 6, 'text-anchor': 'middle', 'class': 'axis-text' }, s, day === 1 ? '1 ' + monthLabel(a.key, true) : String(day));
    });
    if (target > 0) {
      el('line', { x1: x(0), y1: y(0), x2: x(a.dim), y2: y(target), stroke: 'var(--muted)', 'stroke-width': 2, 'stroke-dasharray': '5 5', fill: 'none' }, s);
      el('text', { x: x(a.dim) - 4, y: y(target) - 8, 'text-anchor': 'end', 'class': 'value-text' }, s, 'Even pace → ' + compact(target));
    }
    if (cum.length) {
      var pts = cum.map(function (v, i) { return [x(i + 1), y(v)]; });
      pts.unshift([x(0), y(0)]);
      var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('');
      el('path', { d: line + 'L' + pts[pts.length - 1][0] + ',' + y(0) + 'L' + x(0) + ',' + y(0) + 'Z', fill: 'var(--series-1)', opacity: 0.12 }, s);
      el('path', { d: line, fill: 'none', stroke: 'var(--series-1)', 'stroke-width': 2, 'stroke-linejoin': 'round' }, s);
      var end = pts[pts.length - 1];
      el('circle', { cx: end[0], cy: end[1], r: 4.5, fill: 'var(--series-1)', stroke: 'var(--surface)', 'stroke-width': 2 }, s);
      var labelLeft = end[0] > W - 120;
      el('text', { x: end[0] + (labelLeft ? -10 : 10), y: end[1] - 10, 'text-anchor': labelLeft ? 'end' : 'start', 'class': 'label-text' }, s, 'Spent ' + compact(run));
      // crosshair hover
      var cross = el('line', { y1: T, y2: T + ph, stroke: 'var(--axis)', 'stroke-width': 1, visibility: 'hidden' }, s);
      var dot = el('circle', { r: 4, fill: 'var(--series-1)', stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' }, s);
      var hit = el('rect', { x: L, y: T, width: pw, height: ph, 'class': 'hit' }, s);
      hit.addEventListener('mousemove', function (ev) {
        var r = s.getBoundingClientRect();
        var px = (ev.clientX - r.left) * (W / r.width);
        var day = Math.max(1, Math.min(lastDay, Math.round(((px - L) / pw) * a.dim)));
        var v = cum[day - 1], cx = x(day), cy = y(v);
        cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
        dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('visibility', 'visible');
        var ideal = target * (day / a.dim);
        showTip('<div>' + esc(dateLabel(a.key + '-' + pad(day))) + '</div>Spent so far <b>' + fmt(v) + '</b><br>That day <b>' + fmt(a.daily[day - 1]) + '</b>' +
          (target > 0 ? '<br>Even pace <b>' + fmt(ideal, { whole: true }) + '</b>' : ''), ev);
      });
      hit.addEventListener('mouseleave', function () { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); hideTip(); });
    }
    host.innerHTML = '<div class="legend"><span><i class="line" style="background:var(--series-1)"></i>Spent so far</span>' +
      (target > 0 ? '<span><i class="dash"></i>Even pace to save your target</span>' : '') + '</div>';
    host.appendChild(s);
  }

  function chartNeedWant(a) {
    var host = $('#needWantChart');
    if (!a.spent) return emptyChart(host, 'No spending this month yet.');
    var W = widthOf(host), H = 64, bh = 28;
    var s = svg(W, H);
    var nw = (a.needs / a.spent) * W, ww = W - nw, gap = a.needs && a.wants ? 2 : 0;
    if (a.needs) {
      var g1 = el('g', {}, s);
      el('rect', { x: 0, y: 0, width: Math.max(0, nw - gap / 2), height: bh, rx: 4, fill: 'var(--series-1)' }, g1);
      el('rect', { x: 0, y: 0, width: Math.max(0, nw - gap / 2), height: bh, 'class': 'hit', 'data-tip': 'Needs <b>' + fmt(a.needs) + '</b> · ' + pct(a.needs, a.spent) + '%' }, g1);
    }
    if (a.wants) {
      var g2 = el('g', {}, s);
      el('rect', { x: nw + gap / 2, y: 0, width: Math.max(0, ww - gap / 2), height: bh, rx: 4, fill: 'var(--series-2)' }, g2);
      el('rect', { x: nw + gap / 2, y: 0, width: Math.max(0, ww - gap / 2), height: bh, 'class': 'hit', 'data-tip': 'Wants <b>' + fmt(a.wants) + '</b> · ' + pct(a.wants, a.spent) + '%' }, g2);
    }
    el('text', { x: 0, y: bh + 22, 'class': 'label-text' }, s, 'Needs ' + pct(a.needs, a.spent) + '% · ' + compact(a.needs));
    el('text', { x: W, y: bh + 22, 'text-anchor': 'end', 'class': 'label-text' }, s, 'Wants ' + pct(a.wants, a.spent) + '% · ' + compact(a.wants));
    // Per-category wants list
    var wantCats = {};
    a.list.forEach(function (e) { if (e.type === 'want') wantCats[e.category] = (wantCats[e.category] || 0) + e.amount; });
    var wl = Object.keys(wantCats).sort(function (x, y) { return wantCats[y] - wantCats[x]; }).slice(0, 3);
    host.innerHTML = '<div class="legend"><span><i style="background:var(--series-1)"></i>Needs</span><span><i style="background:var(--series-2)"></i>Wants</span></div>';
    host.appendChild(s);
    if (wl.length) {
      var p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'Most of your wants: ' + wl.map(function (c) { return c + ' (' + fmt(wantCats[c], { whole: true }) + ')'; }).join(', ') + '.';
      host.appendChild(p);
    }
  }

  function chartWeekday(a) {
    var host = $('#weekdayChart');
    if (!a.spent) return emptyChart(host, 'No spending this month yet.');
    var W = widthOf(host), H = 200, L = 6, R = 6, T = 22, B = 24;
    var pw = W - L - R, ph = H - T - B, max = Math.max.apply(null, a.weekday) || 1;
    var slot = pw / 7, bw = Math.min(42, slot - 10);
    var s = svg(W, H);
    el('line', { x1: L, x2: W - R, y1: T + ph, y2: T + ph, 'class': 'baseline' }, s);
    var topIdx = a.weekday.indexOf(max);
    a.weekday.forEach(function (v, i) {
      var h = (v / max) * ph, x = L + i * slot + (slot - bw) / 2, y = T + ph - h;
      var g = el('g', { 'class': 'mark' }, s);
      if (v > 0) el('path', { d: barPath(x, y, bw, h, 'up'), fill: 'var(--series-1)' }, g);
      el('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle', 'class': 'axis-text' }, g, WEEKDAYS[i]);
      if (i === topIdx && v > 0) el('text', { x: x + bw / 2, y: y - 6, 'text-anchor': 'middle', 'class': 'value-text' }, g, compact(v));
      el('rect', { x: L + i * slot, y: T, width: slot, height: ph, 'class': 'hit', 'data-tip': WEEKDAYS[i] + ' <b>' + fmt(v) + '</b> · ' + pct(v, a.spent) + '%' }, g);
    });
    host.innerHTML = ''; host.appendChild(s);
  }

  function chartHistory() {
    var host = $('#historyChart');
    var keys = [];
    for (var i = 5; i >= 0; i--) keys.push(shiftMonth(view.month, -i));
    var data = keys.map(function (k) { var a = analyze(k); return { key: k, spent: a.spent, saved: a.income > 0 ? a.income - a.spent : 0, income: a.income }; });
    if (!data.some(function (d) { return d.spent || d.income; })) return emptyChart(host, 'Nothing recorded in the last 6 months yet.');
    var W = widthOf(host), H = 240, L = 52, R = 8, T = 18, B = 26;
    var pw = W - L - R, ph = H - T - B;
    var hi = Math.max.apply(null, data.map(function (d) { return Math.max(d.spent, d.saved); }));
    var lo = Math.min(0, Math.min.apply(null, data.map(function (d) { return d.saved; })));
    var scale = niceTicks(lo, Math.max(hi, 1), 4), yMax = scale.max, yMin = scale.min;
    var y = function (v) { return T + ((yMax - v) / (yMax - yMin)) * ph; };
    var s = svg(W, H);
    scale.ticks.forEach(function (v) {
      el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), 'class': 'gridline' }, s);
      el('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', 'class': 'axis-text' }, s, compact(v));
    });
    el('line', { x1: L, x2: W - R, y1: y(0), y2: y(0), 'class': 'baseline' }, s);
    var slot = pw / data.length, bw = Math.min(26, (slot - 14) / 2);
    data.forEach(function (d, i) {
      var cx = L + i * slot + slot / 2;
      var g = el('g', { 'class': 'mark' }, s);
      if (d.spent > 0) el('path', { d: barPath(cx - bw - 1, y(d.spent), bw, y(0) - y(d.spent), 'up'), fill: 'var(--series-1)' }, g);
      if (d.saved > 0) el('path', { d: barPath(cx + 1, y(d.saved), bw, y(0) - y(d.saved), 'up'), fill: 'var(--series-2)' }, g);
      if (d.saved < 0) el('path', { d: barPath(cx + 1, y(0), bw, y(d.saved) - y(0), 'down'), fill: 'var(--series-2)' }, g);
      el('text', { x: cx, y: H - 6, 'text-anchor': 'middle', 'class': 'axis-text' }, g, monthLabel(d.key, true));
      el('rect', { x: L + i * slot, y: T, width: slot, height: ph, 'class': 'hit',
        'data-tip': '<div>' + esc(monthLabel(d.key)) + '</div>Money in <b>' + fmt(d.income) + '</b><br>Spent <b>' + fmt(d.spent) + '</b><br>' + (d.saved < 0 ? 'Overspent' : 'Saved') + ' <b>' + fmt(Math.abs(d.saved)) + '</b>' }, g);
    });
    host.innerHTML = '<div class="legend"><span><i style="background:var(--series-1)"></i>Spent</span><span><i style="background:var(--series-2)"></i>Saved (below zero = overspent)</span></div>';
    host.appendChild(s);
  }

  /* ---------- stats ---------- */
  function renderStats(a) {
    var tiles = [];
    var avgDay = a.dayNow > 0 ? a.spent / a.dayNow : 0;
    var change = a.prevHasData && a.prevSpent > 0 ? pct(a.spent - a.prevSpent, a.prevSpent) : null;
    tiles.push(['Total spent', fmt(a.spent, { whole: true }),
      change === null ? 'No data for last month' : (change >= 0 ? '▲ ' + change + '% vs ' : '▼ ' + Math.abs(change) + '% vs ') + monthLabel(a.prevKey, true),
      change === null ? '' : (change > 0 ? 'up' : 'down')]);
    tiles.push(['Saved', fmt(a.income > 0 ? a.saved : 0, { whole: true }),
      a.income > 0 ? pct(Math.max(0, a.saved), a.income) + '% of money in' + (a.savingTarget ? ' · target ' + fmt(a.savingTarget, { whole: true }) : '') : 'Set pocket money first', a.saved < 0 ? 'up' : '']);
    tiles.push(['Daily average', fmt(avgDay), a.dayNow ? 'over ' + a.dayNow + ' day' + (a.dayNow > 1 ? 's' : '') : 'Month not started', '']);
    tiles.push(['Expenses noted', String(a.list.length), a.list.length ? 'avg ' + fmt(a.spent / a.list.length) + ' each' : '', '']);
    if (a.projected !== null) tiles.push(['Month-end forecast', fmt(a.projected, { whole: true }), a.income > 0 ? (a.projected > a.income ? 'More than you have' : pct(a.projected, a.income) + '% of money in') : '', a.projected > (a.spendLimit || a.income) ? 'up' : 'down']);
    $('#statTiles').innerHTML = tiles.map(function (t) {
      return '<div class="tile"><span class="lbl">' + esc(t[0]) + '</span><span class="val">' + esc(t[1]) + '</span><span class="sub ' + t[3] + '">' + esc(t[2]) + '</span></div>';
    }).join('');

    chartCategories(a);
    chartPace(a);
    chartNeedWant(a);
    chartWeekday(a);
    chartHistory();
    renderLimits(a);
  }

  function renderLimits(a) {
    var limits = state.settings.limits || {};
    var cats = allCategories();
    $('#limitTable tbody').innerHTML = cats.map(function (c) {
      var spent = a.cats[c] || 0, prev = a.prevCats[c] || 0, lim = num(limits[c]);
      var status = '<span class="pill none">No limit</span>';
      if (lim > 0) {
        var p = pct(spent, lim);
        status = p >= 100 ? '<span class="pill over">Over · ' + p + '%</span>' : p >= 80 ? '<span class="pill warn">Close · ' + p + '%</span>' : '<span class="pill good">OK · ' + p + '%</span>';
      }
      var id = 'limit-' + c.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      return '<tr><td>' + esc(c) + '</td><td class="num">' + fmt(spent) + '</td><td class="num">' + (a.prevHasData ? fmt(prev) : '—') + '</td>' +
        '<td><label class="sr-only" for="' + id + '">Limit for ' + esc(c) + '</label><input type="number" min="0" step="1" id="' + id + '" data-limit="' + esc(c) + '" value="' + (lim > 0 ? lim : '') + '" placeholder="None"></td>' +
        '<td>' + status + '</td></tr>';
    }).join('');
  }

  /* ---------- guide ---------- */
  function renderGuide(a, insights) {
    var score = healthScore(insights, a);
    var hero = $('#guideHero');
    if (score === null) {
      hero.innerHTML = '<div><h2>Your money guide</h2><p>Note down a few expenses for ' + esc(monthLabel(a.key)) + ' and this page will show where your money goes, what to watch out for and how to save more.</p></div>';
    } else {
      var label = score >= 80 ? 'Healthy spending' : score >= 55 ? 'Needs some attention' : 'Spending needs a reset';
      var col = score >= 80 ? 'var(--good)' : score >= 55 ? 'var(--warning)' : 'var(--critical)';
      var C = 2 * Math.PI * 44, off = C * (1 - score / 100);
      var crit = insights.filter(function (i) { return i.level === 'critical'; }).length;
      var warn = insights.filter(function (i) { return i.level === 'warning'; }).length;
      var top = a.catList[0];
      hero.innerHTML = '<svg class="score-ring" viewBox="0 0 104 104" role="img" aria-label="Spending score ' + score + ' out of 100">' +
        '<circle cx="52" cy="52" r="44" fill="none" stroke="var(--line)" stroke-width="9"></circle>' +
        '<circle cx="52" cy="52" r="44" fill="none" stroke="' + col + '" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 52 52)"></circle>' +
        '<text x="52" y="58" text-anchor="middle" font-size="26">' + score + '</text></svg>' +
        '<div><h2>' + label + '</h2><p>You spent ' + esc(fmt(a.spent)) + (a.income > 0 ? ' of ' + esc(fmt(a.income)) : '') + ' in ' + esc(monthLabel(a.key)) +
        '. Most went to <strong>' + esc(top.name) + '</strong> (' + pct(top.amount, a.spent) + '%). ' +
        (crit + warn ? 'Below you\'ll find ' + (crit ? crit + ' caution' + (crit > 1 ? 's' : '') : '') + (crit && warn ? ' and ' : '') + (warn ? warn + ' thing' + (warn > 1 ? 's' : '') + ' to watch' : '') + '.' : 'Nothing worrying this month. Keep it up.') +
        '</p></div>';
    }
    renderInsightList($('#allInsights'), insights);
    var big = a.list.slice().sort(function (x, y) { return y.amount - x.amount; }).slice(0, 5);
    $('#biggestList').innerHTML = big.length ? big.map(function (e) {
      return '<li><span class="amt">' + fmt(e.amount) + '</span> · ' + esc(e.reason) + ' <span class="meta">' + esc(e.category) + ', ' + esc(dateLabel(e.date)) + ', ' + (e.type === 'want' ? 'want' : 'need') + '</span></li>';
    }).join('') : '<li class="meta" style="list-style:none;margin-left:-22px">Nothing yet.</li>';
  }

  /* ---------- settings ---------- */
  function renderSettings() {
    var sel = $('#currencySelect');
    if (!sel.options.length) {
      sel.innerHTML = CURRENCIES.map(function (c) {
        var name = c;
        try { name = new Intl.DisplayNames(undefined, { type: 'currency' }).of(c) + ' (' + c + ')'; } catch (e) { /* older browsers */ }
        return '<option value="' + c + '">' + esc(name) + '</option>';
      }).join('');
    }
    sel.value = state.settings.currency;
    $('#goalName').value = state.settings.goalName || '';
    $('#goalAmount').value = state.settings.goalAmount || '';
    $('#catChips').innerHTML = state.settings.categories.map(function (c) {
      return '<li>' + esc(c) + '<button type="button" data-del-cat="' + esc(c) + '" aria-label="Remove ' + esc(c) + '">×</button></li>';
    }).join('');
  }

  /* ---------- tooltip ---------- */
  var tipEl = $('#tooltip');
  function showTip(html, ev) {
    tipEl.innerHTML = html; tipEl.hidden = false;
    var pad = 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var x = ev.clientX + pad, y = ev.clientY - h - pad;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
    if (y < 8) y = ev.clientY + pad;
    tipEl.style.left = Math.max(8, x) + 'px'; tipEl.style.top = y + 'px';
  }
  function hideTip() { tipEl.hidden = true; }
  document.addEventListener('mousemove', function (ev) {
    var t = ev.target.closest && ev.target.closest('[data-tip]');
    $$('.chart.dim').forEach(function (c) { if (!t || !c.contains(t)) c.classList.remove('dim'); });
    $$('.mark.on').forEach(function (m) { if (!t || !m.contains(t)) m.classList.remove('on'); });
    if (t) {
      showTip(t.getAttribute('data-tip'), ev);
      var mark = t.closest('.mark'), chart = t.closest('.chart');
      if (mark && chart) { mark.classList.add('on'); chart.classList.add('dim'); }
    } else if (!(ev.target.closest && ev.target.closest('#paceChart .hit'))) hideTip();
  });
  document.addEventListener('touchstart', function (ev) {
    var t = ev.target.closest && ev.target.closest('[data-tip]');
    if (t) { var touch = ev.touches[0]; showTip(t.getAttribute('data-tip'), { clientX: touch.clientX, clientY: touch.clientY }); }
    else hideTip();
  }, { passive: true });

  /* ---------- toast ---------- */
  var toastTimer;
  function toast(msg, undo) {
    var t = $('#toast');
    t.innerHTML = esc(msg) + (undo ? ' <button type="button" class="link-btn" id="undoBtn">Undo</button>' : '');
    if (undo) $('#undoBtn').onclick = function () { undo(); t.textContent = 'Restored'; };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.textContent = ''; }, undo ? 7000 : 2500);
  }

  /* ---------- events ---------- */
  function setTab(tab) {
    view.tab = tab;
    $$('.tab').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false'); });
    $$('.panel').forEach(function (p) { p.hidden = p.dataset.panel !== tab; });
    try { sessionStorage.setItem(STORE_KEY + '.tab', tab); } catch (e) { /* ignore */ }
    if (location.hash.slice(1) !== tab) history.replaceState(null, '', '#' + tab);
    render();
  }
  $$('.tab').forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.tab); }); });
  $$('[data-goto]').forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.goto); window.scrollTo(0, 0); }); });

  function setMonth(key) {
    if (!/^\d{4}-\d{2}$/.test(key)) return;
    view.month = key;
    var exp = $('#expDate');
    if (!view.editing) exp.value = key === currentMonthKey() ? todayISO() : key + '-01';
    render();
  }
  $('#monthInput').addEventListener('change', function (e) { setMonth(e.target.value); });
  $('#prevMonth').addEventListener('click', function () { setMonth(shiftMonth(view.month, -1)); });
  $('#nextMonth').addEventListener('click', function () { setMonth(shiftMonth(view.month, 1)); });

  $('#incomeForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var m = monthData(view.month);
    m.allowance = round2(Math.max(0, num($('#allowanceInput').value)));
    m.savingTarget = round2(Math.max(0, num($('#savingTargetInput').value)));
    save(); document.activeElement.blur(); render();
    toast('Saved ' + monthLabel(view.month));
  });
  $('#addExtra').addEventListener('click', function () {
    var amt = round2(num($('#extraAmount').value));
    if (amt <= 0) { $('#extraAmount').focus(); return; }
    monthData(view.month).extras.push({ id: uid(), note: $('#extraNote').value.trim() || 'Extra money', amount: amt });
    $('#extraAmount').value = ''; $('#extraNote').value = '';
    save(); render();
  });
  $('#extraList').addEventListener('click', function (e) {
    var id = e.target.getAttribute('data-del-extra');
    if (!id) return;
    var m = monthData(view.month);
    m.extras = m.extras.filter(function (x) { return x.id !== id; });
    save(); render();
  });

  function resetExpenseForm() {
    view.editing = null;
    $('#expAmount').value = ''; $('#expReason').value = '';
    $('#expSubmit').textContent = 'Add expense';
    $('#expCancel').hidden = true;
    $('#expDate').value = view.month === currentMonthKey() ? todayISO() : view.month + '-01';
  }
  $('#quickAdd').addEventListener('submit', function (e) {
    e.preventDefault();
    var amount = round2(num($('#expAmount').value));
    var date = $('#expDate').value;
    var reason = $('#expReason').value.trim();
    if (amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !reason) return;
    var data = {
      date: date, amount: amount, category: $('#expCategory').value, reason: reason,
      type: ($('input[name="expType"]:checked') || {}).value === 'want' ? 'want' : 'need',
      method: $('#expMethod').value
    };
    var msg;
    if (view.editing) {
      var ex = state.expenses.find(function (x) { return x.id === view.editing; });
      if (ex) Object.assign(ex, data);
      msg = 'Expense updated';
    } else {
      data.id = uid();
      state.expenses.push(data);
      msg = 'Added ' + fmt(amount) + ' for ' + data.category;
    }
    save();
    var month = monthKeyOf(date);
    resetExpenseForm();
    if (month !== view.month) { view.month = month; }
    render();
    toast(msg);
    $('#expAmount').focus();
  });
  $('#expCancel').addEventListener('click', function () { resetExpenseForm(); });

  $('#expenseRows').addEventListener('click', function (e) {
    var editId = e.target.getAttribute('data-edit'), delId = e.target.getAttribute('data-del');
    if (editId) {
      var x = state.expenses.find(function (z) { return z.id === editId; });
      if (!x) return;
      view.editing = editId;
      $('#expAmount').value = x.amount; $('#expDate').value = x.date; $('#expReason').value = x.reason;
      $('#expCategory').value = x.category; $('#expMethod').value = x.method;
      var r = $('input[name="expType"][value="' + x.type + '"]'); if (r) r.checked = true;
      $('#expSubmit').textContent = 'Save changes'; $('#expCancel').hidden = false;
      setTab('overview');
      $('#quickAdd').scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('#expAmount').focus({ preventScroll: true });
    }
    if (delId) {
      var idx = state.expenses.findIndex(function (z) { return z.id === delId; });
      if (idx < 0) return;
      var removed = state.expenses.splice(idx, 1)[0];
      save(); render();
      deleteNotice('Deleted "' + removed.reason + '"', function () { state.expenses.splice(idx, 0, removed); save(); render(); });
    }
  });
  // Show delete feedback on the expenses tab itself
  function deleteNotice(msg, undo) {
    var bar = document.getElementById('deleteBar');
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'deleteBar'; bar.className = 'banner'; bar.setAttribute('role', 'status');
      $('[data-panel="expenses"]').prepend(bar);
    }
    bar.hidden = false;
    bar.innerHTML = '<span>' + esc(msg) + '</span><button type="button" class="btn btn-small btn-ghost">Undo</button>';
    bar.querySelector('button').onclick = function () { undo(); bar.hidden = true; };
    clearTimeout(bar._t); bar._t = setTimeout(function () { bar.hidden = true; }, 8000);
  }
  ['#filterText', '#filterCat', '#filterType'].forEach(function (s) { $(s).addEventListener('input', renderExpenses); });

  $('#limitTable').addEventListener('change', function (e) {
    var c = e.target.getAttribute('data-limit');
    if (c == null) return;
    var v = round2(num(e.target.value));
    if (v > 0) state.settings.limits[c] = v; else delete state.settings.limits[c];
    save(); render();
  });

  $('#settingsForm').addEventListener('submit', function (e) {
    e.preventDefault();
    state.settings.currency = $('#currencySelect').value;
    state.settings.goalName = $('#goalName').value.trim();
    state.settings.goalAmount = round2(Math.max(0, num($('#goalAmount').value)));
    fmtCache = {};
    save(); render();
    toast('Preferences saved');
  });
  $('#addCat').addEventListener('click', function () {
    var v = $('#newCat').value.trim();
    if (!v || state.settings.categories.indexOf(v) >= 0) return;
    state.settings.categories.push(v); $('#newCat').value = '';
    save(); render();
  });
  $('#newCat').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('#addCat').click(); } });
  $('#catChips').addEventListener('click', function (e) {
    var c = e.target.getAttribute('data-del-cat');
    if (!c || state.settings.categories.length <= 1) return;
    state.settings.categories = state.settings.categories.filter(function (x) { return x !== c; });
    save(); render();
  });

  function download(name, content, type) {
    var blob = new Blob([content], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  $('#exportJson').addEventListener('click', function () {
    download('pocket-ledger-backup-' + todayISO() + '.json', JSON.stringify(state, null, 2), 'application/json');
  });
  $('#exportCsv').addEventListener('click', function () {
    var q = function (s) { return '"' + String(s).replace(/"/g, '""') + '"'; };
    var lines = [['Date', 'Amount', 'Currency', 'Category', 'Reason', 'Need or want', 'Paid with'].join(',')];
    state.expenses.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (e) {
      lines.push([e.date, e.amount, state.settings.currency, q(e.category), q(e.reason), e.type, q(e.method)].join(','));
    });
    download('pocket-ledger-expenses-' + todayISO() + '.csv', lines.join('\n'), 'text/csv');
  });
  $('#importJson').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var parsed = JSON.parse(r.result);
        if (!parsed || !Array.isArray(parsed.expenses)) throw new Error('bad');
        state = normalize(parsed); state.sample = false; fmtCache = {};
        save(); render(); toast('Backup restored');
      } catch (err) { toast('That file is not a Pocket Ledger backup. Choose the .json file you downloaded from this page.'); }
      e.target.value = '';
    };
    r.readAsText(f);
  });

  $('#resetAll').addEventListener('click', function () { $('#resetConfirm').hidden = false; });
  $('#resetNo').addEventListener('click', function () { $('#resetConfirm').hidden = true; });
  $('#resetYes').addEventListener('click', function () {
    state = emptyState(state.settings.currency); save();
    $('#resetConfirm').hidden = true; render(); toast('All data deleted');
  });
  $('#clearSample').addEventListener('click', function () {
    state = emptyState(state.settings.currency); save();
    view.month = currentMonthKey(); setTab('overview');
    $('#allowanceInput').focus();
  });

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (view.tab === 'stats') render(); }, 150);
  });
  window.addEventListener('hashchange', function () {
    var t = location.hash.slice(1);
    if (t !== view.tab && document.querySelector('[data-panel="' + t + '"]')) setTab(t);
  });
  window.addEventListener('storage', function (e) { if (e.key === STORE_KEY) { state = load() || state; render(); } });

  /* ---------- boot ---------- */
  resetExpenseForm();
  var startTab = location.hash.slice(1);
  if (!document.querySelector('[data-panel="' + startTab + '"]')) {
    try { startTab = sessionStorage.getItem(STORE_KEY + '.tab') || 'overview'; } catch (e) { startTab = 'overview'; }
  }
  setTab(startTab);
})();

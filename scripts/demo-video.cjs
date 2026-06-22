/* eslint-disable */
// Records a ~20s narrated (subtitled) demo of the Staffing Planner + What-if
// playground. Seeds localStorage, injects an on-screen caption bar and a fake
// cursor (Playwright video renders no real cursor), then drives both features.
const { chromium } = require('playwright');
const fs = require('fs');

const OUT_DIR = '/tmp/cadenza-demo';
const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ORG = 'demo';
const BASE = 'http://localhost:3000';
const W = 1280, H = 800;

// ─── Seed data (runs in the page before the app boots) ──────────────────────
function seedScript(org) {
  const ns = `cadenza:local:${org}:col:`;
  const now = new Date();
  const iso = now.toISOString();
  const ymd = (d) => d.toISOString().slice(0, 10);
  const day = (off) => { const d = new Date(now); d.setDate(d.getDate() + off); return d; };
  const at = (off, h, m = 0) => { const d = day(off); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const set = (k, v) => localStorage.setItem(ns + k, JSON.stringify(v));

  set('staffMembers', [
    { id: 't1', orgId: org, uid: 't1', role: 'TEACHER', fullName: 'Dana Cohen', email: 'dana@x.io', phone: null, isArchived: false, createdAt: iso, updatedAt: iso },
    { id: 't2', orgId: org, uid: 't2', role: 'TEACHER', fullName: 'Yossi Levi', email: 'yossi@x.io', phone: null, isArchived: false, createdAt: iso, updatedAt: iso },
    { id: 't3', orgId: org, uid: 't3', role: 'TEACHER', fullName: 'Maya Bar', email: 'maya@x.io', phone: null, isArchived: false, createdAt: iso, updatedAt: iso },
  ]);
  set('rooms', [
    { id: 'room-a', name: 'Studio A', itinerary: '' },
    { id: 'room-b', name: 'Studio B', itinerary: '' },
  ]);
  set('activities', [{ id: 'act-1', orgId: org, name: 'Lessons', createdAt: iso, updatedAt: iso }]);
  set('events', [
    { id: 'e1', name: 'Piano — Beginners', description: '', start: at(1, 9), end: at(1, 10), roomId: 'room-a', activityId: 'act-1', staffMemberIds: ['t1'], isCanceled: false, isHidden: false, tags: [] },
    { id: 'e2', name: 'Violin — Intermediate', description: '', start: at(1, 10, 30), end: at(1, 12), roomId: 'room-b', activityId: 'act-1', staffMemberIds: ['t2'], isCanceled: false, isHidden: false, tags: [] },
    { id: 'e3', name: 'Music Theory', description: '', start: at(2, 13), end: at(2, 14), roomId: 'room-a', activityId: 'act-1', staffMemberIds: ['t1'], isCanceled: false, isHidden: false, tags: [] },
    { id: 'e4', name: 'Choir', description: '', start: at(3, 15), end: at(3, 16, 30), roomId: 'room-b', activityId: 'act-1', staffMemberIds: ['t3'], isCanceled: false, isHidden: false, tags: [] },
  ]);
  set('scenarios', [{
    id: 'sc1', orgId: org, name: 'Spring schedule trial', createdAt: iso, updatedAt: iso, baseSnapshotAt: iso,
    lens: { startMode: 'LIVE_SNAPSHOT', dateRange: { start: ymd(day(-5)), end: ymd(day(40)) }, includedRoomIds: [], includedActivityIds: [], includedStaffIds: [], includedEventTags: [], excludedRecordsBehavior: 'HIDDEN', editableCollections: ['calendarEvents', 'roomAssignments'], referenceOnlyCollections: ['rooms', 'activities', 'staff'] },
    status: 'SAVED',
  }]);
  set('scenarioDeltas', []);

  // Staffing planner
  set('staffingPlans', [{ id: 'p1', orgId: org, name: '2026–27 Staffing', schoolYear: '2026-2027', status: 'DRAFT', createdAt: iso, updatedAt: iso }]);
  set('staffingQuotas', [
    { id: 'q1', orgId: org, planId: 'p1', staffMemberId: 't1', totalRequiredHours: 10, trackRequirements: [{ track: 'HIGH_SCHOOL', minHours: 6 }], createdAt: iso, updatedAt: iso },
    { id: 'q2', orgId: org, planId: 'p1', staffMemberId: 't2', totalRequiredHours: 8, trackRequirements: [], createdAt: iso, updatedAt: iso },
  ]);
  set('staffingClasses', [
    { id: 'c1', orgId: org, planId: 'p1', name: '11A', gradeLevel: '11', requirements: [{ id: 'r-phys', subject: 'Physics', requiredWeeklyHours: 5, track: 'HIGH_SCHOOL' }, { id: 'r-lit', subject: 'Literature', requiredWeeklyHours: 3, track: 'HIGH_SCHOOL' }], createdAt: iso, updatedAt: iso },
    { id: 'c2', orgId: org, planId: 'p1', name: '8B', gradeLevel: '8', requirements: [{ id: 'r-math', subject: 'Mathematics', requiredWeeklyHours: 4, track: 'JUNIOR_HIGH' }], createdAt: iso, updatedAt: iso },
  ]);
  set('staffingAssignments', [
    { id: 'as1', orgId: org, planId: 'p1', classId: 'c1', requirementId: 'r-phys', staffMemberId: 't1', hours: 3, createdAt: iso, updatedAt: iso },
  ]);
}

// ─── Overlay (caption bar + fake cursor), injected after load ───────────────
function overlayScript() {
  if (document.getElementById('demo-cap')) return;
  const cap = document.createElement('div');
  cap.id = 'demo-cap';
  cap.style.cssText = 'position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:2147483647;background:rgba(15,23,42,.92);color:#fff;font:600 18px/1.4 system-ui,Segoe UI,sans-serif;padding:11px 22px;border-radius:12px;max-width:80vw;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.4);pointer-events:none;opacity:0;transition:opacity .3s';
  document.body.appendChild(cap);
  const cur = document.createElement('div');
  cur.id = 'demo-cur';
  cur.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;width:22px;height:22px;margin:-4px 0 0 -4px;pointer-events:none;transition:transform .45s cubic-bezier(.22,.61,.36,1);transform:translate(' + (window.innerWidth/2) + 'px,' + (window.innerHeight/2) + 'px)';
  cur.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 8-6 1.5L9 19 5 3z" fill="#fff" stroke="#0f172a" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  document.body.appendChild(cur);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXEC });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT_DIR, size: { width: W, height: H } }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(seedScript, ORG);

  // helpers
  const caption = async (t) => { await page.evaluate((txt) => { const c = document.getElementById('demo-cap'); if (c) { c.textContent = txt; c.style.opacity = '1'; } }, t); };
  const moveTo = async (x, y) => { await page.evaluate(({ x, y }) => { const c = document.getElementById('demo-cur'); if (c) c.style.transform = `translate(${x}px,${y}px)`; }, { x, y }); await page.mouse.move(x, y); };
  const center = async (loc) => { const b = await loc.boundingBox(); if (!b) throw new Error('no box'); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const hover = async (loc) => { const p = await center(loc); await moveTo(p.x, p.y); await sleep(320); };
  const click = async (loc) => { await hover(loc); await loc.click(); await sleep(220); };

  // ── Boot on Staffing ──
  await page.goto(`${BASE}/${ORG}/staffing`, { waitUntil: 'networkidle' });
  await page.evaluate(overlayScript);
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(450);
  await caption('Staffing Planner — plan next year’s teaching load');
  await sleep(1500);

  // Teachers tab — the live "bank balance"
  await caption('Every teacher has a live hour balance — like a bank account');
  await hover(page.getByText('Dana Cohen').first());
  await sleep(1500);

  // Classes tab — assign hours, watch it turn green
  await click(page.getByRole('button', { name: /Classes/ }));
  await caption('Each class lists the subjects and hours it needs');
  await sleep(1100);
  await caption('Assign a teacher — hours deduct instantly and fill green');
  // Physics needs 2 more hours; pick Dana and assign
  const assignSelect = page.locator('select').filter({ hasText: 'Assign teacher' }).first();
  await hover(assignSelect);
  await assignSelect.selectOption('t1');
  await sleep(500);
  const assignBtn = page.getByRole('button', { name: /^Assign$/ }).first();
  await click(assignBtn);
  await sleep(1300);

  // Recruitment tab — the shortage dashboard
  await click(page.getByRole('button', { name: /Recruitment/ }));
  await caption('Recruitment rolls up every unstaffed hour you still need to hire');
  await sleep(1900);

  // ── What-if playground ──
  await click(page.getByRole('button', { name: /What-if Plans/ }));
  await caption('The What-if playground — try schedule changes safely');
  await sleep(1100);
  await click(page.getByRole('button', { name: /Open draft/ }));
  await caption('You’re in a draft — nothing here touches the real calendar');
  await sleep(1400);

  // Edit an event time → Impact panel updates live
  await caption('Edit an event — the Impact panel reacts instantly');
  const firstStart = page.locator('table tbody tr').first().locator('input[type="time"]').first();
  await hover(firstStart);
  await firstStart.fill('08:00');
  await firstStart.dispatchEvent('change');
  await sleep(700);
  await hover(page.getByText('Impact').first());
  await sleep(2200);
  await caption('Playground + Staffing — see your plan before it’s real');
  await sleep(1400);

  await page.waitForTimeout(300);
  await ctx.close();
  await browser.close();
  const f = fs.readdirSync(OUT_DIR).find(x => x.endsWith('.webm'));
  console.log('VIDEO:', OUT_DIR + '/' + f, fs.statSync(OUT_DIR + '/' + f).size, 'bytes');
})().catch(e => { console.error('DEMO ERROR:', e.message); process.exit(1); });

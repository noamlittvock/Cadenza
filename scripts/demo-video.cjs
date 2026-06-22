/* eslint-disable */
// Records a ~40s narrated (subtitled) demo of the Staffing + What-if playground
// usability work: explainable/clickable numbers, source labels, the on-demand
// Impact panel, and draft-only teachers/rooms. Seeds localStorage, injects an
// on-screen caption bar (subtitles) and a fake cursor, then drives the features.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');

const OUT_DIR = '/tmp/cadenza-demo';
const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FFMPEG = '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';
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
  // Tolerant interactions — a selector miss skips the step but never aborts the timeline.
  const hover = async (loc) => { try { const p = await center(loc); await moveTo(p.x, p.y); await sleep(320); } catch (e) { console.warn('hover skip:', e.message); } };
  const click = async (loc) => { try { await hover(loc); await loc.click({ timeout: 2500 }); await sleep(220); } catch (e) { console.warn('click skip:', e.message); } };
  const type = async (loc, text) => { try { await hover(loc); await loc.fill(text, { timeout: 2500 }); await sleep(250); } catch (e) { console.warn('type skip:', e.message); } };
  const pick = async (loc, opt) => { try { await hover(loc); await loc.selectOption(opt, { timeout: 2500 }); await sleep(350); } catch (e) { console.warn('pick skip:', e.message); } };

  // ── Boot on Staffing ──
  await page.goto(`${BASE}/${ORG}/staffing`, { waitUntil: 'networkidle' });
  await page.evaluate(overlayScript);
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(450);
  await caption('Staffing Planner — plan next year’s teaching load');
  await sleep(1500);

  // Source labels in staffing — where the data comes from
  await caption('Source labels show where every figure comes from');
  await hover(page.getByText('Staff directory').first());
  await sleep(1900);

  // Explainable numbers — the summary stats are clickable
  await caption('Every summary number is clickable');
  await hover(page.getByText('Hours to hire').first());
  await sleep(1500);
  await caption('Click “Hours to hire” to see the exact gaps behind it');
  await click(page.getByRole('button', { name: /Hours to hire/ }).first());
  await sleep(2300);

  // ── What-if playground ──
  await click(page.getByRole('button', { name: /What-if Plans/ }));
  await caption('The what-if playground — experiment safely');
  await sleep(1200);
  await click(page.getByText('Spring schedule trial').first());
  await click(page.getByRole('button', { name: /Open draft/ }));
  await caption('You’re in a draft — nothing here touches the real calendar');
  await sleep(1700);

  // Draft-only entities — invent a teacher and a room
  await caption('Invent a teacher who doesn’t exist yet…');
  await type(page.getByPlaceholder('New teacher name'), 'Guest Sub');
  await click(page.getByRole('button', { name: /^Teacher$/ }).first());
  await sleep(1500);
  await caption('…and a spare room — both live only in this draft');
  await type(page.getByPlaceholder('New room name'), 'Pop-up Hall');
  await click(page.getByRole('button', { name: /^Room$/ }).first());
  await sleep(1600);

  // Assign the draft teacher right inside the playground
  await caption('Assign your made-up teacher right in the draft');
  const firstRow = page.locator('table tbody tr').first();
  await pick(firstRow.locator('select').filter({ hasText: 'Add staff' }).first(), { label: 'Guest Sub · draft' });
  await sleep(1500);

  // Source labels on every event
  await caption('Every event is tagged by its source — Live, edited, or draft-only');
  await hover(firstRow.getByText(/Live|Draft-only/).first());
  await sleep(1800);

  // Edit a time → impact is explained
  await caption('Edit a time and the impact is explained, not just shown');
  const firstStart = firstRow.locator('input[type="time"]').first();
  await type(firstStart, '08:00');
  try { await firstStart.dispatchEvent('change'); } catch {}
  await sleep(1300);

  // On-demand Impact panel
  await caption('The Impact panel opens on demand — no wasted space');
  await click(page.getByRole('button', { name: /Impact/ }).first());
  await sleep(1500);
  await caption('“+Nh scheduled”, traced to the exact events that changed');
  await hover(page.getByText('What changed').first());
  await sleep(2400);

  await caption('Play, plan, and see the impact — before it’s real');
  await sleep(2000);

  await page.waitForTimeout(300);
  await ctx.close();
  await browser.close();

  const webm = OUT_DIR + '/' + fs.readdirSync(OUT_DIR).find(x => x.endsWith('.webm'));
  console.log('WEBM:', webm, fs.statSync(webm).size, 'bytes');
  // Transcode to a widely-playable mp4 (subtitles are burned into the frames).
  const mp4 = OUT_DIR + '/cadenza-demo.mp4';
  try {
    execFileSync(FFMPEG, ['-y', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', '30', mp4], { stdio: 'inherit' });
    console.log('MP4:', mp4, fs.statSync(mp4).size, 'bytes');
  } catch (e) {
    console.warn('mp4 transcode failed, webm still available:', e.message);
  }
})().catch(e => { console.error('DEMO ERROR:', e.message); process.exit(1); });

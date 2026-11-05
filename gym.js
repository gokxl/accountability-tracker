'use strict';
(function () {
    const APP_VERSION = '3.3.0';
    // config.js uses a top-level const, which is not exposed as window.CONFIG.
    const CFG = typeof CONFIG !== 'undefined' ? CONFIG : {};
    const qs = new URLSearchParams(location.search);
    const LOCAL = qs.has('local') || !CFG.GYM_GIST_ID;
    const GIST_ID = CFG.GYM_GIST_ID;
    const API = 'https://api.github.com/gists';
    const SYNC_MS = Math.max(30, CFG.GYM_SYNC_SECONDS || 60) * 1000;
    const DEFAULT_GOAL = CFG.GYM_DEFAULT_WEEKLY_GOAL || 4;
    const K = {
        token: 'gym.token', me: 'gym.me', buddy: 'gym.buddy', cache: 'gym.cache',
        pending: 'gym.pending', db: 'gym.localdb', installHide: 'gym.installHide'
    };

    const COLORS = ['#ff5a36', '#3d8bff', '#22c55e', '#d946ef', '#f5b301', '#14b8a6'];
    const EMOJIS = ['💪', '🦁', '🔥', '⚡', '🐺', '🦅', '🏋️', '🚀', '🐉', '🥊', '🐯', '🦍'];
    const WORKOUTS = [['push', 'Push'], ['pull', 'Pull'], ['legs', 'Legs'], ['upper', 'Upper'],
        ['lower', 'Lower'], ['full', 'Full body'], ['cardio', 'Cardio'], ['core', 'Core']];
    const WORKOUT_IDS = new Set(WORKOUTS.map(w => w[0]));
    const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const ID_RE = /^[a-z0-9-]{3,40}$/;
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    const MAX_STEPS = 200000;
    const MIN_DATE = '2020-01-01';
    const MAX_PHOTO_BYTES = 40 * 1024 * 1024;
    const CALIBRATION_DAYS = 14;
    const PENALTY_DAYS = 90;
    // Difficulty: bigger weekly plans are harder to keep, so they earn a mild multiplier (4/wk = 1.00).
    const DIFF = g => 0.80 + 0.05 * g;
    // Plan-change penalty escalates with the (weighted) number of changes in the last 90 days.
    const PENALTY = c => Math.max(0.6, 1 - 0.05 * c * (c + 1) / 2);
    const COLOR_RE = /^#[0-9a-f]{6}$/i;
    const TOMB_RE = /^[ds]:\d{4}-\d{2}-\d{2}$/;
    const TOMB_KEEP_MS = 180 * 864e5;
    const isIso = v => typeof v === 'string' && !isNaN(Date.parse(v));
    const FILE_RE = /^gym-[a-z0-9-]{3,40}\.json$/;

    const ICON_DUMBBELL = '<svg class="ci-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg>';

    // ---------- utilities ----------
    const $ = (s, r = document) => r.querySelector(s);
    const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const randHex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');
    const pad = n => String(n).padStart(2, '0');
    const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
    const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
    const todayKey = () => keyOf(today());
    const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const dayDiff = (a, b) => Math.round((b - a) / 864e5);
    const startOfWeek = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
    const pct = x => `${Math.round(x * 100)}%`;
    const fmtTime = iso => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const fmtShort = k => parseKey(k).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const fmtLong = k => parseKey(k).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const fmtN = n => Number(n || 0).toLocaleString();
    const wLabel = id => (WORKOUTS.find(w => w[0] === id) || [0, id])[1];
    const cleanName = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 20);
    const slug = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'member';
    const haptic = p => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* unsupported */ } };
    const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const appUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');

    const ls = {
        get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } },
        del(k) { try { localStorage.removeItem(k); } catch (e) { /* blocked */ } }
    };

    // Plan in force for the week starting on Monday `wk` (history is sorted by `from`).
    function goalFor(m, wk) {
        let g = m.goalHistory[0].goal;
        for (const e of m.goalHistory) {
            if (e.from <= wk) g = e.goal; else break;
        }
        return g;
    }

    // Weighted plan changes in the 90 days up to `atMs` (lowering = 1, raising = 0.5, free = 0).
    function changeLoad(m, atMs) {
        const lo = atMs - PENALTY_DAYS * 864e5;
        return m.goalHistory.reduce((c, e) => {
            const t = Date.parse(e.at);
            return c + (e.w && t > lo && t <= atMs ? e.w : 0);
        }, 0);
    }

    // A week counts toward the month containing its Thursday (where most of its days fall).
    const scoreMonthOf = wk => keyOf(addDays(parseKey(wk), 3)).slice(0, 7);
    const monthName = (mk, opts = { month: 'long' }) => parseKey(`${mk}-01`).toLocaleDateString(undefined, opts);
    const fmtPts = v => (v === null || v === undefined ? '—' : String(Math.round(v)));

    async function hashPin(pin, salt) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`));
        return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
    }

    // Remote data is public and user-editable, so every field is validated before use.
    function cleanMember(raw) {
        if (!raw || typeof raw !== 'object' || !ID_RE.test(raw.id || '')) return null;
        const days = {};
        if (raw.days && typeof raw.days === 'object') {
            for (const [k, v] of Object.entries(raw.days)) {
                if (!DATE_RE.test(k)) continue;
                const e = {};
                if (v && typeof v.t === 'string' && !isNaN(Date.parse(v.t))) e.t = v.t;
                if (v && isIso(v.u)) e.u = v.u;
                if (v && Array.isArray(v.w)) {
                    const w = v.w.filter(x => WORKOUT_IDS.has(x)).slice(0, 4);
                    if (w.length) e.w = w;
                }
                days[k] = e;
            }
        }
        const steps = {};
        if (raw.steps && typeof raw.steps === 'object') {
            for (const [k, v] of Object.entries(raw.steps)) {
                const n = Number(v);
                if (DATE_RE.test(k) && Number.isInteger(n) && n > 0 && n <= MAX_STEPS) steps[k] = n;
            }
        }
        const su = {}, tomb = {};
        if (raw.su && typeof raw.su === 'object') {
            for (const [k, v] of Object.entries(raw.su)) if (DATE_RE.test(k) && isIso(v)) su[k] = v;
        }
        if (raw.tomb && typeof raw.tomb === 'object') {
            for (const [k, v] of Object.entries(raw.tomb)) if (TOMB_RE.test(k) && isIso(v)) tomb[k] = v;
        }
        const createdAt = typeof raw.createdAt === 'string' && !isNaN(Date.parse(raw.createdAt)) ? raw.createdAt : new Date().toISOString();
        const startWk = keyOf(startOfWeek(new Date(createdAt)));
        let gh = [];
        if (Array.isArray(raw.goalHistory)) {
            for (const e of raw.goalHistory.slice(0, 200)) {
                const g = e ? parseInt(e.goal, 10) : NaN;
                if (!e || !DATE_RE.test(e.from || '') || !(g >= 1 && g <= 7)) continue;
                gh.push({
                    from: e.from, goal: g,
                    at: typeof e.at === 'string' && !isNaN(Date.parse(e.at)) ? e.at : createdAt,
                    w: [0, 0.5, 1].includes(e.w) ? e.w : 0
                });
            }
        }
        gh.sort((a, b) => a.from.localeCompare(b.from) || a.at.localeCompare(b.at));
        gh = gh.filter((e, i) => !gh[i + 1] || gh[i + 1].from !== e.from);
        if (!gh.length || gh[0].from > startWk) {
            const legacy = clamp(parseInt(raw.weeklyGoal, 10) || DEFAULT_GOAL, 1, 7);
            gh.unshift({ from: startWk, goal: gh.length ? gh[0].goal : legacy, at: createdAt, w: 0 });
        }
        return {
            id: raw.id,
            name: cleanName(raw.name) || 'Member',
            emoji: EMOJIS.includes(raw.emoji) ? raw.emoji : '💪',
            color: COLOR_RE.test(raw.color || '') ? raw.color : COLORS[0],
            weeklyGoal: goalFor({ goalHistory: gh }, keyOf(startOfWeek(today()))),
            goalHistory: gh,
            pinHash: typeof raw.pinHash === 'string' ? raw.pinHash : '',
            pinSalt: typeof raw.pinSalt === 'string' ? raw.pinSalt : '',
            createdAt,
            updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
            profileAt: isIso(raw.profileAt) ? raw.profileAt : '',
            days,
            steps,
            su,
            tomb
        };
    }

    const isoMax = (a, b) => ((a || '') >= (b || '') ? a || '' : b || '');
    const canon = v => (Array.isArray(v) ? v.map(canon)
        : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = canon(v[k]); return o; }, {}) : v);
    const memberSig = m => JSON.stringify(canon([m.days, m.steps, m.su, m.tomb, m.name, m.emoji, m.color, m.pinHash, m.pinSalt, m.goalHistory, m.profileAt]));

    // Combine two copies of the same member field by field so an out-of-date copy can never erase newer data.
    // Each check-in / step entry keeps its own timestamp; deletions are recorded as timestamped tombstones.
    function mergeMember(a, b) {
        const pa = a.profileAt !== b.profileAt ? (a.profileAt > b.profileAt ? a : b) : ((a.updatedAt || '') >= (b.updatedAt || '') ? a : b);
        const cutoff = new Date(Date.now() - TOMB_KEEP_MS).toISOString();
        const tomb = {};
        for (const src of [a.tomb, b.tomb]) {
            for (const [k, v] of Object.entries(src || {})) if (v > cutoff) tomb[k] = isoMax(tomb[k], v);
        }
        const ts = e => (e && (e.u || e.t)) || '';
        const days = {};
        for (const k of new Set([...Object.keys(a.days), ...Object.keys(b.days)])) {
            const ea = a.days[k], eb = b.days[k];
            const pick = !ea ? eb : !eb ? ea : (ts(ea) >= ts(eb) ? ea : eb);
            const t = tomb[`d:${k}`];
            if (t && t >= ts(pick)) continue;
            if (t) delete tomb[`d:${k}`];
            days[k] = Object.assign({}, pick, pick.w ? { w: pick.w.slice() } : {});
        }
        const steps = {}, su = {};
        const as = a.steps || {}, bs = b.steps || {}, asu = a.su || {}, bsu = b.su || {};
        for (const k of new Set([...Object.keys(as), ...Object.keys(bs)])) {
            const fromA = k in as && (!(k in bs) || (asu[k] || '') >= (bsu[k] || ''));
            const u = fromA ? asu[k] || '' : bsu[k] || '';
            const t = tomb[`s:${k}`];
            if (t && t >= u) continue;
            if (t) delete tomb[`s:${k}`];
            steps[k] = fromA ? as[k] : bs[k];
            if (u) su[k] = u;
        }
        const goalHistory = pa.goalHistory.map(e => Object.assign({}, e));
        return {
            id: a.id, name: pa.name, emoji: pa.emoji, color: pa.color,
            weeklyGoal: goalFor({ goalHistory }, keyOf(startOfWeek(today()))), goalHistory,
            pinHash: pa.pinHash, pinSalt: pa.pinSalt,
            createdAt: a.createdAt <= b.createdAt ? a.createdAt : b.createdAt,
            updatedAt: isoMax(a.updatedAt, b.updatedAt), profileAt: pa.profileAt,
            days, steps, su, tomb
        };
    }

    // ---------- state ----------
    const state = {
        members: {},
        meId: ls.get(K.me),
        buddyId: ls.get(K.buddy),
        tab: 'today',
        cal: new Date(today().getFullYear(), today().getMonth(), 1),
        trophyFor: 'me',
        auth: { step: 'pick' },
        pinLocks: {},
        etag: null,
        loaded: false,
        syncing: false,
        flushing: false,
        flushAgain: false,
        syncError: null,
        lastSync: null,
        pending: !!ls.get(K.pending, false),
        rev: 0,
        sheetDay: null,
        sheetKind: null,
        installEvt: null,
        photos: [],
        photoBusy: false,
        photoError: null
    };

    const me = () => state.members[state.meId];
    function buddy() {
        const others = Object.values(state.members).filter(m => m.id !== state.meId);
        if (!others.length) return null;
        return others.find(m => m.id === state.buddyId) || others[0];
    }
    function opponentOf(m) {
        if (!state.meId) return null;
        return m.id === state.meId ? buddy() : me();
    }
    function colorOf(p) {
        const m = me();
        if (!m || p.id === m.id || p.color !== m.color) return p.color;
        return COLORS.find(c => c !== m.color);
    }

    // ---------- storage ----------
    const fileName = id => `gym-${id}.json`;

    const LocalStore = {
        async load() {
            const db = ls.get(K.db, {});
            const out = {};
            for (const raw of Object.values((db && db.members) || {})) {
                const m = cleanMember(raw);
                if (m) out[m.id] = m;
            }
            return out;
        },
        async save(m) {
            const db = ls.get(K.db, { members: {} }) || { members: {} };
            db.members = db.members || {};
            const prev = db.members[m.id] ? cleanMember(db.members[m.id]) : null;
            const merged = prev ? mergeMember(m, prev) : m;
            db.members[m.id] = merged;
            ls.set(K.db, db);
            return merged;
        },
        async remove(id) {
            const db = ls.get(K.db, { members: {} }) || { members: {} };
            if (db.members) delete db.members[id];
            ls.set(K.db, db);
        }
    };

    const GistStore = {
        async load() {
            const token = ls.get(K.token);
            const headers = { Accept: 'application/vnd.github+json' };
            if (token) headers.Authorization = `Bearer ${token}`;
            if (state.etag) headers['If-None-Match'] = state.etag;
            let res = await fetch(`${API}/${GIST_ID}`, { headers, cache: 'no-store' });
            if (res.status === 401 && token) {
                ls.del(K.token);
                toast('Sync key was rejected — please enter it again');
                delete headers.Authorization;
                res = await fetch(`${API}/${GIST_ID}`, { headers, cache: 'no-store' });
            }
            if (res.status === 304) return null;
            if (res.status === 403 || res.status === 429) throw new Error('GitHub rate limit reached — add the sync key or try later');
            if (!res.ok) throw new Error(`Couldn't reach GitHub (${res.status})`);
            state.etag = res.headers.get('ETag');
            const gist = await res.json();
            const out = {};
            for (const [name, f] of Object.entries(gist.files || {})) {
                if (!FILE_RE.test(name)) continue;
                let text = f.content;
                if (f.truncated && f.raw_url) text = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
                try {
                    const m = cleanMember(JSON.parse(text));
                    if (m) out[m.id] = m;
                } catch (e) { /* skip malformed file */ }
            }
            return out;
        },
        // Latest copy of one member straight from GitHub (no ETag, no cache).
        async fetchMember(id, token) {
            const res = await fetch(`${API}/${GIST_ID}`, {
                headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` }, cache: 'no-store'
            });
            if (res.status === 401) {
                ls.del(K.token);
                throw Object.assign(new Error('Sync key rejected'), { code: 'NO_TOKEN' });
            }
            if (!res.ok) throw new Error(`Couldn't reach GitHub (${res.status})`);
            const f = ((await res.json()).files || {})[fileName(id)];
            if (!f) return null;
            const text = f.truncated && f.raw_url ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content;
            return cleanMember(JSON.parse(text));
        },
        // Read-merge-write: never upload a copy that is missing data GitHub already has.
        async save(m) {
            const token = ls.get(K.token);
            if (!token) throw Object.assign(new Error('Sync key needed'), { code: 'NO_TOKEN' });
            const latest = await this.fetchMember(m.id, token);
            const merged = latest ? mergeMember(m, latest) : m;
            if (latest && memberSig(merged) === memberSig(latest)) { state.etag = null; return merged; }
            const res = await fetch(`${API}/${GIST_ID}`, {
                method: 'PATCH',
                headers: { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ files: { [fileName(m.id)]: { content: JSON.stringify(merged, null, 1) } } })
            });
            if (res.status === 401) {
                ls.del(K.token);
                throw Object.assign(new Error('Sync key rejected'), { code: 'NO_TOKEN' });
            }
            if (res.status === 403 || res.status === 404) throw new Error('This sync key can\'t edit the gist (needs "gist" scope from the gist owner)');
            if (!res.ok) throw new Error(`Save failed (${res.status})`);
            state.etag = null;
            return merged;
        },
        async remove(id) {
            const token = ls.get(K.token);
            if (!token) throw Object.assign(new Error('Sync key needed'), { code: 'NO_TOKEN' });
            const res = await fetch(`${API}/${GIST_ID}`, {
                method: 'PATCH',
                headers: { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ files: { [fileName(id)]: null } })
            });
            if (res.status === 401) {
                ls.del(K.token);
                throw Object.assign(new Error('Sync key rejected'), { code: 'NO_TOKEN' });
            }
            // 422 means the file is already gone.
            if (!res.ok && res.status !== 422) throw new Error(`Delete failed (${res.status})`);
            state.etag = null;
        }
    };

    const Store = LOCAL ? LocalStore : GistStore;

    // ---------- sync ----------
    async function sync({ quiet = true } = {}) {
        if (state.syncing) return;
        state.syncing = true;
        setSyncBadge();
        try {
            const remote = await Store.load();
            if (remote) applyRemote(remote);
            state.lastSync = Date.now();
            state.syncError = null;
            if (state.pending) flush();
        } catch (e) {
            state.syncError = navigator.onLine ? e.message : 'You are offline';
            if (!quiet) toast(state.syncError);
        } finally {
            state.syncing = false;
            state.loaded = true;
            render();
        }
    }

    function applyRemote(remote) {
        const before = state.members;
        const local = me();
        let accountGone = false;
        // Merge this device's copy of "me" with GitHub's; if the phone holds anything GitHub lacks, upload it.
        if (local) {
            const r = remote[local.id];
            const justSaved = Date.now() - (state.lastSaveAt || 0) < 60000;
            if (!r && !state.pending && !justSaved) accountGone = true;
            else if (!r) remote[local.id] = local;
            else {
                const merged = mergeMember(local, r);
                if (memberSig(merged) !== memberSig(r)) {
                    state.pending = true;
                    ls.set(K.pending, true);
                }
                remote[local.id] = merged;
            }
        }
        if (state.loaded) {
            const tk = todayKey();
            for (const [id, m] of Object.entries(remote)) {
                if (id !== state.meId && state.meId && m.days[tk] && !(before[id] && before[id].days[tk])) {
                    toast(`${m.name} just checked in ${m.emoji}`);
                }
            }
        }
        state.members = remote;
        ls.set(K.cache, remote);
        if (accountGone) {
            doLogout();
            toast('That account was deleted. Pick or create a profile.');
        }
    }

    function scheduleSync() {
        clearTimeout(state.syncTimer);
        const ms = LOCAL ? 15000 : ls.get(K.token) ? SYNC_MS : Math.max(SYNC_MS, 120000);
        state.syncTimer = setTimeout(async () => {
            if (document.visibilityState === 'visible') await sync();
            scheduleSync();
        }, ms);
    }

    function mutateMe(fn) {
        const m = me();
        if (!m) return;
        m.tomb = m.tomb || {};
        m.su = m.su || {};
        fn(m);
        m.updatedAt = new Date().toISOString();
        state.rev++;
        state.pending = true;
        ls.set(K.pending, true);
        ls.set(K.cache, state.members);
        render();
        clearTimeout(state.flushTimer);
        state.flushTimer = setTimeout(flush, 600);
    }

    function setStepsEntry(x, k, n) {
        const now = new Date().toISOString();
        x.steps = x.steps || {};
        x.su = x.su || {};
        x.tomb = x.tomb || {};
        if (n) {
            x.steps[k] = n;
            x.su[k] = now;
            delete x.tomb[`s:${k}`];
        } else {
            delete x.steps[k];
            delete x.su[k];
            x.tomb[`s:${k}`] = now;
        }
    }

    async function flush() {
        if (!state.pending || !me()) return;
        if (state.flushing) { state.flushAgain = true; return; }
        state.flushing = true;
        setSyncBadge();
        const rev = state.rev;
        try {
            const saved = await Store.save(me());
            state.lastSaveAt = Date.now();
            if (state.rev === rev) {
                // Adopt the merged copy so anything another device added shows up here too.
                if (saved && me() && memberSig(saved) !== memberSig(me())) {
                    state.members[state.meId] = saved;
                    ls.set(K.cache, state.members);
                    render();
                }
                state.pending = false;
                ls.set(K.pending, false);
            } else {
                state.flushAgain = true;
            }
            state.syncError = null;
        } catch (e) {
            if (e.code === 'NO_TOKEN') {
                // Prompt once per session; afterwards the "Not synced" pill is the way back in.
                if (!state.tokenAsked) { state.tokenAsked = true; askToken(); }
            } else {
                state.syncError = e.message;
                toast(navigator.onLine ? e.message : 'Offline — saved on this phone, will sync later');
            }
        } finally {
            state.flushing = false;
            setSyncBadge();
            if (state.flushAgain) { state.flushAgain = false; flush(); }
        }
    }

    // ---------- stats ----------
    const memo = new Map();

    function longestRun(keys) {
        let best = 0, run = 0, prev = null;
        for (const k of keys) {
            const d = parseKey(k);
            run = prev && dayDiff(prev, d) === 1 ? run + 1 : 1;
            best = Math.max(best, run);
            prev = d;
        }
        return best;
    }

    function computeStats(m) {
        const keys = Object.keys(m.days).sort();
        const set = new Set(keys);
        const t = today(), tk = keyOf(t), nowMs = Date.now();

        // Today doesn't break the streak until it's over.
        let streak = 0;
        for (let d = set.has(tk) ? t : addDays(t, -1); set.has(keyOf(d)); d = addDays(d, -1)) streak++;

        const dow = [0, 0, 0, 0, 0, 0, 0], months = {}, weeks = {};
        for (const k of keys) {
            const d = parseKey(k);
            dow[(d.getDay() + 6) % 7]++;
            months[k.slice(0, 7)] = (months[k.slice(0, 7)] || 0) + 1;
            const wk = keyOf(startOfWeek(d));
            weeks[wk] = (weeks[wk] || 0) + 1;
        }

        // Weekly points = completion (capped at 100%) x difficulty x plan-change penalty.
        const curWk = keyOf(startOfWeek(t));
        const created = new Date(m.createdAt);
        created.setHours(0, 0, 0, 0);
        const startWk = keyOf(startOfWeek(created));
        const scored = [];
        for (let w = parseKey(startWk); keyOf(w) <= curWk; w = addDays(w, 7)) {
            const wk = keyOf(w), goal = goalFor(m, wk);
            // The joining week only expects a share of the plan for the days left in it.
            const plan = wk === startWk ? Math.max(1, Math.round(goal * (7 - (created.getDay() + 6) % 7) / 7)) : goal;
            const done = weeks[wk] || 0, A = Math.min(done / plan, 1), complete = wk < curWk;
            const mult = PENALTY(changeLoad(m, complete ? addDays(w, 7).getTime() - 1 : nowMs));
            scored.push({ wk, goal, plan, done, A, mult, pts: A * DIFF(goal) * mult * 100, complete, month: scoreMonthOf(wk) });
        }
        const cur = scored.length ? scored[scored.length - 1] : {
            wk: curWk, goal: m.weeklyGoal, plan: m.weeklyGoal, done: weeks[curWk] || 0, A: 0,
            mult: PENALTY(changeLoad(m, nowMs)), pts: 0, complete: false, month: scoreMonthOf(curWk)
        };
        const closedWeeks = scored.filter(x => x.complete);

        let weekStreak = cur.A >= 1 ? 1 : 0;
        for (let i = closedWeeks.length - 1; i >= 0 && closedWeeks[i].A >= 1; i--) weekStreak++;
        let longestWeek = 0, run = 0, comeback = false;
        scored.forEach((x, i) => {
            if (x.A >= 1) { run++; longestWeek = Math.max(longestWeek, run); } else if (x.complete) run = 0;
            if (i && x.complete && x.A >= 1 && scored[i - 1].A < 0.5) comeback = true;
        });

        const monthWeeks = {}, monthScore = {};
        for (const x of closedWeeks) (monthWeeks[x.month] = monthWeeks[x.month] || []).push(x);
        for (const [mk, arr] of Object.entries(monthWeeks)) monthScore[mk] = arr.reduce((sum, x) => sum + x.pts, 0) / arr.length;
        const closedMonths = Object.keys(monthScore).filter(mk => mk < cur.month);
        const lastChange = Math.max(Date.parse(m.createdAt), ...m.goalHistory.filter(e => e.w > 0).map(e => Date.parse(e.at)));

        const firstDay = keys.length ? parseKey(keys[0]) : null;
        const weeksActive = firstDay ? Math.max(1, Math.ceil((dayDiff(firstDay, t) + 1) / 7)) : 0;

        const steps = m.steps || {}, mKey = tk.slice(0, 7);
        let stepsTotal = 0, stepsWeek = 0, stepsMonth = 0, maxSteps = 0, stepDays = 0;
        for (const [k, n] of Object.entries(steps)) {
            if (k > tk) continue;
            stepsTotal += n;
            stepDays++;
            if (n > maxSteps) maxSteps = n;
            if (k >= curWk) stepsWeek += n;
            if (k.startsWith(mKey)) stepsMonth += n;
        }

        return {
            stepsTotal, stepsWeek, stepsMonth, maxSteps, stepDays,
            stepsToday: steps[tk] || 0,
            stepsAvg: stepDays ? Math.round(stepsTotal / stepDays) : 0,
            total: keys.length, streak, longest: longestRun(keys),
            week: cur.done, plan: cur.plan, goal: cur.goal, weekA: cur.A, weekPts: cur.pts, mult: cur.mult,
            changes: changeLoad(m, nowMs), scored, cur, monthWeeks, monthScore, scoreMonth: cur.month,
            monthCS: monthScore[cur.month] === undefined ? null : monthScore[cur.month],
            weekStreak, longestWeek, comeback,
            perfectWeeks: scored.filter(x => x.A >= 1).length,
            bestMonthCS: Math.max(0, ...closedMonths.map(mk => monthScore[mk])),
            flawlessMonths: closedMonths.filter(mk => monthWeeks[mk].every(x => x.A >= 1)).length,
            lockedDays: Math.max(0, Math.floor((nowMs - lastChange) / 864e5)),
            dow, months, weeks,
            avgWeek: weeksActive ? keys.length / weeksActive : 0
        };
    }

    function stats(m) {
        if (!memo.has(m.id)) memo.set(m.id, computeStats(m));
        return memo.get(m.id);
    }

    // Higher weekly points win each completed week; higher month score wins each closed month.
    function h2h(a, b) {
        const sa = stats(a), sb = stats(b);
        let aw = 0, bw = 0, am = 0, bm = 0;
        const pb = Object.fromEntries(sb.scored.map(x => [x.wk, x]));
        for (const x of sa.scored) {
            const y = pb[x.wk];
            if (!x.complete || !y) continue;
            if (x.pts - y.pts > 0.05) aw++; else if (y.pts - x.pts > 0.05) bw++;
        }
        for (const [mk, x] of Object.entries(sa.monthScore)) {
            const y = sb.monthScore[mk];
            if (mk >= sa.scoreMonth || y === undefined) continue;
            if (x - y > 0.05) am++; else if (y - x > 0.05) bm++;
        }
        return { aw, bw, am, bm };
    }

    function fullStats(m) {
        const s = stats(m);
        if (s.monthsWon === undefined) {
            const o = opponentOf(m);
            s.monthsWon = o ? h2h(m, o).am : 0;
        }
        return s;
    }

    const BADGES = [
        { id: 'first', icon: '🎯', name: 'First Rep', desc: 'Log your first gym session', goal: 1, val: s => s.total },
        { id: 'pw1', icon: '✅', name: 'Plan Keeper', desc: 'Complete your plan for a week', goal: 1, val: s => s.longestWeek },
        { id: 'pw4', icon: '📅', name: 'Habit Formed', desc: '4 perfect weeks in a row', goal: 4, val: s => s.longestWeek },
        { id: 'pw12', icon: '🏆', name: 'Quarter Beast', desc: '12 perfect weeks in a row', goal: 12, val: s => s.longestWeek },
        { id: 'iron', icon: '🦾', name: 'Iron Month', desc: 'Finish a month scoring 90+', goal: 90, val: s => s.bestMonthCS },
        { id: 'flawless', icon: '💎', name: 'Flawless Month', desc: 'Every week of a month perfect', goal: 1, val: s => s.flawlessMonths },
        { id: 'locked', icon: '🔒', name: 'Locked In', desc: '90 days without changing your plan', goal: 90, val: s => s.lockedDays },
        { id: 'mvp', icon: '👑', name: 'Monthly MVP', desc: 'Win a month on score', goal: 1, val: s => s.monthsWon || 0 },
        { id: 'comeback', icon: '🔄', name: 'Comeback Kid', desc: 'Perfect week right after one under 50%', goal: 1, val: s => (s.comeback ? 1 : 0) },
        { id: 's3', icon: '🔥', name: 'Heating Up', desc: '3-day streak', goal: 3, val: s => s.longest },
        { id: 's7', icon: '⚡', name: 'Unstoppable', desc: '7-day streak', goal: 7, val: s => s.longest },
        { id: 't10', icon: '🔟', name: 'Double Digits', desc: '10 gym sessions', goal: 10, val: s => s.total },
        { id: 't50', icon: '🥈', name: 'Dedicated', desc: '50 gym sessions', goal: 50, val: s => s.total },
        { id: 't100', icon: '🥇', name: 'Centurion', desc: '100 gym sessions', goal: 100, val: s => s.total },
        { id: 'steps10k', icon: '👟', name: '10K Day', desc: 'Log 10,000+ steps in a day', goal: 10000, val: s => s.maxSteps },
        { id: 'steps100k', icon: '🥾', name: 'Trailblazer', desc: '100,000 total steps', goal: 100000, val: s => s.stepsTotal },
        { id: 'steps1m', icon: '🌍', name: 'Step Millionaire', desc: '1,000,000 total steps', goal: 1000000, val: s => s.stepsTotal }
    ];
    const earnedSet = m => { const s = fullStats(m); return new Set(BADGES.filter(x => x.val(s) >= x.goal).map(x => x.id)); };

    const monthKeys = (p, mk) => Object.keys(p.days).filter(k => k.startsWith(mk)).sort();
    const weeksIn = (p, mk) => stats(p).scored.filter(x => x.month === mk);
    const CHALLENGES = [
        { icon: '💎', name: 'Perfect Weeks', desc: 'Most weeks with your plan fully done', score: (p, mk) => weeksIn(p, mk).filter(x => x.A >= 1).length },
        { icon: '🔥', name: 'Streak Master', desc: 'Longest run of consecutive days this month', score: (p, mk) => longestRun(monthKeys(p, mk)) },
        { icon: '🎯', name: 'Zero Misses', desc: 'Fewest planned sessions missed (finished weeks)', low: true, unit: 'missed', score: (p, mk) => weeksIn(p, mk).filter(x => x.complete).reduce((s, x) => s + Math.max(0, x.plan - x.done), 0) },
        { icon: '🎨', name: 'Variety Pack', desc: 'Most different workout types logged', score: (p, mk) => new Set(monthKeys(p, mk).flatMap(k => p.days[k].w || [])).size },
        { icon: '👣', name: 'Steady Steps', desc: 'Most days with steps logged this month', score: (p, mk) => Object.keys(p.steps || {}).filter(k => k.startsWith(mk)).length }
    ];

    // ---------- rendering helpers ----------
    const av = (p, size = '') => `<span class="av ${size}" style="--c:${colorOf(p)}">${p.emoji}</span>`;
    const tile = (icon, val, label) => `<div class="tile"><span class="tile-ic">${icon}</span><span class="tile-val">${val}</span><span class="tile-lbl">${label}</span></div>`;
    const bar = (color, frac, cls = '') => `<div class="bar ${cls}"><i style="--c:${color};--w:${clamp(frac, 0, 1) * 100}%"></i></div>`;
    const legend = people => `<div class="legend">${people.map(p => `<span><i class="lg" style="--c:${colorOf(p)}"></i>${esc(p.name)}</span>`).join('')}</div>`;
    const chipsHtml = (key, entry) => `<div class="chips" role="group" aria-label="What did you train?"><span class="chips-label">What did you train?</span>${WORKOUTS.map(([id, label]) => `<button class="tag ${entry.w && entry.w.includes(id) ? 'on' : ''}" data-action="tag" data-key="${key}" data-w="${id}">${label}</button>`).join('')}</div>`;
    const emojiPicker = sel => `<input type="hidden" name="emoji" value="${sel}"><div class="opt-grid">${EMOJIS.map(e => `<button type="button" class="opt ${e === sel ? 'sel' : ''}" data-action="pick" data-field="emoji" data-v="${e}">${e}</button>`).join('')}</div>`;
    const colorPicker = sel => `<input type="hidden" name="color" value="${sel}"><div class="sw-row">${COLORS.map(c => `<button type="button" class="sw ${c === sel ? 'sel' : ''}" style="--c:${c}" data-action="pick" data-field="color" data-v="${c}" aria-label="Color ${c}"></button>`).join('')}</div>`;

    function greeting() {
        const h = new Date().getHours();
        return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    }

    function render() {
        memo.clear();
        const m = me();
        $('#auth').hidden = !!m;
        $('#main').hidden = !m;
        if (!m) { renderAuth(); return; }
        const b = buddy();
        const root = document.documentElement.style;
        root.setProperty('--me', colorOf(m));
        root.setProperty('--buddy', b ? colorOf(b) : '#3d8bff');

        const titles = { today: `Hey, ${m.name}`, calendar: 'Calendar', battle: 'Battle', trophies: 'Trophies', me: 'Profile' };
        const subs = {
            today: `${greeting()} · ${today().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`,
            calendar: 'Every session, side by side',
            battle: b ? `${m.name} vs ${b.name}` : 'Your numbers',
            trophies: 'Milestones & badges',
            me: 'Settings'
        };
        $('#tb-title').textContent = titles[state.tab];
        $('#tb-sub').textContent = subs[state.tab];
        document.querySelectorAll('.tab').forEach(t => {
            const on = t.dataset.tab === state.tab;
            t.classList.toggle('active', on);
            t.setAttribute('aria-current', on ? 'page' : 'false');
        });
        document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${state.tab}`));
        $(`#view-${state.tab}`).innerHTML = VIEWS[state.tab]();
        setSyncBadge();
    }

    function setSyncBadge() {
        const el = $('#sync-btn');
        if (!el) return;
        let cls = 'ok', label = 'Synced';
        if (LOCAL) { cls = 'local'; label = 'Local'; }
        else if (state.syncing || state.flushing) { cls = 'syncing'; label = 'Syncing'; }
        else if (state.pending) { cls = 'pending'; label = navigator.onLine ? 'Not synced' : 'Offline'; }
        else if (state.syncError) { cls = 'error'; label = 'Sync issue'; }
        el.className = `sync-pill ${cls}`;
        el.innerHTML = `<span class="dot"></span>${label}`;
    }

    function syncText() {
        if (LOCAL) return 'Local mode — stored on this device only';
        if (state.pending) return 'You have changes waiting to sync';
        if (state.syncError) return state.syncError;
        if (!state.lastSync) return 'Not synced yet';
        const s = Math.round((Date.now() - state.lastSync) / 1000);
        return `Last synced ${s < 60 ? 'just now' : `${Math.round(s / 60)} min ago`}`;
    }

    // ---------- auth ----------
    function renderAuth() {
        const a = state.auth, root = $('#auth');
        // Background syncs must not wipe a half-filled sign-up form or PIN entry.
        if (a.step === 'register' && $('#register-form')) return;
        if (a.step === 'pin' && root.dataset.pinFor === a.id && $('.pin-wrap')) return;
        root.dataset.pinFor = a.step === 'pin' ? a.id : '';
        if (a.step === 'pin') {
            const m = state.members[a.id];
            if (!m) { state.auth = { step: 'pick' }; renderAuth(); return; }
            const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
            root.innerHTML = `<button class="back-btn" data-action="auth-back">‹ Back</button>
                <div class="pin-wrap">
                    ${av(m, 'av-xl')}
                    <h2>Hi ${esc(m.name)}</h2>
                    <p class="muted">Enter your 4-digit PIN</p>
                    <div class="pin-dots"><i></i><i></i><i></i><i></i></div>
                    <p class="form-err" id="pin-err"></p>
                    <div class="keypad">${keys.map(k => k === '' ? '<span></span>' : `<button class="key ${k === 'del' ? 'key-del' : ''}" data-action="pin-key" data-k="${k}" aria-label="${k === 'del' ? 'Delete' : k}">${k === 'del' ? '⌫' : k}</button>`).join('')}</div>
                </div>`;
            updatePinDots();
            return;
        }
        if (a.step === 'register') { root.innerHTML = registerHtml(); return; }

        const list = Object.values(state.members).sort((x, y) => x.name.localeCompare(y.name));
        const listHtml = !state.loaded
            ? '<div class="skeleton"></div><div class="skeleton"></div>'
            : list.length
                ? list.map(m => `<button class="profile-btn" data-action="pick-profile" data-id="${m.id}">${av(m)}<span class="grow"><strong>${esc(m.name)}</strong><small>🔥 ${stats(m).streak}-day streak · ${stats(m).total} sessions</small></span><span class="chev">›</span></button>`).join('')
                : '<p class="muted center">No accounts yet — be the first!</p>';
        root.innerHTML = `<div class="auth-hero">
                <img class="logo" src="icons/icon-192.png" alt="" width="88" height="88">
                <h1>Gym Buddies</h1>
                <p>Show up. Check in. Out-train your buddy.</p>
            </div>
            <div class="auth-card">
                <h3>Who's training?</h3>
                ${listHtml}
                <button class="btn btn-primary" data-action="go-register">Create account</button>
            </div>
            ${state.syncError ? `<p class="auth-err">${esc(state.syncError)} <button class="link-btn" data-action="sync-now">Retry</button></p>` : ''}
            ${LOCAL ? '<p class="auth-foot">Local mode — data stays on this device.</p>' : ''}`;
    }

    function registerHtml() {
        const used = Object.values(state.members);
        const emoji = EMOJIS.find(e => !used.some(u => u.emoji === e)) || EMOJIS[0];
        const color = COLORS.find(c => !used.some(u => u.color === c)) || COLORS[0];
        return `<button class="back-btn" data-action="auth-back">‹ Back</button>
            <form id="register-form" class="reg" autocomplete="off" novalidate>
                <h1>Create your account</h1>
                <p class="muted">Takes 20 seconds. Then the competition starts.</p>
                <label class="field"><span>Your name</span><input name="name" maxlength="20" required placeholder="e.g. Gokul" autocapitalize="words" enterkeyhint="next"></label>
                <div class="field"><span>Pick your avatar</span>${emojiPicker(emoji)}</div>
                <div class="field"><span>Your color</span>${colorPicker(color)}</div>
                <div class="field"><span>Weekly plan: how many sessions will you commit to?</span>
                    <div class="stepper big">
                        <button type="button" data-action="step" data-field="goal" data-d="-1" aria-label="Decrease">−</button>
                        <b data-out="goal">${DEFAULT_GOAL}</b>
                        <button type="button" data-action="step" data-field="goal" data-d="1" aria-label="Increase">+</button>
                        <small>sessions / week</small>
                    </div>
                    <input type="hidden" name="goal" value="${DEFAULT_GOAL}">
                    <p class="fine left">Pick what you can <b>stick to</b>. Points reward keeping your plan, not doing more. Free to adjust for 14 days, then it's locked.</p>
                </div>
                <div class="field-row">
                    <label class="field"><span>4-digit PIN</span><input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password" required></label>
                    <label class="field"><span>Confirm PIN</span><input name="pin2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password" required></label>
                </div>
                <p class="form-err"></p>
                <button class="btn btn-primary" type="submit">Let's go 💪</button>
                <p class="fine">Your PIN stops your buddy logging sessions as you. It's a friendly lock, not bank-grade security.</p>
            </form>`;
    }

    function updatePinDots() {
        const n = (state.auth.pin || '').length;
        document.querySelectorAll('.pin-dots i').forEach((d, i) => d.classList.toggle('on', i < n));
    }

    function shake(sel) {
        const el = typeof sel === 'string' ? $(sel) : sel;
        if (!el) return;
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
    }

    async function pinKey(k) {
        const a = state.auth;
        if (a.step !== 'pin' || a.checking) return;
        const lock = state.pinLocks[a.id] || (state.pinLocks[a.id] = { fails: 0, until: 0 });
        if (Date.now() < lock.until) {
            $('#pin-err').textContent = `Too many tries. Wait ${Math.ceil((lock.until - Date.now()) / 1000)}s`;
            return;
        }
        a.pin = a.pin || '';
        if (k === 'del') a.pin = a.pin.slice(0, -1);
        else if (a.pin.length < 4) a.pin += k;
        haptic(8);
        updatePinDots();
        if (a.pin.length < 4) return;
        const m = state.members[a.id];
        a.checking = true;
        const ok = m && (!m.pinHash || (await hashPin(a.pin, m.pinSalt)) === m.pinHash);
        a.checking = false;
        if (ok) {
            login(a.id);
            toast(`Welcome back, ${m.name} 💪`);
        } else {
            a.pin = '';
            if (++lock.fails >= 5) { lock.fails = 0; lock.until = Date.now() + 30000; }
            haptic([30, 40, 30]);
            shake('.pin-dots');
            updatePinDots();
            $('#pin-err').textContent = lock.until > Date.now() ? 'Too many tries. Wait 30s' : 'Wrong PIN — try again';
        }
    }

    function login(id) {
        state.meId = id;
        ls.set(K.me, id);
        state.auth = { step: 'pick' };
        state.tab = 'today';
        render();
        window.scrollTo(0, 0);
        loadPhotos().then(() => { if (state.meId === id) render(); });
    }

    function nameTaken(name, exceptId) {
        const n = name.toLowerCase();
        return Object.values(state.members).some(m => m.id !== exceptId && m.name.toLowerCase() === n);
    }

    function formError(f, msg) {
        const el = f.querySelector('.form-err');
        if (el) el.textContent = msg;
        shake(f);
        haptic([30, 40, 30]);
    }

    // ---------- views ----------
    function motivation(m, s, b) {
        const tk = todayKey();
        const left = s.plan - s.week;
        if (m.days[tk]) {
            if (left <= 0) return s.week > s.plan ? `Plan done (${s.week}/${s.plan}). Extra sessions are a bonus for you, not points 😉` : 'Plan complete! Full points locked in this week 🎉';
            return `${s.streak > 1 ? `${s.streak}-day streak 🔥 ` : 'Nice work! '}${left} more to complete your plan.`;
        }
        if (left <= 0) return 'Plan already done this week. Rest day or bonus round? 😤';
        const daysLeft = 7 - (today().getDay() + 6) % 7;
        if (left > daysLeft) return `${left} sessions left, ${daysLeft} day${daysLeft > 1 ? 's' : ''} to go. Every one counts.`;
        if (left === daysLeft) return `No more rest days if you want full points: ${left} left in ${daysLeft} day${daysLeft > 1 ? 's' : ''}.`;
        if (s.streak > 1) return `Your ${s.streak}-day streak is on the line. Keep it alive!`;
        if (b && b.days[tk]) return `${b.name} already trained today. Your move 👀`;
        return `${left} more session${left > 1 ? 's' : ''} to complete your plan.`;
    }

    function viewToday() {
        const m = me(), s = stats(m), b = buddy(), tk = todayKey();
        const entry = m.days[tk];
        const yk = keyOf(addDays(today(), -1));
        const inner = entry
            ? `<span class="ci-check">✓</span><span class="ci-label">Checked in</span><span class="ci-sub">${entry.t ? `at ${fmtTime(entry.t)}` : 'today'}</span>`
            : `${ICON_DUMBBELL}<span class="ci-label">Tap to check in</span><span class="ci-sub">Went to the gym today?</span>`;
        return `${syncWarnCard()}<section class="card hero ${entry ? 'done' : ''}">
                <div class="hero-top"><span class="eyebrow">This week · ${Math.round(s.weekPts)} pts</span><span class="chip">${s.week}/${s.plan} planned</span></div>
                <button class="checkin" data-action="checkin" aria-pressed="${!!entry}" style="--ring:${Math.min(1, s.week / s.plan)}" aria-label="${entry ? 'Checked in today. Tap to undo' : 'Check in for today'}">
                    <span class="checkin-ring"></span>
                    <span class="checkin-inner">${inner}</span>
                </button>
                <p class="hero-msg">${esc(motivation(m, s, b))}</p>
                ${entry ? chipsHtml(tk, entry) : (!m.days[yk] && s.total ? `<button class="link-btn" data-action="log-day" data-key="${yk}">Forgot yesterday? Log it</button>` : '')}
            </section>
            <section class="tiles">
                ${tile('🔥', s.streak, 'day streak')}
                ${tile('⭐', s.weekStreak, 'perfect weeks')}
                ${tile('🎯', fmtPts(s.monthCS), `${monthName(s.scoreMonth, { month: 'short' })} score`)}
            </section>
            ${buddyCard(m, s, b)}
            ${scoreCard(m, b)}
            ${weekCard([m, b].filter(Boolean))}
            ${stepsCard(m, s, b)}
            ${photosCard()}
            ${nextBadgeCard(m)}
            ${installCard()}`;
    }

    const scoreRing = (v, c) => `<span class="sring" style="--c:${c};--p:${v === null ? 0 : Math.min(v, 100)}"><b>${fmtPts(v)}</b></span>`;

    function scoreCard(m, b) {
        const people = [m, b].filter(Boolean), sm = stats(m);
        const rows = people.map(p => {
            const x = stats(p), wks = x.monthWeeks[x.scoreMonth] || [];
            const sub = x.monthCS === null ? 'Scored after your first full week' : `${wks.filter(w => w.A >= 1).length}/${wks.length} perfect week${wks.length === 1 ? '' : 's'}`;
            return `<div class="score-row">${scoreRing(x.monthCS, colorOf(p))}<div class="grow"><strong>${esc(p.name)}</strong><small>${sub} · this week ${Math.round(x.weekPts)} pts so far${x.mult < 1 ? ` · ×${x.mult.toFixed(2)} plan change` : ''}</small></div></div>`;
        }).join('');
        let verdict = '';
        if (b) {
            const a = sm.monthCS, c = stats(b).monthCS;
            if (a !== null && c !== null) verdict = Math.abs(a - c) < 0.5 ? 'Dead even on consistency 🤝' : `${a > c ? 'You are' : `${b.name} is`} more consistent this month by ${Math.round(Math.abs(a - c))} pts.`;
        }
        return `<section class="card"><div class="card-head"><h3>🎯 ${monthName(sm.scoreMonth)} score</h3><button class="link-btn" data-action="score-help">How points work</button></div>${rows}${verdict ? `<p class="verdict">${esc(verdict)}</p>` : ''}</section>`;
    }

    // Loud warning when this phone holds edits GitHub doesn't have (a quiet badge was easy to miss).
    function syncWarnCard() {
        if (LOCAL || !state.pending) return '';
        const noKey = !ls.get(K.token);
        if (!noKey && !state.syncError) return '';
        const title = noKey ? 'Your check-ins are only on this phone' : 'Not synced yet';
        const sub = noKey ? 'Add the sync key so your buddy sees them and they survive clearing the browser.' : `${state.syncError}. Retrying automatically.`;
        return `<section class="card warn-card"><span class="nb-ic">⚠️</span><div class="grow"><strong>${title}</strong><small>${esc(sub)}</small></div><button class="btn btn-sm btn-primary" data-action="${noKey ? 'token' : 'sync-now'}">${noKey ? 'Add key' : 'Retry'}</button></section>`;
    }

    function stepsCard(m, s, b) {
        let foot = '';
        if (b) {
            const bs = stats(b), diff = s.stepsWeek - bs.stepsWeek;
            const line = !s.stepsWeek && !bs.stepsWeek ? 'No steps logged by either of you this week yet'
                : diff === 0 ? 'Level on steps this week'
                    : diff > 0 ? `You're ${fmtN(diff)} steps ahead this week` : `${b.name} is ${fmtN(-diff)} steps ahead this week`;
            foot = `<div class="buddy-foot">${esc(b.name)}: ${fmtN(bs.stepsToday)} today · ${fmtN(bs.stepsWeek)} this week<br>${esc(line)}</div>`;
        }
        return `<section class="card steps-card">
                <div class="card-head"><h3>👟 Steps</h3><button class="btn btn-sm btn-ghost" data-action="log-steps" data-key="${todayKey()}">${s.stepsToday ? 'Edit today' : 'Log steps'}</button></div>
                <div class="steps-row">
                    <div><span class="steps-big">${fmtN(s.stepsToday)}</span><small>today</small></div>
                    <div><b>${fmtN(s.stepsWeek)}</b><small>this week</small></div>
                    <div><b>${fmtN(s.stepsTotal)}</b><small>all time</small></div>
                </div>
                ${foot}
            </section>`;
    }

    function photosCard() {
        const ps = state.photos;
        if (state.photoError) {
            return `<section class="card"><h3>📸 Progress photos</h3><p class="muted">${esc(state.photoError)}</p></section>`;
        }
        const thumbs = ps.slice(0, 3).map(p => `<button class="ph" data-action="photo-view" data-id="${esc(p.id)}"><img src="${p.url}" alt="Progress photo ${p.date}"><span>${fmtShort(p.date)}</span></button>`).join('');
        return `<section class="card photos-card">
                <div class="card-head"><h3>📸 Progress photos</h3>${ps.length ? `<button class="link-btn" data-action="photos">See all ${ps.length} ›</button>` : ''}</div>
                ${ps.length ? '' : '<p class="muted small">Snap a photo now and then. In a few weeks you can compare and see how far you\'ve come.</p>'}
                <div class="ph-strip">${thumbs}<label class="ph ph-add" for="photo-input" role="button" tabindex="0"><span class="ph-plus">＋</span><span>Add photo</span></label></div>
                <p class="fine left">🔒 Photos stay private on this phone. They are not uploaded.</p>
            </section>`;
    }

    function buddyCard(m, s, b) {
        if (!b) {
            return `<section class="card buddy-card">
                <div class="buddy-row"><span class="av av-ghost">＋</span><div class="grow"><strong>Invite your gym buddy</strong><small>Send the link so they can create an account and join the challenge.</small></div></div>
                <button class="btn btn-primary" data-action="invite">Send invite</button>
            </section>`;
        }
        const bs = stats(b), trained = !!b.days[todayKey()], diff = Math.round(s.weekPts - bs.weekPts);
        const line = diff === 0 ? 'Level on points this week' : diff > 0 ? `You lead this week by ${diff} pts` : `${b.name} leads this week by ${-diff} pts`;
        return `<section class="card buddy-card">
                <div class="buddy-row">${av(b)}
                    <div class="grow"><strong>${esc(b.name)} ${trained ? 'trained today 💪' : "hasn't checked in yet"}</strong><small>🔥 ${bs.streak}-day streak · ${bs.week}/${bs.plan} planned this week</small></div>
                    ${trained ? '<span class="pill good">Done</span>' : '<button class="btn btn-sm btn-ghost" data-action="nudge">Nudge 👊</button>'}
                </div>
                <div class="buddy-foot">${esc(line)}</div>
            </section>`;
    }

    function weekCard(people) {
        const ws = startOfWeek(today()), tk = todayKey();
        const head = `<div class="wk-row wk-head"><span></span>${DOW.map(d => `<span>${d[0]}</span>`).join('')}<span></span></div>`;
        const rows = people.map(p => `<div class="wk-row"><span class="wk-name">${esc(p.name)}</span>${DOW.map((_, i) => {
            const k = keyOf(addDays(ws, i));
            return `<span class="wk-dot ${p.days[k] ? 'on' : ''} ${k === tk ? 'today' : ''} ${k > tk ? 'future' : ''}" style="--c:${colorOf(p)}"></span>`;
        }).join('')}<span class="wk-count">${stats(p).week}/${stats(p).plan}</span></div>`).join('');
        return `<section class="card"><h3>This week</h3>${head}${rows}</section>`;
    }

    function nextBadgeCard(m) {
        const s = fullStats(m);
        const next = BADGES.filter(x => x.val(s) < x.goal).map(x => ({ x, r: x.val(s) / x.goal })).sort((a, b) => b.r - a.r)[0];
        if (!next) return '';
        return `<button class="card next-badge" data-action="tab" data-tab="trophies">
                <span class="nb-ic">${next.x.icon}</span>
                <span class="grow"><small>Next badge</small><strong>${next.x.name}</strong>${bar('var(--me)', next.r)}<small>${fmtN(Math.floor(next.x.val(s)))}/${fmtN(next.x.goal)} · ${next.x.desc}</small></span>
                <span class="chev">›</span>
            </button>`;
    }

    function installCard() {
        if (isStandalone() || ls.get(K.installHide) || (!state.installEvt && !isIOS())) return '';
        return `<section class="card install-card">
                <span class="nb-ic">📲</span>
                <div class="grow"><strong>Add to Home Screen</strong><small>${isIOS() ? 'In Safari tap Share, then “Add to Home Screen”.' : 'Install for a full-screen, app-like experience.'}</small></div>
                ${state.installEvt ? '<button class="btn btn-sm btn-primary" data-action="install">Install</button>' : ''}
                <button class="x-btn" data-action="hide-install" aria-label="Dismiss">✕</button>
            </section>`;
    }

    function viewCalendar() {
        const m = me(), b = buddy(), c = state.cal;
        const y = c.getFullYear(), mo = c.getMonth();
        const first = new Date(y, mo, 1), dim = new Date(y, mo + 1, 0).getDate(), lead = (first.getDay() + 6) % 7;
        const t = today(), tk = todayKey();
        const isCur = y === t.getFullYear() && mo === t.getMonth();
        let cells = DOW.map(d => `<span class="cal-dow">${d[0]}</span>`).join('') + '<span class="cal-day empty"></span>'.repeat(lead);
        let mine = 0, bud = 0, both = 0;
        for (let d = 1; d <= dim; d++) {
            const k = keyOf(new Date(y, mo, d));
            const a = !!m.days[k], o = !!(b && b.days[k]), fut = k > tk;
            mine += a; bud += o; both += a && o;
            const label = `${fmtShort(k)}${a ? ', you trained' : ''}${o ? `, ${esc(b.name)} trained` : ''}`;
            cells += `<button class="cal-day ${a ? 'mine' : ''} ${k === tk ? 'today' : ''} ${fut ? 'future' : ''}" data-action="day" data-key="${k}" ${fut ? 'disabled' : ''} aria-label="${label}">${d}${o ? '<span class="bd"></span>' : ''}</button>`;
        }
        return `<section class="card cal-card">
                <div class="cal-head">
                    <button class="icon-btn" data-action="cal-nav" data-d="-1" aria-label="Previous month">‹</button>
                    <h2>${first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
                    <button class="icon-btn" data-action="cal-nav" data-d="1" ${isCur ? 'disabled' : ''} aria-label="Next month">›</button>
                </div>
                <div class="cal-grid">${cells}</div>
                <div class="legend">
                    <span><i class="lg lg-fill" style="--c:${colorOf(m)}"></i>${esc(m.name)} · ${mine}</span>
                    ${b ? `<span><i class="lg lg-dot" style="--c:${colorOf(b)}"></i>${esc(b.name)} · ${bud}</span><span>🤝 Both · ${both}</span>` : ''}
                </div>
            </section>
            <p class="hint">Tap any day to log a missed session or see who trained.</p>`;
    }

    function openDay(k) {
        const m = me(), b = buddy(), e = m.days[k];
        const row = p => {
            const x = p.days[k];
            const st = (p.steps || {})[k];
            const detail = (x ? `Trained${x.w && x.w.length ? ` · ${x.w.map(wLabel).join(', ')}` : ''}${x.t ? ` · ${fmtTime(x.t)}` : ''}` : 'Rest day') + (st ? ` · 👟 ${fmtN(st)}` : '');
            return `<div class="day-row">${av(p)}<div class="grow"><strong>${esc(p.name)}</strong><small>${detail}</small></div>${x ? '<span class="pill good">💪</span>' : '<span class="pill">—</span>'}</div>`;
        };
        const mySteps = (m.steps || {})[k];
        openSheet(`<h2 class="sheet-title">${parseKey(k).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
            ${row(m)}${b ? row(b) : ''}
            ${e ? chipsHtml(k, e) : ''}
            <button class="btn ${e ? 'btn-danger' : 'btn-primary'}" data-action="toggle-day" data-key="${k}">${e ? 'Remove my session' : 'Log my gym session'}</button>
            <button class="btn btn-ghost" data-action="log-steps" data-key="${k}">👟 ${mySteps ? `Edit my steps (${fmtN(mySteps)})` : 'Add my steps'}</button>`, { day: k });
    }

    function viewBattle() {
        const m = me(), b = buddy(), people = [m, b].filter(Boolean);
        const sm = stats(m), label = monthName(sm.scoreMonth, { month: 'short' });
        let html = '';
        if (b) {
            const h = h2h(m, b), sb = stats(b);
            html += `<section class="card vs">
                    <div class="vs-side">${scoreRing(sm.monthCS, colorOf(m))}<strong>${esc(m.name)}</strong></div>
                    <div class="vs-mid">
                        <small>${label} score</small>
                        <div class="vs-score"><span style="color:${colorOf(m)}">${h.aw}</span><em>:</em><span style="color:${colorOf(b)}">${h.bw}</span></div>
                        <small>weeks won</small>
                        <small class="vs-months">Months ${h.am} : ${h.bm}</small>
                    </div>
                    <div class="vs-side">${scoreRing(sb.monthCS, colorOf(b))}<strong>${esc(b.name)}</strong></div>
                    <button class="vs-help" data-action="score-help">ⓘ Points = completion × difficulty × loyalty</button>
                </section>`;
            html += weekBattleCard(m, b);
        } else {
            html += `<section class="card vs solo"><div class="vs-side">${scoreRing(sm.monthCS, colorOf(m))}<strong>${label} score</strong></div><button class="vs-help" data-action="score-help">ⓘ How points work</button></section>`;
            html += buddyCard(m, sm, null);
        }
        html += scoreboardCard(people) + plansCard(people);
        html += challengeCard(people);
        html += stepsBattleCard(people);
        html += `<section class="card"><h3>Weekly points · last 12 weeks</h3>${weeksChart(people)}${legend(people)}</section>`;
        html += powerDaysCard(people) + recapCard(people) + allTimeCard(people);
        return html;
    }

    function scoreboardCard(people) {
        const mk = stats(people[0]).scoreMonth;
        const wks = [...new Set(people.flatMap(p => weeksIn(p, mk).map(x => x.wk)))].sort();
        if (!wks.length) return '';
        const head = `<div class="at-row at-head"><span>Week of</span>${people.map(p => `<span style="color:${colorOf(p)}">${esc(p.name)}</span>`).join('')}</div>`;
        const rows = wks.map(wk => {
            const vals = people.map(p => weeksIn(p, mk).find(x => x.wk === wk));
            const done = vals.filter(Boolean);
            const best = done.length > 1 && done.every(x => x.complete) ? Math.max(...done.map(x => x.pts)) : null;
            const contested = best !== null && done.some(x => Math.abs(x.pts - best) > 0.05);
            return `<div class="at-row"><span>${parseKey(wk).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}${vals.some(x => x && !x.complete) ? ' <em>live</em>' : ''}</span>${vals.map(x => !x ? '<span>—</span>'
                : `<span class="${contested && Math.abs(x.pts - best) <= 0.05 ? 'best' : ''}">${Math.round(x.pts)}<small class="sub"> ${x.done}/${x.plan}</small></span>`).join('')}</div>`;
        }).join('');
        const foot = `<div class="at-row at-total"><span>Month score</span>${people.map(p => `<span>${fmtPts(stats(p).monthCS)}</span>`).join('')}</div>`;
        return `<section class="card"><div class="card-head"><h3>${monthName(mk)} scoreboard</h3></div><div class="at" style="--n:${people.length}">${head}${rows}${foot}</div><p class="fine left">Points per week · sessions done/planned. Live week doesn't count until Sunday ends.</p></section>`;
    }

    function plansCard(people) {
        const ss = people.map(stats);
        const head = `<div class="at-row at-head"><span></span>${people.map(p => `<span style="color:${colorOf(p)}">${esc(p.name)}</span>`).join('')}</div>`;
        const rows = [
            ['Weekly plan', (p, s) => `${s.goal}/wk`],
            ['Difficulty', (p, s) => `×${DIFF(s.goal).toFixed(2)}`],
            ['Changes (90 days)', (p, s) => (s.changes ? String(s.changes) : '0')],
            ['Plan loyalty', (p, s) => `<span class="${s.mult < 1 ? 'warn-txt' : 'ok-txt'}">×${s.mult.toFixed(2)}</span>`]
        ].map(([label, f]) => `<div class="at-row"><span>${label}</span>${people.map((p, i) => `<span>${f(p, ss[i])}</span>`).join('')}</div>`).join('');
        return `<section class="card"><div class="card-head"><h3>📋 Plans</h3><button class="link-btn" data-action="plan">My plan ›</button></div><div class="at" style="--n:${people.length}">${head}${rows}</div></section>`;
    }

    function weekBattleCard(m, b) {
        const sm = stats(m), sb = stats(b);
        const diff = Math.round(sm.weekPts - sb.weekPts);
        let v;
        if (sm.weekA >= 1 && sb.weekA >= 1) v = 'Both plans complete. Perfect week all round 🤝';
        else if (sm.weekA >= 1) v = `Your plan is done ✅ ${b.name} needs ${sb.plan - sb.week} more.`;
        else if (sb.weekA >= 1) v = `${b.name}'s plan is done. You need ${sm.plan - sm.week} more!`;
        else v = diff === 0 ? 'Level on points. First to finish their plan sets the pace 🏁' : `${diff > 0 ? 'You lead' : `${b.name} leads`} by ${Math.abs(diff)} pts so far.`;
        const row = (p, s) => `<div class="mrow"><div class="mrow-top"><span>${esc(p.name)} <small class="sub">${s.week}/${s.plan} planned</small></span><span><b>${Math.round(s.weekPts)}</b> pts</span></div>${bar(colorOf(p), s.weekA, 'thick')}</div>`;
        return `<section class="card"><h3>This week's showdown</h3>${row(m, sm)}${row(b, sb)}<p class="verdict">${esc(v)}</p></section>`;
    }

    function stepsBattleCard(people) {
        const ss = people.map(stats);
        const metrics = [['Today', s => s.stepsToday], ['This week', s => s.stepsWeek], ['This month', s => s.stepsMonth],
            ['Daily average', s => s.stepsAvg], ['Best day', s => s.maxSteps], ['All time', s => s.stepsTotal]];
        const head = `<div class="at-row at-head"><span></span>${people.map(p => `<span style="color:${colorOf(p)}">${esc(p.name)}</span>`).join('')}</div>`;
        const rows = metrics.map(([label, f]) => {
            const vals = ss.map(f), best = Math.max(...vals), contested = vals.some(v => v !== best);
            return `<div class="at-row"><span>${label}</span>${vals.map(v => `<span class="${people.length > 1 && contested && v === best ? 'best' : ''}">${fmtN(v)}</span>`).join('')}</div>`;
        }).join('');
        let v = '';
        if (people.length > 1) {
            const [a, c] = ss;
            v = !a.stepsWeek && !c.stepsWeek ? 'No steps logged this week yet. Get walking!'
                : a.stepsWeek === c.stepsWeek ? 'Neck and neck on steps this week 🤝'
                    : `${a.stepsWeek > c.stepsWeek ? 'You lead' : `${people[1].name} leads`} the step count this week.`;
        }
        return `<section class="card"><div class="card-head"><h3>👟 Step battle</h3><button class="btn btn-sm btn-ghost" data-action="log-steps" data-key="${todayKey()}">Log steps</button></div><div class="at" style="--n:${people.length}">${head}${rows}</div>${v ? `<p class="verdict">${esc(v)}</p>` : ''}</section>`;
    }

    function challengeCard(people) {
        const t = today(), mk = todayKey().slice(0, 7);
        const ch = CHALLENGES[(t.getFullYear() * 12 + t.getMonth()) % CHALLENGES.length];
        const scores = people.map(p => ({ p, v: ch.score(p, mk) }));
        const vals = scores.map(x => x.v);
        const top = ch.low ? Math.min(...vals) : Math.max(...vals);
        const anyData = ch.low ? people.some(p => weeksIn(p, mk).some(x => x.complete)) : top > 0;
        const leaders = anyData ? scores.filter(x => x.v === top) : [];
        const daysLeft = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate() - t.getDate();
        const verdict = !anyData ? 'No points yet. Grab the early lead!' : people.length > 1 && leaders.length > 1 ? 'All square. Tiebreaker incoming…' : people.length > 1 ? `${leaders[0].p.name} leads` : `Your score: ${top}${ch.unit ? ` ${ch.unit}` : ''}`;
        return `<section class="card challenge">
                <div class="ch-top"><span class="nb-ic">${ch.icon}</span><div class="grow"><small>Challenge of the month</small><strong>${ch.name}</strong><small>${ch.desc}</small></div><span class="pill">${daysLeft}d left</span></div>
                <div class="ch-scores">${scores.map(x => `<div class="ch-score ${leaders.length === 1 && leaders[0] === x && people.length > 1 ? 'lead' : ''}" style="--c:${colorOf(x.p)}">${av(x.p, 'av-sm')}<b>${x.v}</b><span>${esc(x.p.name)}</span></div>`).join('')}</div>
                <p class="verdict">${esc(verdict)}</p>
            </section>`;
    }

    function weeksChart(people) {
        const N = 12, W = 336, H = 150, B = 22, T = 10, GUTTER = 30;
        const cur = startOfWeek(today());
        const weeks = Array.from({ length: N }, (_, i) => keyOf(addDays(cur, -7 * (N - 1 - i))));
        const data = people.map(p => {
            const byWk = Object.fromEntries(stats(p).scored.map(x => [x.wk, x.pts]));
            return weeks.map(wk => byWk[wk] || 0);
        });
        const max = Math.max(115, ...data.flat());
        const gw = (W - GUTTER) / N, bw = (gw - 6) / people.length, plot = H - B - T;
        const y = v => H - B - plot * v / max;
        let svg = `<line x1="0" x2="${W - GUTTER + 2}" y1="${y(100).toFixed(1)}" y2="${y(100).toFixed(1)}" class="goal-line"/><text x="${W}" y="${(y(100) + 3.5).toFixed(1)}" text-anchor="end" class="goal-txt">100</text>`;
        weeks.forEach((wk, i) => {
            people.forEach((p, j) => {
                const v = data[j][i], h = v ? plot * v / max : 2;
                svg += `<rect x="${(i * gw + 3 + j * bw).toFixed(1)}" y="${(H - B - h).toFixed(1)}" width="${Math.max(2, bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${colorOf(p)}" opacity="${v ? (i === N - 1 ? 0.55 : 0.92) : 0.2}"/>`;
            });
            if (i % 3 === 2 || i === N - 1) {
                const label = i === N - 1 ? 'Now' : parseKey(wk).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
                svg += `<text x="${(i * gw + gw / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle" class="axis-txt">${label}</text>`;
            }
        });
        return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly points over the last 12 weeks">${svg}</svg>`;
    }

    function topDays(dow) {
        const idx = dow.map((v, i) => [v, i]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, 3).map(x => x[1]).sort((a, b) => a - b);
        return idx.length ? idx.map(i => DOW[i]).join(' · ') : 'No data yet';
    }

    function powerDaysCard(people) {
        const max = Math.max(1, ...people.flatMap(p => stats(p).dow));
        const rows = DOW.map((d, i) => `<div class="pd-row"><span class="pd-lbl">${d}</span><div class="pd-bars">${people.map(p => bar(colorOf(p), stats(p).dow[i] / max, 'thin')).join('')}</div></div>`).join('');
        const tops = people.map(p => `<div class="pd-top"><i class="lg" style="--c:${colorOf(p)}"></i><span>${esc(p.name)}</span><b>${topDays(stats(p).dow)}</b></div>`).join('');
        return `<section class="card"><h3>Power days</h3>${rows}<div class="pd-tops">${tops}</div></section>`;
    }

    function recapCard(people) {
        const curMk = stats(people[0]).scoreMonth;
        const months = [...new Set(people.flatMap(p => Object.keys(stats(p).monthScore)))].sort().reverse().slice(0, 6);
        if (!months.length) return '';
        const rows = months.map(mk => {
            const vals = people.map(p => stats(p).monthScore[mk]);
            const nums = vals.filter(v => v !== undefined);
            const top = Math.max(...nums);
            const solo = people.length > 1 && nums.length > 1 && nums.filter(v => Math.abs(v - top) <= 0.05).length === 1;
            const label = monthName(mk, mk.slice(0, 4) === curMk.slice(0, 4) ? { month: 'short' } : { month: 'short', year: '2-digit' });
            return `<div class="at-row"><span>${label}${mk === curMk ? ' <em>so far</em>' : ''}</span>${vals.map(v => {
                const win = solo && v !== undefined && Math.abs(v - top) <= 0.05;
                return `<span class="${win ? 'best' : ''}">${fmtPts(v)}${win ? (mk === curMk ? ' ↑' : ' 👑') : ''}</span>`;
            }).join('')}</div>`;
        }).join('');
        const head = `<div class="at-row at-head"><span></span>${people.map(p => `<span style="color:${colorOf(p)}">${esc(p.name)}</span>`).join('')}</div>`;
        return `<section class="card"><h3>Monthly scores</h3><div class="at" style="--n:${people.length}">${head}${rows}</div></section>`;
    }

    function allTimeCard(people) {
        const metrics = [
            ['Perfect weeks', s => s.perfectWeeks, v => v],
            ['Best perfect run', s => s.longestWeek, v => `${v} wk`],
            ['Best month score', s => s.bestMonthCS, v => (v ? Math.round(v) : '—')],
            ['Total sessions', s => s.total, v => v],
            ['Longest day streak', s => s.longest, v => `${v} d`],
            ['Badges', s => BADGES.filter(x => x.val(s) >= x.goal).length, v => `${v}/${BADGES.length}`]
        ];
        const ss = people.map(fullStats);
        const head = `<div class="at-row at-head"><span></span>${people.map(p => `<span style="color:${colorOf(p)}">${esc(p.name)}</span>`).join('')}</div>`;
        const rows = metrics.map(([label, f, fmt]) => {
            const vals = ss.map(f), best = Math.max(...vals), contested = vals.some(v => v !== best);
            return `<div class="at-row"><span>${label}</span>${vals.map(v => `<span class="${people.length > 1 && contested && v === best ? 'best' : ''}">${fmt(v)}</span>`).join('')}</div>`;
        }).join('');
        return `<section class="card"><h3>All-time</h3><div class="at" style="--n:${people.length}">${head}${rows}</div></section>`;
    }

    function viewTrophies() {
        const m = me(), b = buddy();
        const who = state.trophyFor === 'buddy' && b ? b : m;
        const s = fullStats(who);
        const earned = BADGES.filter(x => x.val(s) >= x.goal).length;
        const seg = b ? `<div class="seg"><button class="${who === m ? 'on' : ''}" data-action="trophy-for" data-v="me">${esc(m.name)}</button><button class="${who === b ? 'on' : ''}" data-action="trophy-for" data-v="buddy">${esc(b.name)}</button></div>` : '';
        const grid = BADGES.map(x => {
            const v = Math.min(x.val(s), x.goal), ok = v >= x.goal;
            return `<div class="badge ${ok ? '' : 'locked'}"><span class="ic">${x.icon}</span><span class="nm">${x.name}</span><span class="ds">${x.desc}</span>${ok ? '<span class="ok">Unlocked</span>' : `${bar(colorOf(who), v / x.goal, 'thin')}<span class="prog">${fmtN(Math.floor(v))}/${fmtN(x.goal)}</span>`}</div>`;
        }).join('');
        return `${seg}
            <section class="card trophy-head">${av(who, 'av-lg')}<div class="grow"><strong>${earned} / ${BADGES.length}</strong><small>badges unlocked by ${esc(who.name)}</small>${bar(colorOf(who), earned / BADGES.length)}</div></section>
            <div class="badge-grid">${grid}</div>`;
    }

    function viewMe() {
        const m = me(), s = fullStats(m), b = buddy();
        const others = Object.values(state.members).filter(x => x.id !== m.id);
        const since = new Date(m.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
        const row = (icon, title, sub, action, extra = '') => `<button class="row" data-action="${action}"><span class="row-ic">${icon}</span><span class="grow">${title}${sub ? `<small>${sub}</small>` : ''}</span>${extra || '<span class="chev">›</span>'}</button>`;
        return `<section class="card profile">
                ${av(m, 'av-xl')}
                <h2>${esc(m.name)}</h2>
                <small>Member since ${since} · ${s.total} sessions</small>
                <button class="btn btn-sm btn-ghost" data-action="edit-profile">Edit profile</button>
            </section>
            <h4 class="list-title">Training</h4>
            <div class="list">
                ${(() => {
                    const curWk = keyOf(startOfWeek(today()));
                    const pending = m.goalHistory.find(e => e.from > curWk);
                    const sub = `${m.weeklyGoal} sessions/week${pending ? ` · ${pending.goal}/wk from ${fmtShort(pending.from)}` : ''}${s.mult < 1 ? ` · loyalty ×${s.mult.toFixed(2)}` : ' · locked 🔒'}`;
                    return row('🎯', 'Weekly plan', sub, 'plan');
                })()}
                ${row('ⓘ', 'How points work', 'Completion × difficulty × plan loyalty', 'score-help')}
                ${others.length > 1 ? `<label class="row"><span class="row-ic">🤝</span><span class="grow">Compare with</span><select data-change="buddy">${others.map(o => `<option value="${o.id}" ${b && o.id === b.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label>` : ''}
                ${row('�', 'Log steps', `${fmtN(s.stepsTotal)} steps logged in total`, 'log-steps')}
                ${row('📸', 'Progress photos', `${state.photos.length} on this phone · private`, 'photos')}
                ${row('�📨', 'Invite a friend', 'Share the app link', 'invite')}
            </div>
            <h4 class="list-title">Sync & security</h4>
            <div class="list">
                ${row('🔄', 'Sync now', esc(syncText()), 'sync-now')}
                ${LOCAL ? '' : row('🔑', 'Sync key', ls.get(K.token) ? 'Saved on this device' : 'Not set — check-ins stay on this phone', 'token')}
                ${row('🔒', 'Change PIN', '', 'change-pin')}
                ${row('🗑️', 'Delete my account', 'Removes your profile and history', 'delete-account')}
            </div>
            <h4 class="list-title">App</h4>
            <div class="list">
                ${isStandalone() ? '' : row('📲', 'Install app', 'Add to your home screen', 'install-help')}
                ${row('⬇️', 'Export my data', 'Download a JSON backup', 'export')}
                <a class="row" href="tasks.html"><span class="row-ic">📋</span><span class="grow">Task tracker<small>The original accountability tracker</small></span><span class="chev">›</span></a>
            </div>
            <button class="btn btn-danger" data-action="logout">Log out on this device</button>
            <p class="foot">Gym Buddies v${APP_VERSION}${LOCAL ? ' · local mode' : ''}</p>`;
    }

    const VIEWS = { today: viewToday, calendar: viewCalendar, battle: viewBattle, trophies: viewTrophies, me: viewMe };

    // ---------- sheets, toast, effects ----------
    function openSheet(html, opts = {}) {
        state.sheetDay = opts.day || null;
        state.sheetKind = opts.kind || null;
        $('#sheet-body').innerHTML = html;
        $('#sheet').hidden = false;
        document.body.classList.add('no-scroll');
        if (opts.focus) {
            const f = $('#sheet-body input:not([type=hidden])');
            if (f) setTimeout(() => f.focus(), 280);
        }
    }

    function closeSheet() {
        $('#sheet').hidden = true;
        $('#sheet-body').innerHTML = '';
        state.sheetDay = null;
        state.sheetKind = null;
        document.body.classList.remove('no-scroll');
    }

    let toastTimer;
    function toast(msg, opt) {
        const el = $('#toast');
        el.innerHTML = `<span>${esc(msg)}</span>${opt ? `<button type="button">${esc(opt.action)}</button>` : ''}`;
        if (opt) el.querySelector('button').onclick = () => { opt.fn(); el.classList.remove('show'); };
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), opt ? 4500 : 2600);
    }

    function celebrate(big) {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const box = $('#confetti');
        const btn = $('.checkin');
        const r = btn && !big ? btn.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2.5, width: 0, height: 0 };
        box.style.left = `${r.left + r.width / 2}px`;
        box.style.top = `${r.top + r.height / 2}px`;
        const m = me();
        const b = buddy();
        const cols = [m ? colorOf(m) : COLORS[0], b ? colorOf(b) : COLORS[1], '#ffd166', '#ffffff', '#22c55e'];
        for (let i = 0; i < (big ? 70 : 46); i++) {
            const p = document.createElement('i');
            const ang = Math.random() * Math.PI * 2, dist = 70 + Math.random() * (big ? 240 : 170);
            p.style.cssText = `--x:${(Math.cos(ang) * dist).toFixed(0)}px;--y:${(Math.sin(ang) * dist - 50).toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;background:${cols[i % cols.length]};animation-delay:${(Math.random() * 90).toFixed(0)}ms`;
            box.appendChild(p);
        }
        setTimeout(() => { box.textContent = ''; }, 1500);
    }

    function askToken(force) {
        if (LOCAL || (!force && !$('#sheet').hidden)) return;
        const has = !!ls.get(K.token);
        openSheet(`<h2 class="sheet-title">🔑 Connect this phone</h2>
            <p class="muted">${has ? 'This phone has a sync key saved. Paste a new one to replace it.' : 'To share check-ins with your buddy, this phone needs the group sync key. You only enter it once per device.'}</p>
            <form id="token-form" autocomplete="off">
                <label class="field"><span>Sync key</span><input name="token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ghp_… or github_pat_…" required></label>
                <p class="form-err"></p>
                <button class="btn btn-primary" type="submit">Save &amp; sync</button>
                ${has ? '<button class="btn btn-danger" type="button" data-action="clear-token">Remove key from this phone</button>' : '<button class="btn btn-ghost" type="button" data-action="close-sheet">Later</button>'}
            </form>
            <details class="help"><summary>What is this?</summary><p>Your data lives in a GitHub Gist that anyone with its link can read. The sync key is a GitHub token with only the <b>gist</b> permission, created by the gist owner. It's stored only on this device and only sent to api.github.com.</p></details>`, { focus: true });
    }

    function installHelp() {
        const ios = isIOS();
        openSheet(`<h2 class="sheet-title">📲 Install Gym Buddies</h2>
            ${state.installEvt ? '<button class="btn btn-primary" data-action="install">Install now</button>' : ''}
            <ol class="steps">${ios
                ? '<li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (square with an arrow).</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open it from your home screen and log in once more. Home-screen apps on iPhone keep their own storage.</li>'
                : '<li>Open this page in <b>Chrome</b> or <b>Samsung Internet</b>.</li><li>Tap the <b>⋮</b> (or ☰) menu.</li><li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li><li>Launch it from your home screen. It opens full-screen like a native app.</li>'}</ol>
            <button class="btn btn-ghost" data-action="close-sheet">Got it</button>`);
    }

    // ---------- mutations ----------
    // Shows the unlock pop-up for any badge earned since `before`; returns true if one was shown.
    function announceBadges(before) {
        const after = earnedSet(me());
        const x = BADGES.find(b => after.has(b.id) && !before.has(b.id));
        if (!x) return false;
        setTimeout(() => {
            openSheet(`<div class="unlock"><span class="unlock-ic">${x.icon}</span><small>Badge unlocked</small><h2>${x.name}</h2><p class="muted">${x.desc}</p><button class="btn btn-primary" data-action="close-sheet">Let's go!</button></div>`);
            celebrate(true);
        }, 450);
        return true;
    }

    function checkIn(k) {
        const m = me();
        if (!m || k > todayKey() || m.days[k]) return;
        const before = earnedSet(m);
        mutateMe(x => {
            const now = new Date().toISOString();
            x.days[k] = k === todayKey() ? { t: now, u: now } : { u: now };
            if (x.tomb) delete x.tomb[`d:${k}`];
        });
        if (k === todayKey()) state.checkedInAt = Date.now();
        haptic(25);
        if (k === todayKey()) celebrate();
        if (!state.sheetDay && announceBadges(before)) return;
        const s = stats(me());
        const msg = k === todayKey() ? (s.streak > 1 ? `🔥 ${s.streak}-day streak!` : 'Checked in 💪') : `Logged ${fmtShort(k)}`;
        toast(msg, { action: 'Undo', fn: () => removeDay(k, true) });
    }

    function removeDay(k, silent) {
        if (!me() || !me().days[k]) return;
        mutateMe(x => {
            delete x.days[k];
            x.tomb = x.tomb || {};
            x.tomb[`d:${k}`] = new Date().toISOString();
        });
        if (!silent) toast('Session removed');
        if (state.sheetDay === k) openDay(k);
    }

    function toggleTag(k, w) {
        if (!me() || !me().days[k] || !WORKOUT_IDS.has(w)) return;
        mutateMe(x => {
            const e = x.days[k];
            const set = new Set(e.w || []);
            if (set.has(w)) set.delete(w); else set.add(w);
            const arr = [...set].slice(0, 4);
            if (arr.length) e.w = arr; else delete e.w;
            e.u = new Date().toISOString();
        });
        haptic(10);
        if (state.sheetDay === k) openDay(k);
    }

    async function shareText(text) {
        const url = appUrl();
        if (navigator.share) {
            try { await navigator.share({ title: 'Gym Buddies', text, url }); } catch (e) { /* user cancelled */ }
            return;
        }
        try {
            await navigator.clipboard.writeText(`${text} ${url}`);
            toast('Copied. Paste it in your chat');
        } catch (e) {
            toast(url);
        }
    }

    // What changing the weekly plan to `g` would do right now.
    function planImpact(m, g) {
        const curWk = keyOf(startOfWeek(today()));
        const nextMon = keyOf(addDays(startOfWeek(today()), 7));
        const current = goalFor(m, curWk);
        if (Date.now() < Date.parse(m.createdAt) + CALIBRATION_DAYS * 864e5) {
            const until = addDays(new Date(m.createdAt), CALIBRATION_DAYS);
            return { same: g === current, free: true, from: curWk, w: 0, until };
        }
        if (g === current) return { same: true };
        const w = g > current ? 0.5 : 1;
        const settled = { goalHistory: m.goalHistory.filter(e => e.from <= curWk) };
        const c = changeLoad(settled, Date.now()) + w;
        return { from: nextMon, w, c, mult: PENALTY(c), until: addDays(today(), PENALTY_DAYS) };
    }

    function updatePlanPreview(f) {
        const m = me(), el = f.querySelector('.plan-preview');
        if (!m || !el) return;
        const g = clamp(parseInt(f.elements.goal.value, 10) || m.weeklyGoal, 1, 7);
        const imp = planImpact(m, g);
        const pending = m.goalHistory.some(e => e.from > keyOf(startOfWeek(today())));
        const btn = f.querySelector('button[type=submit]');
        let html;
        if (imp.same) {
            html = pending ? '↩️ Keeps your current plan and cancels the pending change. No penalty.' : '✅ That\'s your current plan.';
            btn.disabled = !pending;
        } else if (imp.free) {
            html = `✨ <b>Free change.</b> You're in your 14-day setup window (until ${imp.until.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}). Applies from this week. Difficulty ×${DIFF(g).toFixed(2)}.`;
            btn.disabled = false;
        } else {
            const pctOff = Math.round((1 - imp.mult) * 100);
            html = `<b>${imp.w === 1 ? 'Lowering' : 'Raising'} your plan</b> counts as ${imp.w === 1 ? 'a full' : 'a half'} change.<br>
                Loyalty becomes <b class="warn-txt">×${imp.mult.toFixed(2)}</b> (−${pctOff}% on weekly points) until ${imp.until.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}.<br>
                Starts ${fmtShort(imp.from)}. Difficulty ×${DIFF(g).toFixed(2)}.`;
            btn.disabled = false;
        }
        el.innerHTML = html;
    }

    function openPlan() {
        const m = me(), curWk = keyOf(startOfWeek(today()));
        const pending = m.goalHistory.find(e => e.from > curWk);
        const start = pending ? pending.goal : m.weeklyGoal;
        openSheet(`<h2 class="sheet-title">🎯 Weekly plan</h2>
            <p class="muted">You're committed to <b>${m.weeklyGoal}</b> session${m.weeklyGoal > 1 ? 's' : ''} a week.${pending ? ` Switching to <b>${pending.goal}</b> from ${fmtShort(pending.from)}.` : ''}</p>
            <form id="plan-form" novalidate>
                <div class="stepper big plan-step">
                    <button type="button" data-action="step" data-field="goal" data-d="-1" aria-label="Decrease">−</button>
                    <b data-out="goal">${start}</b>
                    <button type="button" data-action="step" data-field="goal" data-d="1" aria-label="Increase">+</button>
                    <small>sessions / week</small>
                </div>
                <input type="hidden" name="goal" value="${start}">
                <div class="plan-preview"></div>
                <p class="form-err"></p>
                <button class="btn btn-primary" type="submit">Confirm plan</button>
                ${pending ? '<button class="btn btn-ghost" type="button" data-action="plan-cancel">Cancel pending change (free)</button>' : ''}
            </form>`, { kind: 'plan' });
        updatePlanPreview($('#plan-form'));
    }

    function openScoreHelp() {
        const m = me(), g = m ? m.weeklyGoal : DEFAULT_GOAL;
        openSheet(`<h2 class="sheet-title">How points work</h2>
            <p class="muted">The battle rewards <b>sticking to your own plan</b>, not doing more than your buddy.</p>
            <div class="rules">
                <div class="rule"><span class="rule-ic">🎯</span><div><b>Complete your plan</b><small>Up to 100 pts a week. 3 of 4 planned = 75. Extra sessions don't add points.</small></div></div>
                <div class="rule"><span class="rule-ic">💪</span><div><b>Bigger plan, bigger multiplier</b><small>More days a week is harder to keep.</small>
                    <div class="mchips">${[1, 2, 3, 4, 5, 6, 7].map(n => `<span class="mchip ${n === g ? 'on' : ''}"><b>${n}</b>×${DIFF(n).toFixed(2)}</span>`).join('')}</div></div></div>
                <div class="rule"><span class="rule-ic">🔒</span><div><b>Stay loyal to your plan</b><small>Each change cuts points for 90 days: −5%, −15%, −30% (max −40%). Raising counts as half. Free in your first 14 days.</small></div></div>
                <div class="rule"><span class="rule-ic">🏆</span><div><b>Win weeks and months</b><small>More points wins the week. Month score = average of its weeks. A week belongs to the month most of its days fall in.</small></div></div>
            </div>
            <div class="formula">points = completion × difficulty × loyalty × 100</div>
            <button class="btn btn-ghost" data-action="close-sheet">Got it</button>`, { kind: 'help' });
    }

    function openSteps(k) {
        const m = me();
        if (!m) return;
        if (!DATE_RE.test(k || '') || k > todayKey()) k = todayKey();
        const cur = (m.steps || {})[k] || '';
        openSheet(`<h2 class="sheet-title">👟 Log steps</h2>
            <form id="steps-form" autocomplete="off" novalidate>
                <label class="field"><span>Date</span><input name="date" type="date" value="${k}" min="${MIN_DATE}" max="${todayKey()}" required></label>
                <label class="field"><span>Total steps walked that day</span><input name="steps" type="number" inputmode="numeric" min="0" max="${MAX_STEPS}" step="1" value="${cur}" placeholder="e.g. 8500"></label>
                <div class="chips left">${[1000, 2500, 5000].map(n => `<button type="button" class="tag" data-action="steps-add" data-n="${n}">+${fmtN(n)}</button>`).join('')}<button type="button" class="tag" data-action="steps-add" data-n="0">Clear</button></div>
                <p class="form-err"></p>
                <button class="btn btn-primary" type="submit">Save steps</button>
                <p class="fine">Enter the day's total from your phone's health app. Saving 0 removes that day's steps.</p>
            </form>`, { kind: 'steps' });
    }

    // ---------- progress photos (IndexedDB on this device only) ----------
    const PhotoDB = {
        conn: null,
        open() {
            if (!this.conn) {
                this.conn = new Promise((resolve, reject) => {
                    if (!window.indexedDB) { reject(new Error('Photo storage is not supported in this browser.')); return; }
                    const r = indexedDB.open('gym-buddies', 1);
                    r.onupgradeneeded = () => {
                        const s = r.result.createObjectStore('photos', { keyPath: 'id' });
                        s.createIndex('memberId', 'memberId');
                    };
                    r.onsuccess = () => resolve(r.result);
                    r.onerror = () => reject(r.error || new Error('Could not open photo storage.'));
                    r.onblocked = () => reject(new Error('Close other Gym Buddies tabs and try again.'));
                });
                this.conn.catch(() => { this.conn = null; });
            }
            return this.conn;
        },
        async run(mode, fn) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('photos', mode);
                let result;
                const req = fn(tx.objectStore('photos'));
                if (req) req.onsuccess = () => { result = req.result; };
                tx.oncomplete = () => resolve(result);
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error && tx.error.name === 'QuotaExceededError' ? new Error('Phone storage is full. Free up space and try again.') : (tx.error || new Error('Saving failed.')));
            });
        },
        list(memberId) { return this.run('readonly', s => s.index('memberId').getAll(memberId)); },
        put(rec) { return this.run('readwrite', s => s.put(rec)); },
        remove(id) { return this.run('readwrite', s => s.delete(id)); },
        async removeMember(memberId) {
            const list = await this.list(memberId);
            for (const p of list || []) await this.remove(p.id);
        }
    };

    function clearPhotoUrls() {
        for (const p of state.photos) URL.revokeObjectURL(p.url);
        state.photos = [];
    }

    async function loadPhotos() {
        const id = state.meId;
        if (!id) { clearPhotoUrls(); return; }
        try {
            const list = await PhotoDB.list(id);
            if (id !== state.meId) return;
            clearPhotoUrls();
            state.photos = (list || [])
                .filter(p => p && p.data && DATE_RE.test(p.date || ''))
                .map(p => ({ id: p.id, date: p.date, createdAt: p.createdAt, url: URL.createObjectURL(new Blob([p.data], { type: p.type || 'image/jpeg' })) }))
                .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
            state.photoError = null;
        } catch (e) {
            clearPhotoUrls();
            state.photoError = e.message || 'Photo storage is unavailable.';
        }
    }

    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image. Try a JPEG or PNG photo.')); };
            img.src = url;
        });
    }

    // Downscale to max 1600px JPEG so photos stay ~200-400 KB each.
    async function compressImage(file) {
        const img = await loadImage(file);
        const w0 = img.naturalWidth, h0 = img.naturalHeight;
        if (!w0 || !h0) throw new Error('That image looks empty.');
        const scale = Math.min(1, 1600 / Math.max(w0, h0));
        const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
        if (!blob) throw new Error('Could not process that image.');
        return { blob, w, h };
    }

    async function addPhoto(file) {
        if (!file || !me() || state.photoBusy) return;
        if (file.type && !file.type.startsWith('image/')) { toast('Please choose a photo'); return; }
        if (file.size > MAX_PHOTO_BYTES) { toast('That photo is too large (max 40 MB)'); return; }
        state.photoBusy = true;
        toast('Saving photo…');
        try {
            const { blob, w, h } = await compressImage(file);
            const data = await new Response(blob).arrayBuffer();
            await PhotoDB.put({ id: `${Date.now()}-${randHex(4)}`, memberId: state.meId, date: todayKey(), createdAt: new Date().toISOString(), type: 'image/jpeg', w, h, data });
            if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { /* best effort */ });
            await loadPhotos();
            render();
            if (state.sheetKind === 'gallery') openGallery();
            haptic(20);
            toast('Progress photo saved 📸');
        } catch (e) {
            toast(e.message || 'Could not save that photo');
        } finally {
            state.photoBusy = false;
        }
    }

    const findPhoto = id => state.photos.find(p => p.id === id);

    function openGallery() {
        const ps = state.photos;
        openSheet(`<h2 class="sheet-title">📸 Progress photos</h2>
            <p class="muted">${ps.length} photo${ps.length === 1 ? '' : 's'} · 🔒 stored only on this phone</p>
            <label class="btn btn-primary" for="photo-input" role="button" tabindex="0">Add photo</label>
            ${ps.length >= 2 ? `<button class="btn btn-ghost" data-action="photo-compare" data-id="${esc(ps[0].id)}">Compare first vs latest</button>` : ''}
            ${state.photoError ? `<p class="form-err">${esc(state.photoError)}</p>` : ''}
            <div class="ph-grid">${ps.map(p => `<button class="ph" data-action="photo-view" data-id="${esc(p.id)}"><img src="${p.url}" alt="Progress photo ${p.date}" loading="lazy"><span>${fmtShort(p.date)}</span></button>`).join('')}</div>
            <p class="fine">Photos are never uploaded. Use Share to send one to your buddy, or to back it up.</p>`, { kind: 'gallery' });
    }

    function openPhoto(id) {
        const ps = state.photos, p = findPhoto(id);
        if (!p) { openGallery(); return; }
        const first = ps[ps.length - 1];
        const day = dayDiff(parseKey(first.date), parseKey(p.date));
        openSheet(`<div class="ph-view"><img src="${p.url}" alt="Progress photo ${p.date}"></div>
            <h2 class="sheet-title">${fmtLong(p.date)}</h2>
            <p class="muted">${p === first ? 'Your first progress photo' : `Day ${day} of your journey`}</p>
            <div class="btn-row">
                <button class="btn btn-ghost" data-action="photo-share" data-id="${esc(p.id)}">Share</button>
                ${p !== first ? `<button class="btn btn-ghost" data-action="photo-compare" data-id="${esc(p.id)}">Compare</button>` : ''}
            </div>
            <button class="btn btn-danger" data-action="photo-delete" data-id="${esc(p.id)}">Delete photo</button>
            <button class="btn btn-ghost" data-action="photos">Back to all photos</button>`, { kind: 'photo' });
    }

    function openCompare(id) {
        const ps = state.photos, p = findPhoto(id) || ps[0], first = ps[ps.length - 1];
        if (!p || !first || p === first) { openGallery(); return; }
        const days = dayDiff(parseKey(first.date), parseKey(p.date));
        const side = (x, label) => `<figure><img src="${x.url}" alt="${label} photo ${x.date}"><figcaption><b>${label}</b>${fmtShort(x.date)}</figcaption></figure>`;
        openSheet(`<h2 class="sheet-title">Then vs now</h2>
            <p class="muted">${days} day${days === 1 ? '' : 's'} apart</p>
            <div class="ph-compare">${side(first, 'First')}${side(p, 'Latest')}</div>
            <button class="btn btn-ghost" data-action="photos">Back to all photos</button>`, { kind: 'compare' });
    }

    async function sharePhoto(id) {
        const p = findPhoto(id);
        if (!p) return;
        const name = `progress-${p.date}.jpg`;
        try {
            const blob = await (await fetch(p.url)).blob();
            const file = new File([blob], name, { type: 'image/jpeg' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: 'Progress photo' });
                return;
            }
        } catch (e) {
            if (e && e.name === 'AbortError') return;
        }
        const a = document.createElement('a');
        a.href = p.url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    function doLogout() {
        closeSheet();
        clearPhotoUrls();
        ls.del(K.me);
        state.meId = null;
        state.pending = false;
        ls.set(K.pending, false);
        state.auth = { step: 'pick' };
        render();
    }

    // ---------- event wiring ----------
    const actions = {
        tab: el => { state.tab = el.dataset.tab; window.scrollTo(0, 0); render(); },
        checkin: () => {
            const k = todayKey();
            if (!me().days[k]) { checkIn(k); return; }
            // Ignore an accidental double tap right after checking in.
            if (Date.now() - (state.checkedInAt || 0) < 1200) return;
            openSheet(`<h2 class="sheet-title">Undo today's check-in?</h2><p class="muted">This removes today's session from your streak and stats.</p>
                <button class="btn btn-danger" data-action="confirm-remove" data-key="${k}">Remove check-in</button>
                <button class="btn btn-ghost" data-action="close-sheet">Keep it</button>`);
        },
        'confirm-remove': el => { closeSheet(); removeDay(el.dataset.key); },
        'log-day': el => checkIn(el.dataset.key),
        'toggle-day': el => {
            const k = el.dataset.key;
            if (me().days[k]) removeDay(k, true); else checkIn(k);
            openDay(k);
        },
        tag: el => toggleTag(el.dataset.key, el.dataset.w),
        day: el => openDay(el.dataset.key),
        'cal-nav': el => {
            const d = new Date(state.cal);
            d.setMonth(d.getMonth() + Number(el.dataset.d));
            if (d <= today()) { state.cal = d; render(); }
        },
        nudge: () => {
            const m = me(), b = buddy(), s = stats(m);
            if (!b) return;
            shareText(m.days[todayKey()]
                ? `Already hit the gym today 💪 (${s.week}/${m.weeklyGoal} this week). Your turn, ${b.name}!`
                : `Gym today, ${b.name}? Let's both check in 💪`);
        },
        invite: () => shareText('Join me on Gym Buddies. Let\'s keep each other consistent 💪 Create your account here:'),
        install: async () => {
            const e = state.installEvt;
            if (!e) { installHelp(); return; }
            closeSheet();
            e.prompt();
            await e.userChoice;
            state.installEvt = null;
            render();
        },
        'install-help': installHelp,
        'hide-install': () => { ls.set(K.installHide, true); render(); },
        'trophy-for': el => { state.trophyFor = el.dataset.v; render(); },
        plan: () => openPlan(),
        'plan-cancel': () => {
            const curWk = keyOf(startOfWeek(today()));
            closeSheet();
            mutateMe(x => { x.goalHistory = x.goalHistory.filter(e => e.from <= curWk); x.profileAt = new Date().toISOString(); });
            toast('Pending plan change cancelled. No penalty.');
        },
        'score-help': () => openScoreHelp(),
        'edit-profile': () => {
            const m = me();
            openSheet(`<h2 class="sheet-title">Edit profile</h2>
                <form id="profile-form" autocomplete="off" novalidate>
                    <label class="field"><span>Name</span><input name="name" maxlength="20" value="${esc(m.name)}" required></label>
                    <div class="field"><span>Avatar</span>${emojiPicker(m.emoji)}</div>
                    <div class="field"><span>Color</span>${colorPicker(m.color)}</div>
                    <p class="form-err"></p>
                    <button class="btn btn-primary" type="submit">Save</button>
                </form>`);
        },
        'change-pin': () => openSheet(`<h2 class="sheet-title">Change PIN</h2>
            <form id="pin-form" autocomplete="off" novalidate>
                <label class="field"><span>Current PIN</span><input name="cur" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" required></label>
                <div class="field-row">
                    <label class="field"><span>New PIN</span><input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password" required></label>
                    <label class="field"><span>Confirm</span><input name="pin2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password" required></label>
                </div>
                <p class="form-err"></p>
                <button class="btn btn-primary" type="submit">Update PIN</button>
            </form>`, { focus: true }),
        token: () => askToken(true),
        'clear-token': () => { ls.del(K.token); closeSheet(); toast('Sync key removed from this phone'); render(); },
        'sync-now': async () => {
            if (!LOCAL && state.pending && !ls.get(K.token)) { askToken(true); return; }
            state.etag = null;
            await sync({ quiet: false });
            if (!state.syncError) toast(state.pending ? 'Syncing your changes…' : 'All synced ✓');
        },
        export: () => {
            const data = Object.assign({}, me());
            delete data.pinHash;
            delete data.pinSalt;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            a.download = `gym-buddies-${slug(data.name)}-${todayKey()}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        },
        logout: () => {
            if (!state.pending) { doLogout(); return; }
            openSheet(`<h2 class="sheet-title">Unsynced check-ins</h2><p class="muted">Some of your sessions haven't reached the cloud yet. If you log out now they'll be lost.</p>
                <button class="btn btn-primary" data-action="sync-now">Try to sync</button>
                <button class="btn btn-danger" data-action="force-logout">Log out anyway</button>`);
        },
        'force-logout': doLogout,
        'delete-account': () => {
            const m = me();
            openSheet(`<h2 class="sheet-title">Delete your account?</h2>
                <p class="muted">This permanently removes ${esc(m.name)} and all ${Object.keys(m.days).length} logged sessions for everyone. It can't be undone.</p>
                <button class="btn btn-danger" data-action="confirm-delete">Delete forever</button>
                <button class="btn btn-ghost" data-action="close-sheet">Cancel</button>`);
        },
        'confirm-delete': async el => {
            if (!LOCAL && !ls.get(K.token)) { askToken(true); return; }
            el.disabled = true;
            const id = state.meId;
            try {
                await Store.remove(id);
                await PhotoDB.removeMember(id).catch(() => { /* photos are optional */ });
                delete state.members[id];
                ls.set(K.cache, state.members);
                doLogout();
                toast('Account deleted');
            } catch (e) {
                el.disabled = false;
                if (e.code === 'NO_TOKEN') askToken(true); else toast(e.message);
            }
        },
        'close-sheet': closeSheet,
        'log-steps': el => openSteps(el.dataset.key),
        'steps-add': el => {
            const inp = el.closest('form').elements.steps;
            const n = Number(el.dataset.n);
            inp.value = n ? clamp((parseInt(inp.value, 10) || 0) + n, 0, MAX_STEPS) : '';
            haptic(8);
        },
        photos: openGallery,
        'photo-view': el => openPhoto(el.dataset.id),
        'photo-compare': el => openCompare(el.dataset.id),
        'photo-share': el => sharePhoto(el.dataset.id),
        'photo-delete': el => {
            const p = findPhoto(el.dataset.id);
            if (!p) return;
            openSheet(`<h2 class="sheet-title">Delete this photo?</h2><p class="muted">Photo from ${fmtLong(p.date)}. This can't be undone.</p>
                <button class="btn btn-danger" data-action="photo-delete-confirm" data-id="${esc(p.id)}">Delete forever</button>
                <button class="btn btn-ghost" data-action="photo-view" data-id="${esc(p.id)}">Cancel</button>`, { kind: 'photo' });
        },
        'photo-delete-confirm': async el => {
            el.disabled = true;
            try {
                await PhotoDB.remove(el.dataset.id);
                await loadPhotos();
                render();
                if (state.photos.length) openGallery(); else closeSheet();
                toast('Photo deleted');
            } catch (e) {
                el.disabled = false;
                toast(e.message || 'Could not delete photo');
            }
        },
        'pick-profile': el => { state.auth = { step: 'pin', id: el.dataset.id, pin: '' }; renderAuth(); },
        'go-register': () => { state.auth = { step: 'register' }; renderAuth(); window.scrollTo(0, 0); },
        'auth-back': () => { state.auth = { step: 'pick' }; renderAuth(); },
        'pin-key': el => pinKey(el.dataset.k),
        pick: el => {
            const f = el.closest('form');
            f.elements[el.dataset.field].value = el.dataset.v;
            f.querySelectorAll(`[data-field="${el.dataset.field}"]`).forEach(x => x.classList.toggle('sel', x === el));
            haptic(8);
        },
        step: el => {
            const f = el.closest('form');
            const inp = f.elements[el.dataset.field];
            const v = clamp(Number(inp.value) + Number(el.dataset.d), 1, 7);
            inp.value = v;
            f.querySelector(`[data-out="${el.dataset.field}"]`).textContent = v;
            if (f.id === 'plan-form') updatePlanPreview(f);
            haptic(8);
        }
    };

    const forms = {
        'register-form': async f => {
            const name = cleanName(f.elements.name.value);
            const pin = f.elements.pin.value, pin2 = f.elements.pin2.value;
            if (!name) return formError(f, 'Enter your name');
            if (nameTaken(name)) return formError(f, `${name} already has an account. Pick it from the list.`);
            if (!/^\d{4}$/.test(pin)) return formError(f, 'PIN must be exactly 4 digits');
            if (pin !== pin2) return formError(f, "PINs don't match");
            const now = new Date().toISOString(), salt = randHex(16);
            const m = cleanMember({
                id: `${slug(name)}-${randHex(3)}`, name, emoji: f.elements.emoji.value, color: f.elements.color.value,
                weeklyGoal: Number(f.elements.goal.value), pinSalt: salt, pinHash: await hashPin(pin, salt),
                createdAt: now, updatedAt: now, profileAt: now, days: {}
            });
            state.members[m.id] = m;
            login(m.id);
            state.rev++;
            state.pending = true;
            ls.set(K.pending, true);
            ls.set(K.cache, state.members);
            render();
            celebrate(true);
            toast(`Welcome, ${name}! 🎉`);
            flush();
        },
        'profile-form': f => {
            const name = cleanName(f.elements.name.value);
            if (!name) return formError(f, 'Enter a name');
            if (nameTaken(name, state.meId)) return formError(f, 'Someone already uses that name');
            const emoji = EMOJIS.includes(f.elements.emoji.value) ? f.elements.emoji.value : me().emoji;
            const color = COLORS.includes(f.elements.color.value) ? f.elements.color.value : me().color;
            closeSheet();
            mutateMe(m => { m.name = name; m.emoji = emoji; m.color = color; m.profileAt = new Date().toISOString(); });
            toast('Profile updated');
        },
        'pin-form': async f => {
            const m = me();
            const cur = f.elements.cur.value, pin = f.elements.pin.value, pin2 = f.elements.pin2.value;
            if (m.pinHash && (await hashPin(cur, m.pinSalt)) !== m.pinHash) return formError(f, 'Current PIN is wrong');
            if (!/^\d{4}$/.test(pin)) return formError(f, 'New PIN must be exactly 4 digits');
            if (pin !== pin2) return formError(f, "New PINs don't match");
            const salt = randHex(16), hash = await hashPin(pin, salt);
            closeSheet();
            mutateMe(x => { x.pinSalt = salt; x.pinHash = hash; x.profileAt = new Date().toISOString(); });
            toast('PIN updated 🔒');
        },
        'plan-form': f => {
            const m = me();
            const g = clamp(parseInt(f.elements.goal.value, 10) || m.weeklyGoal, 1, 7);
            const imp = planImpact(m, g);
            const curWk = keyOf(startOfWeek(today()));
            const hadPending = m.goalHistory.some(e => e.from > curWk);
            if (imp.same && !hadPending) { closeSheet(); return; }
            closeSheet();
            mutateMe(x => {
                x.goalHistory = x.goalHistory.filter(e => e.from <= curWk);
                if (imp.free && !imp.same) {
                    x.goalHistory = x.goalHistory.filter(e => e.from !== curWk);
                    x.goalHistory.push({ from: curWk, goal: g, at: new Date().toISOString(), w: 0 });
                } else if (!imp.same) {
                    x.goalHistory.push({ from: imp.from, goal: g, at: new Date().toISOString(), w: imp.w });
                }
                x.goalHistory.sort((a, b) => a.from.localeCompare(b.from));
                if (x.goalHistory[0].from > keyOf(startOfWeek(new Date(x.createdAt)))) x.goalHistory[0].from = keyOf(startOfWeek(new Date(x.createdAt)));
                x.weeklyGoal = goalFor(x, curWk);
                x.profileAt = new Date().toISOString();
            });
            toast(imp.same ? 'Plan kept. Pending change cancelled.' : imp.free ? `Plan set to ${g}/week ✨` : `Plan changes to ${g}/week on ${fmtShort(imp.from)}`);
        },
        'steps-form': f => {
            const k = f.elements.date.value;
            const raw = String(f.elements.steps.value).trim();
            if (!DATE_RE.test(k) || k > todayKey() || k < MIN_DATE) return formError(f, 'Pick a date up to today');
            if (raw === '') return formError(f, 'Enter your step count (0 to remove)');
            const n = Number(raw);
            if (!Number.isInteger(n) || n < 0 || n > MAX_STEPS) return formError(f, `Enter a whole number from 0 to ${fmtN(MAX_STEPS)}`);
            const before = earnedSet(me());
            const had = (me().steps || {})[k];
            closeSheet();
            mutateMe(x => {
                x.steps = x.steps || {};
                setStepsEntry(x, k, n);
            });
            haptic(15);
            if (n && announceBadges(before)) return;
            toast(n ? `👟 ${fmtN(n)} steps saved for ${k === todayKey() ? 'today' : fmtShort(k)}` : 'Steps removed', had && n !== had ? {
                action: 'Undo', fn: () => mutateMe(x => setStepsEntry(x, k, had))
            } : undefined);
        },
        'token-form': f => {
            const t = f.elements.token.value.trim();
            if (!/^[A-Za-z0-9_]{20,255}$/.test(t)) return formError(f, "That doesn't look like a GitHub token");
            ls.set(K.token, t);
            closeSheet();
            toast('Sync key saved on this phone 🔑');
            state.etag = null;
            scheduleSync();
            flush();
            sync();
        }
    };

    document.addEventListener('click', e => {
        const el = e.target.closest('[data-action]');
        if (!el || el.disabled) return;
        const fn = actions[el.dataset.action];
        if (fn) { e.preventDefault(); fn(el, e); }
    });

    document.addEventListener('submit', e => {
        const fn = forms[e.target.id];
        if (fn) { e.preventDefault(); fn(e.target); }
    });

    document.addEventListener('change', e => {
        if (e.target.id === 'photo-input') {
            const file = e.target.files && e.target.files[0];
            // Reset so picking the same photo again still fires a change.
            e.target.value = '';
            addPhoto(file);
            return;
        }
        if (e.target.name === 'date' && e.target.form && e.target.form.id === 'steps-form') {
            const k = e.target.value, m = me();
            if (m && DATE_RE.test(k)) e.target.form.elements.steps.value = (m.steps || {})[k] || '';
            return;
        }
        if (e.target.matches('[data-change="buddy"]')) {
            state.buddyId = e.target.value;
            ls.set(K.buddy, state.buddyId);
            render();
        }
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('label[for="photo-input"]')) {
            e.preventDefault();
            $('#photo-input').click();
        }
        if (!me() && state.auth.step === 'pin') {
            if (/^\d$/.test(e.key)) pinKey(e.key);
            else if (e.key === 'Backspace') pinKey('del');
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') { render(); sync(); }
    });
    window.addEventListener('online', () => { flush(); sync(); });
    window.addEventListener('offline', setSyncBadge);
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); state.installEvt = e; if (me()) render(); });
    window.addEventListener('appinstalled', () => { state.installEvt = null; toast('Installed! Open it from your home screen 📲'); });

    // ---------- boot ----------
    function seedDemo() {
        const mk = (name, emoji, color, prob) => {
            const days = {};
            for (let i = 1; i < 140; i++) {
                const d = addDays(today(), -i);
                if (Math.random() < prob) {
                    const t = new Date(d);
                    t.setHours(6 + Math.floor(Math.random() * 14));
                    days[keyOf(d)] = { t: t.toISOString(), w: [WORKOUTS[Math.floor(Math.random() * WORKOUTS.length)][0]] };
                }
            }
            const steps = {};
            for (let i = 0; i < 60; i++) if (Math.random() < 0.8) steps[keyOf(addDays(today(), -i))] = 3000 + Math.floor(Math.random() * 11000);
            return { id: `${slug(name)}-demo`, name, emoji, color, weeklyGoal: 4, pinSalt: '', pinHash: '', createdAt: addDays(today(), -140).toISOString(), updatedAt: new Date().toISOString(), days, steps };
        };
        const a = mk('Gokul', '🦁', COLORS[0], 0.62), b = mk('Nithin', '🐺', COLORS[1], 0.52);
        const created = keyOf(startOfWeek(new Date(b.createdAt)));
        b.goalHistory = [
            { from: created, goal: 5, at: b.createdAt, w: 0 },
            { from: keyOf(addDays(startOfWeek(today()), -14)), goal: 3, at: addDays(today(), -18).toISOString(), w: 1 }
        ];
        ls.set(K.db, { members: { [a.id]: a, [b.id]: b } });
    }

    async function boot() {
        if (LOCAL && qs.has('demo') && !ls.get(K.db)) seedDemo();
        const cached = ls.get(K.cache);
        if (cached && typeof cached === 'object') {
            for (const raw of Object.values(cached)) {
                const m = cleanMember(raw);
                if (m) state.members[m.id] = m;
            }
            state.loaded = Object.keys(state.members).length > 0;
        }
        render();
        if (state.meId) loadPhotos().then(render);
        await sync();
        scheduleSync();
        if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
            navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
        }
    }

    boot();
})();

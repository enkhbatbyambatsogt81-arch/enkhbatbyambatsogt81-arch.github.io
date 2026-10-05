/* Portfolio site: profile, CV, university courses and their files, on Supabase.
   Everyone reads the profile, CV and course list. Visitors sign in with Google; the owner grants a person
   (by that Google e-mail) the files of chosen courses. Access is enforced by the rules in supabase/schema.sql;
   this script only decides what to show. */
(function(){
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const CFG = window.SITE_CONFIG || {};
const CONFIGURED = /^https:\/\/.+/.test(CFG.supabaseUrl || '') && CFG.supabaseAnonKey && !/YOUR_/.test(CFG.supabaseAnonKey);
const sb = CONFIGURED && window.supabase ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey) : null;
const BUCKET = 'course-files', PUBLIC_BUCKET = 'site-public';

const KINDS = [
  {k:'edu', t:'Боловсрол'},
  {k:'work', t:'Ажлын туршлага'},
  {k:'project', t:'Төсөл'},
  {k:'skill', t:'Ур чадвар'},
  {k:'award', t:'Шагнал, амжилт'},
];
const S = {
  ready:false, fatal:'', owner:false, preview:false, user:null, email:'',
  profile:{}, cv:[], courses:[], files:[], people:[], previewAs:'',
  tab:'about', course:null, confirmFile:null, confirmPerson:null, confirmDir:null,
  uploading:'', uploadTarget:null, open:new Set(), tagFilter:'', bulkReport:null
};
try { const t = localStorage.getItem('pf-tab'); if (t) S.tab = t; } catch {}
if (location.hash === '#courses') S.tab = 'courses';

const isAdmin = () => S.owner && !S.preview;
const me = () => {
  const m = (S.user && S.user.user_metadata) || {};
  return {name: m.full_name || m.name || '', avatar: m.avatar_url || m.picture || '', email: S.email};
};
/* the course ids whose files this viewer may open; null = all (the owner editing) */
function openCourses(){
  if (isAdmin()) return null;
  const key = S.owner ? S.previewAs : S.email;
  const p = S.people.find(x => x.email === key);
  return new Set(p ? p.courses : []);
}
const grantFor = id => { const s = openCourses(); return !s || s.has(id); };
const cvAll = () => isAdmin() ? S.cv : S.cv.filter(x => !x.hidden);
function coursesAll(){
  if (isAdmin()) return S.courses;
  const open = openCourses();
  return S.courses.filter(c => !c.hidden || open.has(c.id));
}
function courseFiles(id){ return grantFor(id) ? S.files.filter(f => f.courseId === id) : []; }

/* ---------- data ---------- */
const mapCourse = r => ({id:r.id, code:r.code || '', name:r.name || '', semester:r.semester || '', credits:r.credits, kind:r.kind || '',
  teacher:r.teacher || '', desc:r.descr || '', current:!!r.is_current, hidden:!!r.hidden});
const mapCv = r => ({id:r.id, kind:r.kind, title:r.title || '', org:r.org || '', period:r.period || '', desc:r.descr || '', hidden:!!r.hidden});
const mapFile = r => ({id:r.id, courseId:r.course_id, name:r.name, size:r.size, type:r.mime, path:r.storage_path, tag:r.tag || '', at:r.created_at});
const mapPerson = r => ({id:r.email, email:r.email, label:r.label || '', courses:r.courses || []});
const mapProfile = r => r ? {name:r.name, headline:r.headline, bio:r.bio, location:r.location, email:r.email, phone:r.phone,
  links:Array.isArray(r.links) ? r.links : [], photoPath:r.photo_path, cvPath:r.cv_path} : {};
async function run(p){ const {data, error} = await p; if (error) throw error; return data; }
async function pageAll(table){
  const out = [];
  for (let from = 0; ; from += 1000){
    const rows = await run(sb.from(table).select('*').range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
const LOADERS = {
  profile: async () => { S.profile = mapProfile(await run(sb.from('profile').select('*').eq('id', 1).maybeSingle())); },
  cv: async () => { S.cv = (await pageAll('cv_items')).map(mapCv); },
  courses: async () => { S.courses = (await pageAll('courses')).map(mapCourse); },
  files: async () => { S.files = S.email ? (await pageAll('files')).map(mapFile) : []; },
  people: async () => { S.people = S.email ? (await pageAll('people')).map(mapPerson) : []; },
};
async function reload(...names){
  await Promise.all((names.length ? names : Object.keys(LOADERS)).map(n => LOADERS[n]()));
  render();
}
async function loadSession(){
  const {data} = await sb.auth.getSession();
  S.user = data.session ? data.session.user : null;
  S.email = S.user ? String(S.user.email || '').toLowerCase() : '';
  S.owner = S.email ? !!(await run(sb.rpc('is_owner'))) : false;
}
const publicUrl = path => path ? sb.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl : '';

/* ---------- rendering ---------- */
let rq = 0;
function render(){ if (rq) return; rq = requestAnimationFrame(() => { rq = 0; draw(); }); }
function draw(){
  $('#ownerbar').outerHTML = barHTML();
  $('#aside').innerHTML = S.ready ? asideHTML() : '';
  $('#main').innerHTML = mainHTML();
  document.title = S.profile.name ? `${S.profile.name} · CV ба хичээлүүд` : 'CV ба хичээлүүд';
}
const GOOGLE_SVG = '<svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
function avatarHTML(src, name, cls = 'av'){
  return src ? `<img class="${cls}" src="${esc(src)}" alt="" referrerpolicy="no-referrer">` : `<span class="${cls}" aria-hidden="true">${esc(initials(name))}</span>`;
}
function barHTML(){
  if (!sb || !S.ready) return '<div id="ownerbar" class="ownerbar quiet"></div>';
  const m = me();
  const who = S.user ? `<span class="who">${avatarHTML(m.avatar, m.name || m.email)}<span>${esc(m.name || m.email)}${m.name ? ` <small>${esc(m.email)}</small>` : ''}</span></span>
    <button class="btn small ghost" data-act="sign-out">Гарах</button>` : '';
  if (S.owner){
    const people = [...S.people].sort((a, b) => ncmp(a.label || a.email, b.label || b.email));
    if (S.previewAs && !people.some(p => p.email === S.previewAs)) S.previewAs = '';
    return S.preview
      ? `<div id="ownerbar" class="ownerbar pv"><span class="tag hid">Зочны харагдац</span>
          <label for="pv-as">Хэний нүдээр:</label>
          <select id="pv-as" style="width:auto;padding:4px 8px"><option value="">Эрхгүй зочин</option>${people.map(p =>
            `<option value="${esc(p.email)}"${p.email === S.previewAs ? ' selected' : ''}>${esc(p.label || p.email)}</option>`).join('')}</select>
          <span class="sp"></span><button class="btn small" data-act="preview">Засах горим руу буцах</button></div>`
      : `<div id="ownerbar" class="ownerbar"><span class="tag ok">Эзэн</span><span>Та засах эрхтэй. Бусад хүмүүс зөвхөн нээлттэй мэдээллийг харна.</span>
          <span class="sp"></span><button class="btn small" data-act="preview">Зочны харагдацаар үзэх</button>${who}</div>`;
  }
  return `<div id="ownerbar" class="ownerbar quiet"><span class="sp"></span>${S.user ? who
    : `<button class="btn small gbtn" data-act="sign-in">${GOOGLE_SVG}Google-ээр нэвтрэх</button>`}</div>`;
}

function asideHTML(){
  const p = S.profile;
  const photo = p.photoPath
    ? `<img class="photo" src="${esc(publicUrl(p.photoPath))}" alt="${esc(p.name || 'Профайл зураг')}">`
    : `<div class="photo" aria-hidden="true">${esc(initials(p.name))}</div>`;
  const name = p.name || (isAdmin() ? 'Таны нэр' : '');
  const rows = [];
  if (p.location) rows.push(`<div class="contact"><span class="lbl">Байршил</span><span class="val">${esc(p.location)}</span><span></span></div>`);
  if (p.email) rows.push(`<div class="contact"><span class="lbl">И-мэйл</span><span class="val sel">${esc(p.email)}</span><button class="btn small ghost" data-act="copy" data-text="${esc(p.email)}">Хуулах</button></div>`);
  if (p.phone) rows.push(`<div class="contact"><span class="lbl">Утас</span><span class="val sel">${esc(p.phone)}</span><button class="btn small ghost" data-act="copy" data-text="${esc(p.phone)}">Хуулах</button></div>`);
  const links = (p.links || []).filter(l => /^https?:\/\//i.test(l.url));
  if (links.length) rows.push(`<div class="links">${links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}</div>`);
  const actions = [];
  if (p.cvPath) actions.push(`<a class="btn" href="${esc(publicUrl(p.cvPath))}" target="_blank" rel="noopener">CV нээх (PDF)</a>`);
  if (isAdmin()) actions.push(`<button class="btn primary" data-act="edit-profile">Мэдээлэл засах</button>`);
  let card = '';
  if (!S.owner && S.user){
    const m = me(), n = coursesAll().filter(c => grantFor(c.id)).length;
    card = `<div class="codecard">
      <div class="titleline">${avatarHTML(m.avatar, m.name || m.email)}<h3>${esc(m.name || 'Зочин')}</h3><span class="tag">Зочин</span></div>
      <p>${n ? `Танд ${n} хичээлийн файл нээлттэй.` : 'Хичээлийн файл үзэх эрх авахын тулд и-мэйлээ эзэнд илгээнэ үү.'}</p>
      <div><button class="btn small" data-act="tab" data-tab="me">Миний профайл</button></div></div>`;
  } else if (!S.user){
    card = `<div class="codecard"><h3>Хичээлийн файл үзэх үү?</h3>
      <p>Google бүртгэлээрээ нэвтэрч, и-мэйлээ хуудасны эзэнд илгээвэл эрх авах боломжтой.</p>
      <div><button class="btn small gbtn" data-act="sign-in">${GOOGLE_SVG}Google-ээр нэвтрэх</button></div></div>`;
  }
  return `<div>${photo}</div>
    <div><h1 class="name">${esc(name) || '&nbsp;'}</h1>${p.headline ? `<p class="headline">${esc(p.headline)}</p>` : ''}</div>
    ${rows.length ? `<div class="contacts">${rows.join('')}</div>` : ''}
    ${actions.length ? `<div class="idactions">${actions.join('')}</div>` : ''}
    ${card}`;
}

function mainHTML(){
  if (!sb) return setupHTML();
  if (S.fatal) return `<div class="empty"><p>${esc(S.fatal)}</p></div>`;
  if (!S.ready) return `<div class="loading">Ачаалж байна…</div>`;
  const tabs = [['about', 'Танилцуулга'], ['courses', 'Хичээлүүд']];
  if (isAdmin()) tabs.push(['access', 'Хандах эрх']);
  else if (S.user || S.preview) tabs.push(['me', 'Миний профайл']);
  if (!tabs.some(t => t[0] === S.tab)) S.tab = 'about';
  const nav = `<nav class="tabs" role="tablist">${tabs.map(([k, t]) =>
    `<button role="tab" aria-selected="${S.tab === k}" data-act="tab" data-tab="${k}">${t}${k === 'courses' ? `<span class="count">${coursesAll().length}</span>`
      : k === 'access' ? `<span class="count">${S.people.length}</span>` : ''}</button>`).join('')}</nav>`;
  const body = S.tab === 'courses' ? (S.course ? detailHTML() : coursesHTML()) : S.tab === 'access' ? accessHTML() : S.tab === 'me' ? profileHTML() : aboutHTML();
  return nav + body;
}
function setupHTML(){
  return `<div class="empty"><p><b>Сайт тохируулагдаагүй байна.</b></p>
    <p>config.js файлд Supabase төслийн URL болон anon түлхүүрийг оруулна уу (README.md-д алхмуудыг бичсэн).</p></div>`;
}

function aboutHTML(){
  const p = S.profile, items = cvAll(), out = [];
  if (p.bio) out.push(`<section class="bio"><h2 class="sec" style="margin-bottom:12px">Миний тухай</h2>${String(p.bio).split(/\n\s*\n/).map(t => `<p>${esc(t.trim())}</p>`).join('')}</section>`);
  else if (isAdmin()) out.push(`<div class="empty"><p>Танилцуулга хоосон байна. Зүүн талын «Мэдээлэл засах» товчоор нэр, товч танилцуулга, холбоо барих мэдээлэл, зураг болон CV файлаа оруулна уу.</p></div>`);
  for (const {k, t} of KINDS){
    const list = items.filter(x => x.kind === k).sort((a, b) => String(b.period || '').localeCompare(String(a.period || '')));
    if (!list.length && !isAdmin()) continue;
    const add = isAdmin() ? `<button class="btn small" data-act="add-cv" data-kind="${k}">+ Нэмэх</button>` : '';
    let rows;
    if (!list.length) rows = `<p class="note">Одоогоор хоосон.</p>`;
    else if (k === 'skill') rows = list.map(x => `<div class="skillrow"><div class="titleline"><h3>${esc(x.title)}</h3>${x.hidden ? '<span class="tag hid">Нууц</span>' : ''}</div>
        <div class="chips">${String(x.desc || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean).map(s => `<span class="chip">${esc(s)}</span>`).join('')}</div>
        ${isAdmin() ? `<button class="btn small ghost" data-act="edit-cv" data-id="${esc(x.id)}">Засах</button>` : '<span></span>'}</div>`).join('');
    else rows = list.map(x => `<article class="entry"><div class="period">${esc(x.period)}</div>
        <div><div class="titleline"><h3>${esc(x.title)}</h3>${x.hidden ? '<span class="tag hid">Нууц</span>' : ''}</div>${x.org ? `<div class="org">${esc(x.org)}</div>` : ''}${x.desc ? `<p>${esc(x.desc)}</p>` : ''}</div>
        ${isAdmin() ? `<div><button class="btn small ghost" data-act="edit-cv" data-id="${esc(x.id)}">Засах</button></div>` : '<span></span>'}</article>`).join('');
    out.push(`<section><div class="sechead"><h2 class="sec">${t}</h2>${add}</div>${rows}</section>`);
  }
  if (!out.length) out.push(`<div class="empty"><p>Мэдээлэл хараахан нэмэгдээгүй байна.</p></div>`);
  return `<div class="stack">${out.join('')}</div>`;
}

function coursesHTML(){
  const list = coursesAll();
  const credits = list.reduce((s, c) => s + (Number(c.credits) || 0), 0);
  const head = `<div class="sechead"><div><h2 class="sec">Их сургуульд үзсэн хичээлүүд</h2>
    <p class="muted">${list.length} хичээл${credits ? ` · ${credits} кредит` : ''}</p></div>
    ${isAdmin() ? `<button class="btn primary" data-act="add-course">+ Хичээл нэмэх</button>` : ''}</div>`;
  if (!list.length) return head + `<div class="empty"><p>${isAdmin() ? '«Хичээл нэмэх» товчоор үзсэн хичээлээ нэмнэ үү.' : 'Хичээл хараахан нэмэгдээгүй байна.'}</p></div>`;
  const bulk = isAdmin() ? `<section class="panel dropzone" data-dropzone="bulk" style="margin-bottom:26px">
    <div class="sechead" style="margin:0"><h3>Бүх хичээлийн файлыг нэг дор оруулах</h3><button class="btn small primary" data-act="bulk-pick">Хавтас сонгох</button></div>
    ${uploadingHTML()}
    <p class="note">Хичээл бүрийн хавтсыг агуулсан хавтсаа (жишээ нь «Сайтад оруулах») энд чирж оруулна уу. «ECEN213 Компьютерын сүлжээ» гэх мэт хичээлийн кодоор эхэлсэн хавтас бүр тухайн хичээл рүү доторх бүтэцтэйгээ орно. Байршуулж дуустал энэ хуудсыг бүү хаагаарай.</p></section>` : '';
  const groups = new Map();
  for (const c of list){ const k = (c.semester || '').trim(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
  const keys = [...groups.keys()].sort((a, b) => !a ? 1 : !b ? -1 : b.localeCompare(a));
  return head + bulk + (S.bulkReport && isAdmin() ? `<div style="margin-bottom:26px">${bulkReportHTML()}</div>` : '') + keys.map(k => `<section class="term"><h3 class="termh">${esc(k || 'Улирал заагаагүй')}</h3><div class="rows">${
    groups.get(k).sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''))).map(c => `<button class="crow" data-act="open-course" data-id="${esc(c.id)}">
      <span class="code">${esc(c.code || '—')}</span>
      <span class="cname">${esc(c.name || 'Нэргүй хичээл')}${c.kind || c.teacher ? `<small>${esc([c.kind, c.teacher].filter(Boolean).join(' · '))}</small>` : ''}</span>
      <span class="cred">${c.credits ? esc(c.credits) + ' кр' : ''}</span>
      <span class="badges">${courseBadges(c)}</span></button>`).join('')}</div></section>`).join('');
}
function courseBadges(c){
  const out = [];
  if (c.current) out.push('<span class="tag">Одоо үзэж байна</span>');
  if (c.hidden) out.push('<span class="tag hid">Нууц</span>');
  if (isAdmin()){ const n = S.files.filter(f => f.courseId === c.id).length; if (n) out.push(`<span class="tag">${n} файл</span>`); }
  else if (grantFor(c.id)) out.push('<span class="tag ok">Файл нээлттэй</span>');
  return out.join('');
}

function detailHTML(){
  const c = coursesAll().find(x => x.id === S.course);
  if (!c){ S.course = null; return coursesHTML(); }
  const meta = [c.semester, c.credits ? c.credits + ' кредит' : '', c.kind, c.teacher ? 'Багш: ' + c.teacher : '', c.current ? 'Одоо үзэж байна' : ''].filter(Boolean);
  const head = `<div class="stack" style="gap:24px">
    <div><button class="btn small ghost" data-act="back">← Бүх хичээл</button></div>
    <div class="dhead"><div class="titleline"><span class="code">${esc(c.code || '')}</span>${c.hidden ? '<span class="tag hid">Нууц</span>' : ''}</div>
      <h2 class="dtitle">${esc(c.name || 'Нэргүй хичээл')}</h2>
      ${meta.length ? `<div class="meta">${meta.map(m => `<span>${esc(m)}</span>`).join('')}</div>` : ''}
      ${c.desc ? `<p class="desc">${esc(c.desc)}</p>` : ''}
      ${isAdmin() ? `<div><button class="btn small" data-act="edit-course" data-id="${esc(c.id)}">Хичээл засах</button></div>` : ''}
    </div>`;
  let files;
  const list = courseFiles(c.id);
  const dirs = dirPaths(list);
  const allOpen = dirs.length && dirs.every(p => S.open.has(c.id + ':' + p));
  const tagCount = {};
  for (const f of list){ const t = fileTag(f); if (t) tagCount[t] = (tagCount[t] || 0) + 1; }
  if (S.tagFilter && !tagCount[S.tagFilter]) S.tagFilter = '';
  const tagBar = Object.keys(tagCount).length ? `<div class="tagbar" role="group" aria-label="Төрлөөр шүүх">
    <button class="tagchip" data-act="tag-filter" data-tag="" aria-pressed="${!S.tagFilter}">Бүгд <span class="count">${list.length}</span></button>
    ${Object.entries(TAGS).filter(([k]) => tagCount[k]).map(([k, l]) =>
      `<button class="tagchip t-${k}" data-act="tag-filter" data-tag="${k}" aria-pressed="${S.tagFilter === k}"><i></i>${l} <span class="count">${tagCount[k]}</span></button>`).join('')}</div>` : '';
  const tools = `${tagBar}${dirs.length && !S.tagFilter ? `<button class="btn small ghost" data-act="dir-all" data-course="${esc(c.id)}">${allOpen ? 'Бүх хавтсыг хаах' : 'Бүх хавтсыг нээх'}</button>` : ''}${
    list.length ? `<button class="btn small" data-act="dl-dir" data-course="${esc(c.id)}" data-path="">Бүгдийг татах (zip)</button>` : ''}`;
  if (isAdmin()){
    const who = S.people.filter(p => p.courses.includes(c.id));
    files = `<section class="panel dropzone" data-dropzone="1"><div class="sechead" style="margin:0"><h3>Хичээлийн файлууд <span class="count">${list.length}</span></h3>
        <div class="ftools">
          <button class="btn small primary" data-act="upload-folder" data-folder="">Хавтас оруулах</button>
          <button class="btn small" data-act="upload-files" data-folder="">Файл нэмэх</button>
          <button class="btn small" data-act="new-folder">Шинэ хавтас</button></div></div>
      ${uploadingHTML()}
      ${tools ? `<div class="ftools">${tools}</div>` : ''}
      ${list.length ? `<div class="flist">${treeHTML(buildTree(list), c.id, true, 0)}</div>` : ''}
      <div class="dropnote">Компьютер дээрх хавтас эсвэл файлаа энд чирч оруулна. Хавтасны мөр дээр буулгавал тэр хавтас руу орно.</div>
      <p class="note">Хавтсаар нь оруулахад доторх бүтэц нь хэвээр үлдэнэ. Ямар ч төрлийн файл (PDF, код, Packet Tracer, Word, PowerPoint, zip…) нэг бүр нь 50 MB хүртэл орно. «.git», «.github» мэт далд хавтас болон .exe, .msi, .o файлыг алгасна. Ижил замтай файл оруулбал хуучныг нь шинээр солино.</p>
      <p class="note">Үзэх эрхтэй: ${who.length ? who.map(p => esc(p.label || p.email)).join(', ') : 'хэн ч алга'} · <button class="btn small ghost" data-act="tab" data-tab="access">Эрх тохируулах</button></p>
      </section>`;
  } else if (grantFor(c.id)){
    files = `<section class="panel"><h3>Хичээлийн файлууд <span class="count">${list.length}</span></h3>
      ${tools ? `<div class="ftools">${tools}</div>` : ''}
      ${list.length ? `<div class="flist">${treeHTML(buildTree(list), c.id, false, 0)}</div>` : '<p class="note">Энэ хичээлд файл хараахан ороогүй байна.</p>'}</section>`;
  } else {
    files = `<section class="panel lock"><h3>Файлууд хаалттай</h3>
      <p class="note" style="color:var(--ink)">Энэ хичээлийн файлуудыг зөвхөн эзний зөвшөөрсөн хүмүүс үзнэ.${S.user
        ? ` Эрх хүсвэл өөрийн и-мэйл хаягаа (<b>${esc(S.email)}</b>) хуудасны эзэнд илгээнэ үү.`
        : ' Google бүртгэлээрээ нэвтэрч, и-мэйлээ эзэнд илгээвэл эрх авах боломжтой.'}</p>
      ${S.user ? '' : `<div><button class="btn small gbtn" data-act="sign-in">${GOOGLE_SVG}Google-ээр нэвтрэх</button></div>`}</section>`;
  }
  return head + files + `</div>`;
}

/* folder tree: a file's `name` is its path inside the course, e.g. "lab3/main.c" */
const ncmp = (a, b) => String(a).localeCompare(String(b), undefined, {numeric:true, sensitivity:'base'});
function dirPaths(files){
  const s = new Set();
  for (const f of files){ const p = String(f.name || '').split('/').filter(Boolean); for (let i = 1; i < p.length; i++) s.add(p.slice(0, i).join('/')); }
  return [...s];
}
function buildTree(files){
  const root = {dirs:new Map(), files:[]};
  for (const f of files){
    const parts = String(f.name || 'файл').split('/').filter(Boolean);
    const base = parts.pop() || 'файл';
    let node = root, path = '';
    for (const p of parts){
      path = path ? path + '/' + p : p;
      if (!node.dirs.has(p)) node.dirs.set(p, {name:p, path, dirs:new Map(), files:[]});
      node = node.dirs.get(p);
    }
    node.files.push({...f, base, dir:path});
  }
  return root;
}
/* file kinds: a stored `tag` wins ('none' = deliberately untagged); otherwise the kind is read from the
   file name, then from its folders, nearest first */
const TAGS = {lec:'Лекц', sem:'Семинар', lab:'Лаб', hw:'Бие даалт'};
function detectTag(path){
  for (const seg of String(path || '').toLowerCase().split('/').reverse()){
    if (seg.includes('лаб') || /(^|[^a-z])lab/.test(seg) || seg.includes('laborator')) return 'lab';
    if (seg.includes('семинар') || seg.includes('seminar') || /(^|[^a-z])sem\d/.test(seg)) return 'sem';
    if (seg.includes('лекц') || seg.includes('бүлэг') || /lecture|lect\d|lekts|chapter/.test(seg)) return 'lec';
    if (seg.includes('бие даалт') || seg.includes('даалгавар') || /assignment|homework|home-work|daalgavar|bie daalt|biy daalt/.test(seg)) return 'hw';
  }
  return '';
}
const fileTag = f => f.tag === 'none' ? '' : (TAGS[f.tag] ? f.tag : detectTag(f.name));
const allFiles = n => [...n.files, ...[...n.dirs.values()].flatMap(allFiles)];
function dirTag(d){
  const own = detectTag(d.name); if (own) return own;
  const ts = new Set(allFiles(d).map(fileTag));
  return ts.size === 1 ? [...ts][0] : '';
}
const TAG_OPTS = auto => [['', 'Автомат' + (auto ? ` (${TAGS[auto]})` : '')], ...Object.entries(TAGS), ['none', 'Тэмдэггүй']];
const countFiles = n => n.files.length + [...n.dirs.values()].reduce((s, d) => s + countFiles(d), 0);
const sizeOf = n => n.files.reduce((s, f) => s + (Number(f.size) || 0), 0) + [...n.dirs.values()].reduce((s, d) => s + sizeOf(d), 0);
const FOLDER_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.4c.4 0 .8.16 1.06.44L11.6 7h7.9A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>';
function treeHTML(node, courseId, admin, depth){
  const flt = S.tagFilter;   /* with a kind filter on, every folder holding a match opens */
  let h = '';
  for (const d of [...node.dirs.values()].sort((a, b) => ncmp(a.name, b.name))){
    const n = flt ? allFiles(d).filter(f => fileTag(f) === flt).length : countFiles(d);
    if (flt && !n) continue;
    const key = courseId + ':' + d.path, open = flt ? true : S.open.has(key), t = dirTag(d);
    h += `<div class="dirrow${t ? ' t-' + t : ''}" style="--d:${depth}"${admin ? ` data-drop="${esc(d.path)}"` : ''}>
      <button class="dirbtn" data-act="dir-toggle" data-key="${esc(key)}" aria-expanded="${open}">
        <span class="caret">${open ? '▾' : '▸'}</span><span class="dicon">${FOLDER_SVG}</span>
        <span class="dname">${esc(d.name)}</span>${t ? `<span class="ftag">${TAGS[t]}</span>` : ''}<span class="fmeta">${n} файл · ${fmtSize(sizeOf(d))}</span></button>
      ${admin ? dirActions(d, courseId) : `<div class="factions"><button class="btn small ghost" data-act="dl-dir" data-course="${esc(courseId)}" data-path="${esc(d.path)}">Татах (zip)</button></div>`}</div>`;
    if (open) h += treeHTML(d, courseId, admin, depth + 1);
  }
  for (const f of node.files.sort((a, b) => ncmp(a.base, b.base))) if (!flt || fileTag(f) === flt) h += fileRow(f, admin, depth);
  return h;
}
function dirActions(d, courseId){
  if (S.confirmDir === d.path) return `<div class="factions"><span class="note" style="color:var(--danger)">${countFiles(d)} файл бүр мөсөн устна</span>
    <button class="btn small danger" data-act="dir-del-yes" data-path="${esc(d.path)}">Устгах</button><button class="btn small ghost" data-act="dir-del-no">Болих</button></div>`;
  return `<div class="factions">
    <select class="tagsel" data-folder="${esc(d.path)}" aria-label="Хавтасны бүх файлын төрөл"><option value="" selected disabled>Бүгдийн төрөл…</option>${TAG_OPTS('').map(([v, l]) => `<option value="${v || 'auto'}">${l}</option>`).join('')}</select>
    <button class="btn small ghost" data-act="dl-dir" data-course="${esc(courseId)}" data-path="${esc(d.path)}">Татах (zip)</button>
    <button class="btn small ghost" data-act="upload-files" data-folder="${esc(d.path)}">+ Файл</button>
    <button class="btn small ghost" data-act="dir-rename" data-path="${esc(d.path)}">Нэр солих</button>
    <button class="btn small dghost" data-act="dir-del" data-path="${esc(d.path)}">Устгах</button></div>`;
}
/* files a browser shows by itself; anything else opens as a download */
const VIEWABLE = new Set('pdf png jpg jpeg gif webp svg mp4 webm txt md csv json c h cpp hpp cc py java js ts sql html css xml yml yaml sh dot tex log ipynb'.split(' '));
function fileRow(f, admin, depth = 0){
  const n = f.base || String(f.name || 'файл').split('/').pop();
  const ext = extOf(n), extLabel = ext ? ext.slice(0, 4) : 'file';
  const t = fileTag(f);
  const title = `<button class="linkbtn" data-act="${VIEWABLE.has(ext) ? 'view' : 'dl'}" data-path="${esc(f.path)}" data-name="${esc(n)}">${esc(n)}</button>`;
  let act = `<button class="btn small" data-act="dl" data-path="${esc(f.path)}" data-name="${esc(n)}">Татах</button>`;
  if (admin && S.confirmFile !== f.id){
    act += `<select class="tagsel" data-id="${esc(f.id)}" aria-label="Файлын төрөл">${TAG_OPTS(detectTag(f.name)).map(([v, l]) =>
      `<option value="${v}"${v === (TAGS[f.tag] || f.tag === 'none' ? f.tag : '') ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  }
  if (admin){
    act += S.confirmFile === f.id
      ? `<button class="btn small danger" data-act="file-del-yes" data-id="${esc(f.id)}">Устгах</button><button class="btn small ghost" data-act="file-del-no">Болих</button>`
      : `<button class="btn small ghost" data-act="file-move" data-id="${esc(f.id)}">Зөөх</button><button class="btn small dghost" data-act="file-del" data-id="${esc(f.id)}">Устгах</button>`;
  }
  return `<div class="frow${t ? ' tagged t-' + t : ''}" style="--d:${depth}"${admin ? ` data-drop="${esc(f.dir || '')}"` : ''}><span class="ext">${esc(extLabel)}</span>
    <div style="min-width:0"><div class="titleline">${t ? `<span class="ftag">${TAGS[t]}</span>` : ''}${title}</div>
    <div class="fmeta">${fmtSize(f.size)}${f.at ? ' · ' + esc(String(f.at).slice(0, 10)) : ''}</div></div>
    <div class="factions">${act}</div></div>`;
}

const initials = name => String(name || '').trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '·';
/* a signed-in visitor's own page: who they are (their Google account), what is open to them.
   In the owner's guest preview it shows the person picked in the bar. */
function profileHTML(){
  const pv = S.owner && S.preview;
  const person = pv ? S.people.find(p => p.email === S.previewAs) : null;
  const m = me();
  const name = pv ? (person ? (person.label || person.email) : 'Эрхгүй зочин') : (m.name || 'Зочин');
  const avatar = pv ? '' : m.avatar;
  const email = pv ? (person ? person.email : '') : S.email;
  const courses = coursesAll().filter(c => grantFor(c.id)).sort((a, b) => ncmp(a.code || '', b.code || ''));
  const filesOf = c => S.files.filter(f => f.courseId === c.id);
  const bytes = c => filesOf(c).reduce((s, f) => s + (Number(f.size) || 0), 0);
  const nfiles = courses.reduce((s, c) => s + filesOf(c).length, 0);
  return `<div class="stack" style="gap:28px">
    <section class="panel">
      <div class="profhead">${avatarHTML(avatar, name, 'pavatar')}
        <div style="min-width:0"><h2 class="sec">${esc(name)}</h2>
        ${email ? `<div class="pcode" style="margin-top:4px">${esc(email)}</div>` : ''}
        <div class="titleline" style="margin-top:6px"><span class="tag">Зочин</span>${pv ? '<span class="tag hid">Зочны харагдац</span>' : ''}</div></div></div>
      <div class="pstats">
        <div><b>${courses.length}</b><span>хичээл нээлттэй</span></div>
        <div><b>${nfiles}</b><span>файл</span></div>
        <div><b>${fmtSize(courses.reduce((s, c) => s + bytes(c), 0))}</b><span>нийт хэмжээ</span></div></div>
    </section>
    <section><div class="sechead"><h2 class="sec">Надад нээлттэй хичээлүүд</h2></div>
      ${courses.length ? `<div class="rows">${courses.map(c => `<div class="crow prow">
          <span class="code">${esc(c.code || '')}</span>
          <span class="cname">${esc(c.name || '')}<small>${filesOf(c).length} файл · ${fmtSize(bytes(c))}</small></span>
          <span class="factions"><button class="btn small ghost" data-act="open-course" data-id="${esc(c.id)}">Нээх</button>
          <button class="btn small" data-act="dl-dir" data-course="${esc(c.id)}" data-path="">Бүгдийг татах (zip)</button></span></div>`).join('')}</div>`
        : `<div class="empty"><p>Танд одоогоор аль ч хичээлийн файл нээлттэй биш байна. Доорх и-мэйл хаягаа хуудасны эзэнд илгээвэл эрх авах боломжтой.</p></div>`}
    </section>
    <section class="panel"><h3>Эрх хүсэх</h3>
      <p class="note">Файл үзэх эрхийг таны Google и-мэйл хаягаар өгдөг. Өөр хичээлийн эрх хүсвэл энэ хаягаа хуудасны эзэнд илгээнэ үү.</p>
      ${email ? `<div class="codebox sel">${esc(email)}</div><div><button class="btn small" data-act="copy" data-text="${esc(email)}">Хаяг хуулах</button></div>`
        : '<p class="note">Дээрх «Хэний нүдээр» хэсгээс хүн сонговол түүний хаяг энд харагдана.</p>'}
    </section></div>`;
}

function accessHTML(){
  const courses = coursesAll();
  const name = id => { const c = courses.find(x => x.id === id); return c ? (c.code ? c.code + ' ' : '') + (c.name || '') : null; };
  const people = [...S.people].sort((a, b) => ncmp(a.label || a.email, b.label || b.email));
  return `<div class="stack" style="gap:28px">
    <section><div class="sechead"><h2 class="sec">Хичээлийн файл үзэх эрх</h2><button class="btn primary" data-act="add-person">+ Хүн нэмэх</button></div>
    <ol class="steps">
      <li>Сайтын холбоосыг тухайн хүнд илгээнэ.</li>
      <li>Тэр хүн «Google-ээр нэвтрэх» дарж нэвтрээд, Gmail хаягаа танд хэлнэ.</li>
      <li>Энд «Хүн нэмэх» дарж тэр хаягийг оруулаад, аль хичээлийн файлыг үзэхийг чагтална.</li>
    </ol></section>
    <section>${people.length ? people.map(p => `<div class="person"><div style="min-width:0">
        <div class="titleline"><h3>${esc(p.label || p.email)}</h3>${p.email === S.email ? '<span class="tag hid">Таны өөрийн хаяг</span>' : ''}</div>
        <div class="pcode">${esc(p.email)}</div>
        <div class="chips" style="margin-top:6px">${p.courses.map(name).filter(Boolean).map(t => `<span class="chip">${esc(t)}</span>`).join('') || '<span class="note">Хичээл сонгоогүй</span>'}</div></div>
        <div class="factions">${S.confirmPerson === p.email
          ? `<button class="btn small danger" data-act="person-del-yes" data-id="${esc(p.email)}">Эрхийг хасах</button><button class="btn small ghost" data-act="person-del-no">Болих</button>`
          : `<button class="btn small" data-act="edit-person" data-id="${esc(p.email)}">Засах</button><button class="btn small dghost" data-act="person-del" data-id="${esc(p.email)}">Хасах</button>`}</div></div>`).join('')
      : `<div class="empty"><p>Одоогоор хэнд ч хичээлийн файл үзэх эрх өгөөгүй байна.</p></div>`}</section></div>`;
}

/* ---------- helpers ---------- */
function fmtSize(b){ b = Number(b) || 0; if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(0) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
function toast(msg, kind){
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (kind === 'err' ? ' err' : ''); t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, Math.max(kind === 'err' ? 7000 : 2800, msg.length * 55));
}
function errMsg(e){
  const m = String((e && (e.message || e.error_description || e.error)) || e || '');
  if (/row-level security|permission denied|not authorized|Unauthorized/i.test(m)) return 'Энэ үйлдлийг хийх эрх алга. Эзний бүртгэлээр нэвтэрсэн эсэхээ шалгана уу.';
  if (/Payload too large|exceeded the maximum allowed size|too large/i.test(m)) return 'Файл хэт том байна (50 MB хүртэл).';
  if (/duplicate key|already exists/i.test(m)) return 'Ийм бичлэг аль хэдийн байна.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Сүлжээний алдаа. Интернэт холболтоо шалгаад дахин оролдоно уу.';
  if (/quota|storage limit/i.test(m)) return 'Файлын сангийн багтаамж дүүрсэн байна.';
  return m || 'Алдаа гарлаа.';
}
const extOf = n => { n = String(n).toLowerCase(); return n.includes('.') ? n.split('.').pop() : ''; };
const EXT = {pdf:'application/pdf', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', svg:'image/svg+xml',
  mp4:'video/mp4', webm:'video/webm', csv:'text/csv', md:'text/markdown', json:'application/json', txt:'text/plain', html:'text/html',
  zip:'application/zip', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
const TEXTY = new Set('c h cpp hpp cc cxx cs java py js ts jsx tsx go rs kt swift rb php sql css xml yml yaml sh bat ps1 asm s m r ipynb dot tex log ini cfg conf toml lua pl scala dart vue mk gradle properties'.split(' '));
/* the type stored with a file: code and text show as plain UTF-8 text when opened */
function mimeOf(file){
  const ext = extOf(file.name);
  if (!ext || TEXTY.has(ext)) return 'text/plain; charset=utf-8';
  const t = EXT[ext] || file.type || 'application/octet-stream';
  return t.startsWith('text/') ? t + '; charset=utf-8' : t;
}
const SKIP_EXT = new Set('exe msi dll o obj class pyc lnk tmp iso dmg'.split(' '));
const MAX_BYTES = 50 * 1048576;
async function copyText(text, btn){
  try { await navigator.clipboard.writeText(text); const o = btn.textContent; btn.textContent = 'Хуулсан'; setTimeout(() => { btn.textContent = o; }, 1500); }
  catch {
    const el = btn.parentElement.parentElement.querySelector('.sel') || btn.parentElement.querySelector('.sel');
    if (el){ const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    toast('Текстийг сонголоо. Ctrl+C дарж хуулна уу.');
  }
}
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const storageKey = (courseId, name) => `${courseId}/${newId()}${extOf(name).replace(/[^a-z0-9]/g, '') ? '.' + extOf(name).replace(/[^a-z0-9]/g, '').slice(0, 8) : ''}`;

/* minimal zip writer (stored, UTF-8 names): entries [{name, data:Uint8Array}] -> Blob */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b){ let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipMany(entries){
  const enc = new TextEncoder(), parts = [], central = [];
  const put = (dv, fields) => fields.forEach(([o, v, s]) => s === 4 ? dv.setUint32(o, v, true) : dv.setUint16(o, v, true));
  let offset = 0;
  for (const {name, data} of entries){
    const nm = enc.encode(name), crc = crc32(data), n = data.length;
    const lh = new DataView(new ArrayBuffer(30)), ch = new DataView(new ArrayBuffer(46));
    put(lh, [[0,0x04034b50,4],[4,20,2],[6,0x0800,2],[12,0x21,2],[14,crc,4],[18,n,4],[22,n,4],[26,nm.length,2]]);
    put(ch, [[0,0x02014b50,4],[4,20,2],[6,20,2],[8,0x0800,2],[14,0x21,2],[16,crc,4],[20,n,4],[24,n,4],[28,nm.length,2],[42,offset,4]]);
    parts.push(lh, nm, data); central.push(ch, nm);
    offset += 30 + nm.length + n;
  }
  const cd = central.reduce((s, p) => s + p.byteLength, 0), end = new DataView(new ArrayBuffer(22));
  put(end, [[0,0x06054b50,4],[8,entries.length,2],[10,entries.length,2],[12,cd,4],[16,offset,4]]);
  return new Blob([...parts, ...central, end], {type:'application/zip'});
}
const safeName = s => String(s).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'файл';
function saveBlob(blob, name){
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ---------- opening and saving files ---------- */
async function signedUrl(path, downloadName){
  const {data, error} = await sb.storage.from(BUCKET).createSignedUrl(path, 300, downloadName ? {download:downloadName} : undefined);
  if (error) throw error;
  return data.signedUrl;
}
async function viewFile(d){
  const w = window.open('about:blank', '_blank');   /* opened inside the click, so pop-up blockers allow it */
  try {
    const url = await signedUrl(d.path);
    if (w){ w.opener = null; w.location.href = url; } else location.href = url;
  } catch (e){ if (w) w.close(); toast(errMsg(e), 'err'); }
}
async function downloadOne(d, btn){
  const label = btn.textContent; btn.disabled = true;
  try {
    const a = document.createElement('a');
    a.href = await signedUrl(d.path, d.name); a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e){ toast(errMsg(e), 'err'); }
  finally { btn.disabled = false; btn.textContent = label; }
}
/* a whole folder (path) or course (path '') as one zip, keeping the folder layout */
async function downloadFolder(courseId, path, btn){
  const files = courseFiles(courseId).filter(f => !path || String(f.name).startsWith(path + '/'));
  if (!files.length){ toast('Татах файл алга.', 'err'); return; }
  const c = coursesAll().find(x => x.id === courseId) || {};
  const root = safeName(path ? path.split('/').pop() : `${c.code || ''} ${c.name || ''}`);
  const label = btn.textContent; btn.disabled = true;
  const entries = [], failed = [];
  try {
    const signed = await run(sb.storage.from(BUCKET).createSignedUrls(files.map(f => f.path), 600));
    const urlOf = new Map(signed.filter(s => s.signedUrl).map(s => [s.path, s.signedUrl]));
    for (let i = 0; i < files.length; i++){
      const f = files[i];
      btn.textContent = `Бэлдэж байна ${i + 1}/${files.length}`;
      try {
        const res = await fetch(urlOf.get(f.path));
        if (!res.ok) throw new Error(res.status);
        entries.push({name: root + '/' + (path ? f.name.slice(path.length + 1) : f.name), data: new Uint8Array(await res.arrayBuffer())});
      } catch { failed.push(f.name); }
    }
    if (!entries.length) throw new Error('Файлуудыг уншиж чадсангүй.');
    saveBlob(zipMany(entries), root + '.zip');
    if (failed.length) toast(`${failed.length} файлыг zip-д оруулж чадсангүй: ${failed.slice(0, 5).join(', ')}`, 'err');
  } catch (e){ toast(errMsg(e), 'err'); }
  finally { btn.disabled = false; btn.textContent = label; }
}

/* ---------- modal ---------- */
const M = {};
function openModal({title, body, submitLabel = 'Хадгалах', onSubmit, onDelete, deleteLabel = 'Устгах', deleteWarn = 'Бүр мөсөн устгах уу?'}){
  const f = $('#mform');
  M.foot = `${onDelete ? `<button type="button" class="btn dghost" data-m="del">${deleteLabel}</button>` : ''}<span class="sp"></span>
    <button type="button" class="btn ghost" data-m="close">Болих</button><button type="submit" class="btn primary" id="m-submit">${submitLabel}</button>`;
  f.innerHTML = `<header class="mhead"><h2 id="m-title">${esc(title)}</h2><button type="button" class="x" data-m="close" aria-label="Хаах">×</button></header>
    <div class="mbody">${body}</div><p class="merr" id="m-err" hidden></p><footer class="mfoot" id="m-foot">${M.foot}</footer>`;
  Object.assign(M, {onSubmit, onDelete, deleteWarn, deleteLabel, busy:false});
  $('#modal').hidden = false; document.body.classList.add('locked');
  setTimeout(() => f.querySelector('input:not([type=checkbox]):not([disabled]),textarea,select')?.focus(), 0);
}
function closeModal(){ $('#modal').hidden = true; document.body.classList.remove('locked'); $('#mform').innerHTML = ''; }
function modalError(e){ const el = $('#m-err'); if (!el) return; el.textContent = typeof e === 'string' ? e : errMsg(e); el.hidden = false; }
async function runBusy(fn){
  if (M.busy) return; M.busy = true;
  const btns = [...$('#mform').querySelectorAll('button')]; btns.forEach(b => b.disabled = true);
  const sub = $('#m-submit'); const label = sub && sub.textContent; if (sub) sub.textContent = 'Хадгалж байна…';
  try { await fn(); closeModal(); }
  catch (e){ console.warn(e); modalError(e); btns.forEach(b => b.disabled = false); if (sub) sub.textContent = label; }
  finally { M.busy = false; }
}
$('#mform').addEventListener('submit', e => { e.preventDefault(); const f = e.currentTarget; $('#m-err').hidden = true; runBusy(() => M.onSubmit(new FormData(f), f)); });
$('#modal').addEventListener('click', e => {
  const b = e.target.closest('[data-m]'); if (!b || M.busy) return;
  const m = b.dataset.m, foot = $('#m-foot');
  if (m === 'close') closeModal();
  else if (m === 'del') foot.innerHTML = `<p class="warntext">${esc(M.deleteWarn)}</p><span class="sp"></span><button type="button" class="btn ghost" data-m="del-no">Болих</button><button type="button" class="btn danger" data-m="del-yes">Тийм, ${esc(M.deleteLabel.toLowerCase())}</button>`;
  else if (m === 'del-no') foot.innerHTML = M.foot;
  else if (m === 'del-yes') runBusy(() => M.onDelete());
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden && !M.busy) closeModal(); });

const fText = (id, label, val = '', o = {}) => `<div class="field${o.wide ? ' wide' : ''}"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${o.type || 'text'}" value="${esc(val)}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}${o.dis ? ' disabled' : ''}${o.min != null ? ` min="${o.min}" step="any"` : ''} autocomplete="off">${o.hint ? `<small>${o.hint}</small>` : ''}</div>`;
const fArea = (id, label, val = '', o = {}) => `<div class="field wide"><label for="${id}">${label}</label><textarea id="${id}" name="${id}" rows="${o.rows || 4}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}>${esc(val)}</textarea>${o.hint ? `<small>${o.hint}</small>` : ''}</div>`;
const fCheck = (id, label, on, hint) => `<div class="field wide"><label class="checkl"><input type="checkbox" id="${id}" name="${id}"${on ? ' checked' : ''}><span>${label}${hint ? `<br><small>${hint}</small>` : ''}</span></label></div>`;
const fFile = (id, label, accept, rmId, rmLabel) => `<div class="field"><label for="${id}">${label}</label><input type="file" id="${id}" name="${id}" accept="${accept}">${rmId ? `<label class="checkl"><input type="checkbox" id="${rmId}" name="${rmId}"><span><small>${rmLabel}</small></span></label>` : ''}</div>`;
const str = (fd, k) => String(fd.get(k) ?? '').trim();

/* ---------- editors ---------- */
async function putPublic(file, prefix){
  const ext = extOf(file.name).replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `profile/${prefix}-${Date.now()}.${ext}`;
  await run(sb.storage.from(PUBLIC_BUCKET).upload(path, file, {contentType: EXT[ext] || file.type || 'application/octet-stream'}));
  return path;
}
function openProfile(){
  const p = S.profile;
  const links = (p.links || []).map(l => `${l.label} | ${l.url}`).join('\n');
  openModal({title:'Хувийн мэдээлэл', body:`<div class="grid2">
    ${fText('f-name', 'Овог нэр', p.name, {ph:'Жишээ: Э. Бямбацогт'})}
    ${fText('f-headline', 'Товч тодорхойлолт', p.headline, {ph:'МУИС, Програм хангамж, 2-р курс'})}
    ${fArea('f-bio', 'Миний тухай', p.bio, {rows:5, ph:'Хэдэн өгүүлбэрээр өөрийгөө танилцуулна уу. Хоосон мөрөөр догол мөр тусгаарлана.'})}
    ${fText('f-location', 'Байршил', p.location, {ph:'Улаанбаатар'})}
    ${fText('f-email', 'И-мэйл', p.email, {type:'email'})}
    ${fText('f-phone', 'Утас', p.phone, {type:'tel'})}
    <span></span>
    ${fArea('f-links', 'Холбоосууд', links, {rows:3, ph:'GitHub | https://github.com/...', hint:'Мөр бүрт нэг холбоос: Нэр | https://хаяг'})}
    ${fFile('f-photo', 'Профайл зураг', 'image/png,image/jpeg,image/webp,image/gif', p.photoPath ? 'f-photo-rm' : null, 'Одоогийн зургийг хасах')}
    ${fFile('f-cvfile', 'CV файл (PDF)', 'application/pdf,.pdf', p.cvPath ? 'f-cv-rm' : null, 'Одоогийн CV файлыг хасах')}
  </div>`, onSubmit: async fd => {
    const name = str(fd, 'f-name'); if (!name) throw 'Нэрээ оруулна уу.';
    const links = [];
    for (const line of str(fd, 'f-links').split('\n')){
      const t = line.trim(); if (!t) continue;
      const [a, b] = t.includes('|') ? t.split('|').map(s => s.trim()) : [t, t];
      if (!/^https?:\/\/\S+$/i.test(b)) throw `«${t}» холбоос буруу байна. Хаяг нь https://-ээр эхлэх ёстой.`;
      links.push({label: a || b, url: b});
    }
    const row = {name, headline:str(fd, 'f-headline'), bio:str(fd, 'f-bio'), location:str(fd, 'f-location'), email:str(fd, 'f-email'),
      phone:str(fd, 'f-phone'), links, photo_path:p.photoPath || null, cv_path:p.cvPath || null, updated_at:new Date().toISOString()};
    const photo = fd.get('f-photo'), cvf = fd.get('f-cvfile');
    if (fd.get('f-photo-rm')) row.photo_path = null;
    if (fd.get('f-cv-rm')) row.cv_path = null;
    if (photo && photo.size){ if (!/^image\//.test(EXT[extOf(photo.name)] || '')) throw 'Зураг PNG, JPG, WEBP эсвэл GIF байх ёстой.'; row.photo_path = await putPublic(photo, 'photo'); }
    if (cvf && cvf.size){ if (extOf(cvf.name) !== 'pdf') throw 'CV файл PDF байх ёстой.'; row.cv_path = await putPublic(cvf, 'cv'); }
    await run(sb.from('profile').update(row).eq('id', 1));
    const stale = [p.photoPath, p.cvPath].filter(x => x && x !== row.photo_path && x !== row.cv_path);
    if (stale.length) sb.storage.from(PUBLIC_BUCKET).remove(stale).catch(() => {});
    await reload('profile'); toast('Хадгаллаа');
  }});
}

function openCv(id, kind){
  const x = id ? S.cv.find(i => i.id === id) : {kind};
  if (!x) return;
  const k = x.kind || 'edu', isSkill = k === 'skill';
  const kindName = (KINDS.find(i => i.k === k) || KINDS[0]).t;
  const body = `<div class="grid2">
    <div class="field wide"><label for="f-kind">Хэсэг</label><select id="f-kind" name="f-kind">${KINDS.map(i => `<option value="${i.k}"${i.k === k ? ' selected' : ''}>${i.t}</option>`).join('')}</select></div>
    ${fText('f-title', isSkill ? 'Ангилал' : 'Гарчиг', x.title, {wide:isSkill, ph: isSkill ? 'Програмчлалын хэл' : k === 'edu' ? 'Програм хангамжийн инженер, бакалавр' : k === 'work' ? 'Дадлагажигч хөгжүүлэгч' : ''})}
    ${isSkill ? '' : fText('f-org', k === 'edu' ? 'Сургууль' : 'Байгууллага', x.org, {ph: k === 'edu' ? 'МУИС, МХТС' : ''})}
    ${isSkill ? '' : fText('f-period', 'Хугацаа', x.period, {ph:'2025 – одоо', hint:'Эхний оноор нь эрэмбэлэгдэнэ.'})}
    ${fArea('f-desc', isSkill ? 'Ур чадварууд' : 'Тайлбар', x.desc, {rows: isSkill ? 3 : 4, ph: isSkill ? 'C, C++, Python, SQL' : '', hint: isSkill ? 'Таслалаар тусгаарлана.' : ''})}
    ${fCheck('f-hidden', 'Зочдод харуулахгүй', x.hidden, 'Зөвхөн танд харагдана.')}
  </div>`;
  openModal({title: id ? 'Засах' : kindName + ' нэмэх', body, onSubmit: async fd => {
    const title = str(fd, 'f-title'); if (!title) throw 'Гарчгаа оруулна уу.';
    const row = {kind:str(fd, 'f-kind'), title, org:str(fd, 'f-org'), period:str(fd, 'f-period'), descr:str(fd, 'f-desc'), hidden:!!fd.get('f-hidden')};
    await run(id ? sb.from('cv_items').update(row).eq('id', id) : sb.from('cv_items').insert(row));
    await reload('cv'); toast('Хадгаллаа');
  }, onDelete: id ? async () => { await run(sb.from('cv_items').delete().eq('id', id)); await reload('cv'); toast('Устгалаа'); } : null,
     deleteWarn:'Энэ мөрийг устгах уу?'});
}

function openCourse(id){
  const c = id ? S.courses.find(i => i.id === id) : {};
  if (!c) return;
  const nfiles = id ? S.files.filter(f => f.courseId === id).length : 0;
  const body = `<div class="grid2">
    ${fText('f-code', 'Хичээлийн код', c.code, {ph:'ICSI202'})}
    ${fText('f-cname', 'Хичээлийн нэр', c.name, {ph:'Өгөгдлийн бүтэц'})}
    ${fText('f-sem', 'Улирал', c.semester, {ph:'2026–2027, Намрын улирал'})}
    ${fText('f-credits', 'Кредит', c.credits ?? '', {type:'number', min:0})}
    ${fText('f-kind', 'Төрөл', c.kind, {ph:'Ерөнхий суурь'})}
    ${fText('f-teacher', 'Багш', c.teacher)}
    ${fArea('f-cdesc', 'Тайлбар', c.desc, {rows:4, ph:'Хичээлээр юу үзсэн, ямар лаборатори хийсэн гэх мэт.'})}
    ${fCheck('f-current', 'Одоо үзэж байгаа хичээл', c.current)}
    ${fCheck('f-hidden', 'Зочдод харуулахгүй', c.hidden, 'Хичээл жагсаалтад зөвхөн танд харагдана. Эрх өгсөн хүмүүс файлыг нь үзсээр байна.')}
  </div>`;
  openModal({title: id ? 'Хичээл засах' : 'Хичээл нэмэх', body, onSubmit: async fd => {
    const code = str(fd, 'f-code').toUpperCase(), name = str(fd, 'f-cname');
    if (!code && !name) throw 'Хичээлийн код эсвэл нэрийг оруулна уу.';
    const cr = str(fd, 'f-credits');
    const row = {code, name, semester:str(fd, 'f-sem'), credits: cr === '' ? null : Number(cr), kind:str(fd, 'f-kind'), teacher:str(fd, 'f-teacher'),
      descr:str(fd, 'f-cdesc'), is_current:!!fd.get('f-current'), hidden:!!fd.get('f-hidden')};
    if (id) await run(sb.from('courses').update(row).eq('id', id));
    else {
      const nid = code.toLowerCase().replace(/[^a-z0-9]/g, '') || newId();
      if (S.courses.some(x => x.id === nid)) throw 'Ийм кодтой хичээл аль хэдийн байна.';
      await run(sb.from('courses').insert({id:nid, ...row}));
    }
    await reload('courses'); toast('Хадгаллаа');
  }, onDelete: id ? async () => {
    const paths = S.files.filter(f => f.courseId === id).map(f => f.path);
    for (let i = 0; i < paths.length; i += 100) await run(sb.storage.from(BUCKET).remove(paths.slice(i, i + 100)));
    await run(sb.from('courses').delete().eq('id', id));       /* its file rows go with it */
    for (const p of S.people.filter(p => p.courses.includes(id)))
      await run(sb.from('people').update({courses: p.courses.filter(x => x !== id)}).eq('email', p.email));
    S.course = null; await reload('courses', 'files', 'people'); toast('Хичээлийг устгалаа');
  } : null, deleteLabel:'Хичээл устгах', deleteWarn: `Энэ хичээл${nfiles ? ' болон түүний ' + nfiles + ' файл' : ''} бүр мөсөн устна.`});
}

function openPerson(email){
  const p = email ? S.people.find(x => x.email === email) : {courses: S.course ? [S.course] : []};
  if (!p) return;
  const courses = [...S.courses].sort((a, b) => ncmp(a.code || '', b.code || ''));
  const body = `<div class="grid2">
    ${fText('f-plabel', 'Хэн бэ', p.label, {ph:'Жишээ: Тэмүүлэн (ангийн найз)', hint:'Зөвхөн танд харагдах тэмдэглэл.'})}
    ${fText('f-pemail', 'Google и-мэйл хаяг', email || '', {type:'email', dis:!!email, ph:'name@gmail.com', hint: email ? 'Хаягийг өөрчлөх бол энэ хүнийг хасаад дахин нэмнэ үү.' : 'Тухайн хүн сайтад нэвтэрдэг Google хаяг.'})}
    <div class="field wide"><span style="font-size:13px;font-weight:500">Аль хичээлийн файлыг үзэх вэ</span>
    ${courses.length ? `<div class="checks">${courses.map(c => `<label class="checkl"><input type="checkbox" name="pc" value="${esc(c.id)}"${(p.courses || []).includes(c.id) ? ' checked' : ''}><span><span class="code">${esc(c.code || '')}</span> ${esc(c.name || '')}</span></label>`).join('')}</div>`
      : '<p class="note">Эхлээд хичээл нэмнэ үү.</p>'}</div></div>`;
  openModal({title: email ? 'Эрх засах' : 'Хүнд эрх өгөх', body, onSubmit: async fd => {
    const label = str(fd, 'f-plabel');
    const addr = (email || str(fd, 'f-pemail')).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) throw 'И-мэйл хаяг буруу байна.';
    if (!email && S.people.some(x => x.email === addr)) throw 'Энэ хаягтай хүн аль хэдийн нэмэгдсэн байна.';
    await run(sb.from('people').upsert({email:addr, label, courses: fd.getAll('pc').map(String)}));
    await reload('people'); toast('Эрхийг хадгаллаа');
  }});
}

const joinPath = (a, b) => a ? a + '/' + b : b;
function cleanPath(p){
  const segs = String(p || '').replace(/\\/g, '/').split('/').map(s => s.trim()).filter(Boolean);
  if (segs.some(s => s === '.' || s === '..')) return '';
  return segs.join('/');
}
/* an upload in progress can be stopped; a request that never answers (a laptop that slept) gives up
   after a while instead of holding the queue forever */
let cancelUpload = false;
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Хугацаа хэтэрлээ (сүлжээ тасарсан байж магадгүй).')), ms))]);
const uploadingHTML = () => S.uploading
  ? `<div class="ftools uploading"><span>${esc(S.uploading)}</span>${cancelUpload ? '' : '<button class="btn small ghost" data-act="upload-stop">Зогсоох</button>'}</div>` : '';
async function putObject(key, file){
  const ms = 120000 + file.size / 25;          /* two minutes plus ~25 KB/s */
  let tries = 0, refreshed = false;
  for (;;){
    try { await withTimeout(run(sb.storage.from(BUCKET).upload(key, file, {contentType:mimeOf(file), upsert:true})), ms); return; }
    catch (e){
      const m = String(e && e.message);
      if (!refreshed && /jwt|expired|401|403|Unauthorized/i.test(m)){ refreshed = true; await sb.auth.refreshSession(); continue; }
      if (/rate|429|503|timeout|Хугацаа|Failed to fetch/i.test(m) && tries++ < 3 && !cancelUpload){
        await new Promise(res => setTimeout(res, 2500 * tries));
        continue;
      }
      throw e;
    }
  }
}
/* items: [{file, path}] or [{skip: path}] — path is relative to the course root.
   A file already there with the same path and size is left alone, so dropping the same folder again
   only sends what is missing. opts.quiet: no toast (the bulk import reports once); opts.label prefixes
   the progress line. Resolves {ok, already, skipped:[paths], fails:[messages], stopped}. */
async function uploadItems(courseId, raw, openFolder, opts = {}){
  if (S.uploading && !opts.quiet){ toast('Өмнөх байршуулалт дуусаагүй байна. «Зогсоох» дарж зогсоогоод дахин оролдоно уу.', 'err'); return {ok:0, already:0, skipped:[], fails:[]}; }
  if (!opts.quiet) cancelUpload = false;
  const skipped = new Set(), fails = [], items = [];
  for (const it of raw){
    if (it.skip){ skipped.add(it.skip); continue; }
    const path = cleanPath(it.path);
    if (!path){ fails.push(`${it.path}: зам буруу`); continue; }
    const segs = path.split('/'), dot = segs.findIndex(s => s.startsWith('.'));
    if (dot >= 0){ skipped.add(segs.slice(0, dot + 1).join('/')); continue; }
    if (!it.file.size || SKIP_EXT.has(extOf(it.file.name))){ skipped.add(path); continue; }
    if (it.file.size > MAX_BYTES){ fails.push(`${path}: 50 MB-аас их`); continue; }
    items.push({file:it.file, path});
  }
  const skipText = skipped.size ? `Алгассан: ${[...skipped].slice(0, 6).join(', ')}${skipped.size > 6 ? ` болон өөр ${skipped.size - 6}` : ''}` : '';
  if (!items.length){
    if (!opts.quiet) toast(['Оруулах боломжтой файл олдсонгүй', skipText, ...fails].filter(Boolean).join('. '), 'err');
    return {ok:0, already:0, skipped:[...skipped], fails};
  }
  await reload('files');                     /* what an earlier, interrupted upload already managed to send */
  const existing = new Map(S.files.filter(f => f.courseId === courseId).map(f => [f.name, f]));
  const pre = opts.label ? opts.label + ' · ' : '';
  let ok = 0, already = 0, stopped = false;
  for (let i = 0; i < items.length; i++){
    if (cancelUpload){ stopped = true; break; }
    const {file, path} = items[i];
    const old = existing.get(path);
    if (old && Number(old.size) === file.size){ already++; continue; }
    S.uploading = `${pre}Байршуулж байна ${i + 1}/${items.length}: ${path}`; render();
    try {
      const key = storageKey(courseId, file.name);
      await putObject(key, file);
      const row = await withTimeout(run(sb.from('files').upsert({course_id:courseId, name:path, size:file.size, mime:mimeOf(file), storage_path:key,
        created_at:new Date().toISOString()}, {onConflict:'course_id,name'}).select().single()), 60000);
      if (old && old.path !== key) sb.storage.from(BUCKET).remove([old.path]).catch(() => {});
      existing.set(path, mapFile(row));
      ok++;
    } catch (e){ fails.push(`${path}: ${errMsg(e)}`); }
  }
  if (!opts.quiet){ S.uploading = ''; cancelUpload = false; }
  if (openFolder) S.open.add(courseId + ':' + openFolder);
  await reload('files');
  if (!opts.quiet) toast([`${ok} файл орлоо`, already ? `${already} нь өмнө орсон тул алгассан` : '', stopped ? 'Зогсоосон' : '', skipText,
    fails.length ? 'Орж чадаагүй: ' + fails.join('; ') : ''].filter(Boolean).join('. '), fails.length ? 'err' : '');
  return {ok, already, skipped:[...skipped], fails, stopped};
}
/* One drop for every course: each top folder whose name starts with a course code
   ("ECEN213 Компьютерын сүлжээ/…") goes to that course; the path below it is kept. */
const CODE_RE = /^([A-Za-z]{3,5}\d{3})(?![0-9])/;
async function bulkImport(raw){
  if (S.uploading){ toast('Өмнөх байршуулалт дуусаагүй байна. Түр хүлээнэ үү.', 'err'); return; }
  const byCode = new Map(S.courses.filter(c => c.code).map(c => [String(c.code).toUpperCase(), c]));
  const groups = new Map(), unmatched = new Set();
  for (const it of raw){
    const segs = String(it.skip || it.path || '').split('/').filter(Boolean);
    const i = segs.findIndex(s => CODE_RE.test(s) && byCode.has(s.match(CODE_RE)[1].toUpperCase()));
    if (i < 0){ if (!it.skip) unmatched.add(segs.slice(0, 2).join('/')); continue; }
    const course = byCode.get(segs[i].match(CODE_RE)[1].toUpperCase());
    const rest = segs.slice(i + 1).join('/');
    if (!rest) continue;
    if (!groups.has(course.id)) groups.set(course.id, {course, items:[]});
    groups.get(course.id).items.push(it.skip ? {skip:rest} : {file:it.file, path:rest});
  }
  if (!groups.size){
    toast('Хичээлийн код бүхий хавтас олдсонгүй. Хавтасны нэр «ECEN213 …» гэх мэтээр хичээлийн кодоор эхлэх ёстой.', 'err');
    return;
  }
  const report = [];
  S.bulkReport = null;
  cancelUpload = false;
  const list = [...groups.values()];
  for (let n = 0; n < list.length && !cancelUpload; n++){
    const {course, items} = list[n];
    const r = await uploadItems(course.id, items, '', {quiet:true, label:`${n + 1}/${list.length} ${course.code}`});
    report.push({code:course.code, name:course.name, ...r});
  }
  const stopped = cancelUpload;
  S.uploading = ''; cancelUpload = false;
  S.bulkReport = {rows:report, unmatched:[...unmatched], stopped};
  render();
  const ok = report.reduce((s, r) => s + r.ok, 0), already = report.reduce((s, r) => s + (r.already || 0), 0);
  const bad = report.reduce((s, r) => s + r.fails.length, 0);
  toast(`${stopped ? 'Зогсоосон. ' : ''}${report.length} хичээлд ${ok} шинэ файл орлоо${already ? `, ${already} нь өмнө орсон байсан` : ''}${bad ? `, ${bad} файл орж чадсангүй` : ''}.`, bad ? 'err' : '');
}
function bulkReportHTML(){
  const b = S.bulkReport; if (!b) return '';
  return `<section class="panel"><div class="sechead" style="margin:0"><h3>Сүүлийн байршуулалт</h3><button class="btn small ghost" data-act="bulk-close">Хаах</button></div>
    <div class="flist">${b.rows.map(r => `<div class="frow"><span class="ext">${r.fails.length ? '!' : '✓'}</span>
      <div style="min-width:0"><div class="titleline"><span class="code">${esc(r.code)}</span><span>${esc(r.name || '')}</span></div>
      <div class="fmeta">${r.ok} шинэ файл орсон${r.already ? ` · ${r.already} өмнө орсон` : ''}${r.skipped.length ? ` · ${r.skipped.length} алгассан` : ''}${r.fails.length ? ` · ${r.fails.length} алдаа` : ''}${r.stopped ? ' · зогсоосон' : ''}</div>
      ${r.fails.length ? `<p class="note" style="color:var(--danger)">${r.fails.map(esc).join('<br>')}</p>` : ''}
      ${r.skipped.length ? `<p class="note">Алгассан: ${r.skipped.slice(0, 8).map(esc).join(', ')}${r.skipped.length > 8 ? ' …' : ''}</p>` : ''}</div><span></span></div>`).join('')}</div>
    ${b.unmatched.length ? `<p class="note">Хичээл нь олдоогүй хавтас: ${b.unmatched.slice(0, 8).map(esc).join(', ')}</p>` : ''}
    ${b.stopped ? '<p class="note">Байршуулалтыг зогсоосон. Үргэлжлүүлэх бол ижил хавтсаа дахин чирнэ үү, өмнө орсон файлууд алгасагдана.</p>' : ''}</section>`;
}
/* read dropped files and folders, keeping their relative paths */
function collectDrop(dt){
  const entries = [...(dt.items || [])].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  const plain = [...(dt.files || [])];
  return (async () => {
    if (!entries.length) return plain.map(f => ({file:f, path:f.name}));
    const out = [];
    const walk = async (entry, prefix) => {
      if (entry.isFile) out.push({file: await new Promise((res, rej) => entry.file(res, rej)), path: prefix + entry.name});
      else if (entry.isDirectory){
        if (entry.name.startsWith('.')){ out.push({skip: prefix + entry.name}); return; }
        const reader = entry.createReader();
        for (;;){
          const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          if (!batch.length) break;
          for (const e of batch) await walk(e, prefix + entry.name + '/');
        }
      }
    };
    for (const e of entries) await walk(e, '');
    return out;
  })();
}

function openNewFolder(){
  const course = S.course;
  openModal({title:'Шинэ хавтас', submitLabel:'Оруулах', body:`<div class="grid2">
    ${fText('f-dir', 'Хавтасны нэр', '', {wide:true, ph:'lab5', hint:'Хавтас доторх хавтас бол «lab4/assets» гэж бичнэ.'})}
    <div class="field wide"><label for="f-nfiles">Хавтсанд оруулах файлууд</label><input type="file" id="f-nfiles" name="f-nfiles" multiple></div></div>`,
  onSubmit: async fd => {
    const dir = cleanPath(str(fd, 'f-dir')); if (!dir) throw 'Хавтасны нэрээ оруулна уу.';
    const files = fd.getAll('f-nfiles').filter(f => f && f.size);
    if (!files.length) throw 'Хавтсанд оруулах файлаа сонгоно уу. Хоосон хавтас хадгалагдахгүй.';
    setTimeout(() => uploadItems(course, files.map(f => ({file:f, path:dir + '/' + f.name})), dir), 0);
  }});
}
function openDirRename(path){
  const course = S.course, list = S.files.filter(f => f.courseId === course);
  openModal({title:'Хавтасны нэр солих', body:`<div class="grid2">${fText('f-dir', 'Хавтасны зам', path, {wide:true, hint:'Өөр хавтас дотор зөөх бол «lab4/assets» гэх мэтээр бичнэ.'})}</div>`,
  onSubmit: async fd => {
    const np = cleanPath(str(fd, 'f-dir')); if (!np) throw 'Хавтасны нэрээ зөв оруулна уу.';
    if (np === path) return;
    const moving = list.filter(f => f.name.startsWith(path + '/'));
    const taken = new Set(list.filter(f => !f.name.startsWith(path + '/')).map(f => f.name));
    for (const f of moving){ const n = np + f.name.slice(path.length); if (taken.has(n)) throw `«${n}» нэртэй файл аль хэдийн байна.`; }
    for (const f of moving) await run(sb.from('files').update({name: np + f.name.slice(path.length)}).eq('id', f.id));
    S.open.add(course + ':' + np); await reload('files'); toast('Хавтасны нэрийг солилоо');
  }});
}
function openMove(id){
  const f = S.files.find(x => x.id === id); if (!f) return;
  const parts = f.name.split('/'), base = parts.pop(), cur = parts.join('/');
  const dirs = dirPaths(S.files.filter(x => x.courseId === f.courseId)).sort(ncmp);
  openModal({title:'Файл зөөх', body:`<div class="grid2">
    <div class="field"><label for="f-mdir">Хавтас</label><select id="f-mdir" name="f-mdir">
      <option value=""${cur === '' ? ' selected' : ''}>(Үндсэн хэсэг)</option>${dirs.map(d => `<option value="${esc(d)}"${d === cur ? ' selected' : ''}>${esc(d)}</option>`).join('')}</select></div>
    ${fText('f-mname', 'Файлын нэр', base)}</div>`,
  onSubmit: async fd => {
    const np = cleanPath(joinPath(str(fd, 'f-mdir'), str(fd, 'f-mname'))); if (!np) throw 'Файлын нэрээ зөв оруулна уу.';
    if (np === f.name) return;
    if (S.files.some(x => x.courseId === f.courseId && x.id !== id && x.name === np)) throw 'Ийм замтай файл аль хэдийн байна.';
    await run(sb.from('files').update({name:np}).eq('id', id));
    const d = np.split('/').slice(0, -1).join('/'); if (d) S.open.add(f.courseId + ':' + d);
    await reload('files'); toast('Зөөлөө');
  }});
}
function pickUpload(inputId, folder){
  if (!isAdmin()) return;
  S.uploadTarget = {course:S.course, folder:folder || ''};
  const i = $(inputId); i.value = ''; i.click();
}
async function removeFiles(list){
  const paths = list.map(f => f.path);
  for (let i = 0; i < paths.length; i += 100) await run(sb.storage.from(BUCKET).remove(paths.slice(i, i + 100)));
  const ids = list.map(f => f.id);
  for (let i = 0; i < ids.length; i += 100) await run(sb.from('files').delete().in('id', ids.slice(i, i + 100)));
}

/* ---------- events ---------- */
const A = {
  'sign-in': async () => {
    const {error} = await sb.auth.signInWithOAuth({provider:'google', options:{redirectTo: location.origin + location.pathname}});
    if (error) toast(errMsg(error), 'err');
  },
  'sign-out': async () => { await sb.auth.signOut(); },
  tab: d => { S.tab = d.tab; S.course = null; try { localStorage.setItem('pf-tab', d.tab); } catch {} render(); },
  'open-course': d => { S.tab = 'courses'; S.course = d.id; S.confirmFile = S.confirmDir = null; S.tagFilter = ''; render(); window.scrollTo({top:0}); },
  'tag-filter': d => { S.tagFilter = d.tag || ''; render(); },
  'bulk-pick': () => { if (!isAdmin()) return; S.uploadTarget = {bulk:true}; const i = $('#up-folder'); i.value = ''; i.click(); },
  'bulk-close': () => { S.bulkReport = null; render(); },
  'upload-stop': () => { cancelUpload = true; S.uploading = 'Зогсоож байна… (одоогийн файл дуусахыг хүлээж байна)'; render(); },
  'dir-toggle': d => { S.open.has(d.key) ? S.open.delete(d.key) : S.open.add(d.key); render(); },
  'dir-all': d => {
    const keys = dirPaths(courseFiles(d.course)).map(p => d.course + ':' + p);
    const all = keys.every(k => S.open.has(k));
    keys.forEach(k => all ? S.open.delete(k) : S.open.add(k)); render();
  },
  'upload-files': d => pickUpload('#up-files', d.folder),
  'upload-folder': d => pickUpload('#up-folder', d.folder),
  'new-folder': () => openNewFolder(),
  'file-move': d => openMove(d.id),
  'dir-rename': d => openDirRename(d.path),
  'dir-del': d => { S.confirmDir = d.path; render(); },
  'dir-del-no': () => { S.confirmDir = null; render(); },
  'dir-del-yes': async d => {
    const list = S.files.filter(f => f.courseId === S.course && f.name.startsWith(d.path + '/'));
    S.confirmDir = null; render();
    try { await removeFiles(list); await reload('files'); toast(`«${d.path}» хавтас болон ${list.length} файлыг устгалаа`); }
    catch (e){ toast(errMsg(e), 'err'); }
  },
  back: () => { S.course = null; render(); },
  copy: (d, b) => copyText(d.text, b),
  preview: () => { S.preview = !S.preview; S.confirmFile = S.confirmPerson = null; render(); },
  'edit-profile': () => openProfile(),
  'add-cv': d => openCv(null, d.kind),
  'edit-cv': d => openCv(d.id),
  'add-course': () => openCourse(null),
  'edit-course': d => openCourse(d.id),
  view: d => viewFile(d),
  dl: (d, b) => downloadOne(d, b),
  'dl-dir': (d, b) => downloadFolder(d.course || S.course, d.path || '', b),
  'file-del': d => { S.confirmFile = d.id; render(); },
  'file-del-no': () => { S.confirmFile = null; render(); },
  'file-del-yes': async d => {
    const f = S.files.find(x => x.id === d.id); S.confirmFile = null; if (!f) return;
    try { await removeFiles([f]); await reload('files'); toast('Файлыг устгалаа'); }
    catch (e){ toast(errMsg(e), 'err'); render(); }
  },
  'add-person': () => openPerson(null),
  'edit-person': d => openPerson(d.id),
  'person-del': d => { S.confirmPerson = d.id; render(); },
  'person-del-no': () => { S.confirmPerson = null; render(); },
  'person-del-yes': async d => {
    S.confirmPerson = null;
    try { await run(sb.from('people').delete().eq('email', d.id)); await reload('people'); toast('Эрхийг хаслаа'); }
    catch (e){ toast(errMsg(e), 'err'); render(); }
  },
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.closest('#modal')) return;
  const fn = A[b.dataset.act]; if (fn){ e.preventDefault(); fn(b.dataset, b); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'pv-as'){ S.previewAs = t.value; S.course = S.course && coursesAll().some(c => c.id === S.course) ? S.course : null; render(); return; }
  if (t.classList.contains('tagsel') && isAdmin()){
    const v = t.value === 'auto' ? '' : t.value;
    const list = (t.dataset.id ? S.files.filter(f => f.id === t.dataset.id)
      : S.files.filter(f => f.courseId === S.course && f.name.startsWith(t.dataset.folder + '/'))).filter(f => (f.tag || '') !== v);
    (async () => {
      try {
        const ids = list.map(f => f.id);
        for (let i = 0; i < ids.length; i += 100) await run(sb.from('files').update({tag:v}).in('id', ids.slice(i, i + 100)));
        await reload('files');
        if (t.dataset.folder) toast(`«${t.dataset.folder}» хавтасны ${list.length} файлын төрлийг солилоо`);
      } catch (e){ toast(errMsg(e), 'err'); }
    })();
    return;
  }
  if ((t.id !== 'up-files' && t.id !== 'up-folder') || !t.files.length || !isAdmin() || !S.uploadTarget) return;
  if (S.uploadTarget.bulk){
    const items = [...t.files].map(f => ({file:f, path:f.webkitRelativePath || f.name}));
    t.value = '';
    bulkImport(items);
    return;
  }
  const {course, folder} = S.uploadTarget;
  const items = [...t.files].map(f => ({file:f, path: joinPath(folder, t.id === 'up-folder' ? (f.webkitRelativePath || f.name) : f.name)}));
  t.value = '';
  uploadItems(course, items, folder);
});
let overEl = null;
function setOver(el){ if (overEl === el) return; overEl?.classList.remove('over'); overEl = el; el?.classList.add('over'); }
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
document.addEventListener('dragover', e => {
  if (!hasFiles(e)) return;
  const zone = isAdmin() && e.target.closest('[data-dropzone]');
  e.preventDefault();
  e.dataTransfer.dropEffect = zone ? 'copy' : 'none';
  setOver(zone ? (e.target.closest('[data-drop]') || zone) : null);
});
document.addEventListener('dragleave', e => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[data-dropzone]')) setOver(null); });
document.addEventListener('drop', e => {
  if (!hasFiles(e)) return;
  e.preventDefault(); setOver(null);
  const zone = isAdmin() && e.target.closest('[data-dropzone]'); if (!zone) return;
  if (zone.dataset.dropzone === 'bulk'){
    collectDrop(e.dataTransfer).then(bulkImport).catch(err => toast('Файлыг уншиж чадсангүй: ' + (err && err.message || err), 'err'));
    return;
  }
  const folder = e.target.closest('[data-drop]')?.dataset.drop || '';
  const course = S.course;
  collectDrop(e.dataTransfer)
    .then(items => uploadItems(course, items.map(it => it.skip ? {skip: joinPath(folder, it.skip)} : {file:it.file, path: joinPath(folder, it.path)}), folder))
    .catch(err => toast('Файлыг уншиж чадсангүй: ' + (err && err.message || err), 'err'));
});
window.addEventListener('beforeunload', e => { if (S.uploading){ e.preventDefault(); e.returnValue = ''; } });

/* ---------- boot ---------- */
async function start(){
  try {
    await loadSession();
    await reload();
    S.ready = true; S.fatal = '';
  } catch (e){
    console.error(e);
    S.fatal = /relation .* does not exist|Could not find the table|schema cache/i.test(String(e && e.message))
      ? 'Supabase-ийн хүснэгтүүд олдсонгүй. supabase/schema.sql файлыг SQL Editor дээр ажиллуулсан эсэхээ шалгана уу.'
      : 'Мэдээллийг ачаалж чадсангүй: ' + errMsg(e);
  }
  render();
}
if (!sb){ render(); return; }
let lastUser;
sb.auth.onAuthStateChange((event, session) => {
  const uid = session ? session.user.id : null;
  if (uid === lastUser) return;          /* token refreshes keep the same person */
  lastUser = uid;
  S.preview = false; S.previewAs = '';
  setTimeout(start, 0);                  /* never call Supabase inside this callback directly */
});
})();

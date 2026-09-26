// Сбор IT-вакансий с hh.ru.
//
// Как запустить:
// 1. Открыть в браузере любую страницу поиска hh.ru, например https://hh.ru/search/vacancy?text=python
// 2. Открыть DevTools (F12), вкладка Console.
// 3. Вставить этот файл целиком и нажать Enter.
// 4. Дождаться сообщения "done" в консоли, затем выполнить downloadCsv().
//
// Скрипт запрашивает страницы поиска hh.ru (по 100 вакансий на странице),
// достаёт из каждой встроенный JSON со списком вакансий и собирает таблицу.
// Публичный API api.hh.ru для анонимных запросов отвечает "forbidden",
// поэтому данные берутся со страниц поиска сайта.

const QUERIES = [
  'python', 'java', 'аналитик данных', 'data scientist', 'frontend',
  'devops', 'тестировщик', 'golang', '1с программист', 'c++',
];
const AREA = 113;       // 113 = вся Россия
const MAX_PAGES = 10;   // до 1000 вакансий на один запрос
const PER_PAGE = 100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (o, ...path) => {
  for (const k of path) {
    if (o == null) return null;
    o = o[k];
  }
  return o ?? null;
};
// Списки вида [{"workFormatsElement": ["REMOTE", "HYBRID"]}] -> "REMOTE|HYBRID"
const joinList = (x) => {
  if (!Array.isArray(x)) return null;
  const items = x.flatMap((e) => Object.values(e || {}).flat()).filter(Boolean);
  return items.length ? items.join('|') : null;
};

function toRow(v, query) {
  const c = v.company || {};
  const comp = v.compensation || {};
  const metro = get(v, 'address', 'metroStations', 'metro');
  const m0 = Array.isArray(metro) ? metro[0] : null;
  return {
    vacancy_id: v.vacancyId,
    search_query: query,
    name: v.name,
    employer_id: c.id ?? null,
    employer_name: c.visibleName || c.name || null,
    employer_trusted: c['@trusted'] ?? null,
    employer_it_accredited: c.accreditedITEmployer ?? null,
    employer_category: c['@category'] ?? null,
    employer_rating: get(c, 'employerReviews', 'totalRating'),
    employer_reviews_count: get(c, 'employerReviews', 'reviewsCount'),
    area_id: get(v, 'area', '@id'),
    city: get(v, 'area', 'name'),
    area_path: get(v, 'area', 'path'),
    metro_station: m0 ? m0.name : null,
    metro_line: m0 ? get(m0, 'line', 'name') : null,
    lat: m0 ? m0.lat : null,
    lng: m0 ? m0.lng : null,
    salary_from: comp.from ?? null,
    salary_to: comp.to ?? null,
    salary_currency: comp.currencyCode ?? null,
    salary_gross: comp.gross ?? null,
    salary_mode: comp.mode ?? null,
    salary_frequency: comp.frequency ?? null,
    experience: v.workExperience ?? null,
    employment_form: v.employmentForm ?? null,
    work_schedule: v['@workSchedule'] ?? null,
    work_formats: joinList(v.workFormats),
    schedule_by_days: joinList(v.workScheduleByDays),
    working_hours: joinList(v.workingHours),
    internship: v.internship ?? null,
    accept_temporary: v.acceptTemporary ?? null,
    accept_incomplete_resumes: v.acceptIncompleteResumes ?? null,
    accept_labor_contract: v.acceptLaborContract ?? null,
    response_letter_required: v['@responseLetterRequired'] ?? null,
    night_shifts: v.nightShifts ?? null,
    is_premium: Array.isArray(v.extraLabels)
      ? v.extraLabels.some((l) => /premium/.test(l.id || ''))
      : false,
    professional_role_id: joinList(v.professionalRoleIds),
    published_at: get(v, 'publicationTime', '$'),
    responses_count: v.responsesCount ?? null,
    total_responses_count: v.totalResponsesCount ?? null,
    online_users_count: v.online_users_count ?? null,
    url: 'https://hh.ru/vacancy/' + v.vacancyId,
  };
}

async function fetchPage(query, page) {
  const url = `/search/vacancy?text=${encodeURIComponent(query)}&area=${AREA}` +
    `&items_on_page=${PER_PAGE}&page=${page}`;
  const html = await (await fetch(url)).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const state = JSON.parse(doc.querySelector('#HH-Lux-InitialState').innerHTML);
  return state.vacancySearchResult;
}

const rows = new Map(); // vacancy_id -> row, чтобы не было дублей между запросами

async function collect() {
  for (const q of QUERIES) {
    for (let p = 0; p < MAX_PAGES; p++) {
      let res;
      try {
        res = await fetchPage(q, p);
      } catch (e) {
        console.warn(q, p, e.message);
        await sleep(3000);
        continue;
      }
      const vacancies = res.vacancies || [];
      for (const v of vacancies) {
        if (!rows.has(v.vacancyId)) rows.set(v.vacancyId, toRow(v, q));
      }
      console.log(q, 'page', p, vacancies.length, 'total', rows.size);
      const last = get(res, 'paging', 'lastPage', 'page');
      if (!vacancies.length || (last != null && p >= last)) break;
      await sleep(900 + Math.random() * 600); // не нагружать сайт
    }
  }
  console.log('done', rows.size);
}

function downloadCsv(filename = 'hh_it_vacancies.csv') {
  const data = [...rows.values()];
  const cols = Object.keys(data[0]);
  const esc = (x) => {
    if (x === null || x === undefined) return '';
    const s = String(x);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [cols.join(','), ...data.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
}

collect();

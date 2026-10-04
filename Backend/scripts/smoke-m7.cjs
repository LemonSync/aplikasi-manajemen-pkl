const BASE = 'http://localhost:4000';

async function req(method, path, body, token) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload;
  if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

const log = (label, ok, extra) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + label, extra !== undefined ? JSON.stringify(extra).slice(0, 200) : '');
  if (!ok) process.exitCode = 1;
};

async function main() {
  const login = await req('POST', '/api/auth/login', { identifier: 'superadmin', password: 'Admin12345!' });
  const token = login.json?.data?.tokens?.accessToken ?? login.json?.data?.accessToken;
  log('login superadmin', login.status === 200 && !!token, login.status);

  const co = await req('GET', '/api/master/class-options', null, token);
  const opts = co.json?.data ?? [];
  log('class-options 24 item', co.status === 200 && opts.length === 24, opts.length);
  log('class-options ada DKV 1', opts.some(o => o.value === 'DKV 1'));
  log('class-options ada PEKSOS 4', opts.some(o => o.value === 'PEKSOS 4'));

  const cohorts = await req('GET', '/api/master/cohorts', null, token);
  const cohortId = cohorts.json?.data?.[0]?.id;
  log('ada cohort', !!cohortId, cohorts.json?.data?.[0]?.name);

  const ps = await req('GET', '/api/cohorts/' + cohortId + '/phase-schedule', null, token);
  log('GET phase-schedule', ps.status === 200, ps.json?.data);

  const put = await req('PUT', '/api/cohorts/' + cohortId + '/phase-schedule', {
    items: [
      { phase: 'PRA_PKL', startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-06-30T23:59:59.000Z' },
      { phase: 'NON_PKL', startDate: '2026-07-01T00:00:00.000Z', endDate: '2026-08-31T23:59:59.000Z' },
      { phase: 'PKL_AKTIF', startDate: '2026-09-01T00:00:00.000Z', endDate: '2026-11-30T23:59:59.000Z' },
    ],
  }, token);
  log('PUT phase-schedule', put.status === 200, put.json?.data?.length);

  const ov = await req('GET', '/api/cohorts/' + cohortId + '/phase-schedule/overview', null, token);
  log('overview currentPhase=PKL_AKTIF', ov.json?.data?.currentPhase === 'PKL_AKTIF', ov.json?.data?.currentPhase);

  console.log('\nSMOKE TEST SELESAI');
}
main().catch(e => { console.error('ERROR', e); process.exit(1); });
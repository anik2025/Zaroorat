/* KotaMitra Phase 2B Task 4: isolated synthetic fixture validator. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const defaultFixture = path.join(__dirname, 'fixtures', 'location-test-fixtures.json');
const defaultReportDir = path.join(__dirname, 'reports');
const TEST_MARKER = 'TEST DATA';
const INDIA_PIN_PATTERN = /^\d{6}$/;
const NON_INDIA_PIN_PATTERN = /^[0-9A-Za-z -]{3,12}$/;
const PIN_PATTERN = INDIA_PIN_PATTERN; // Backward-compatible export for India-focused tests.

function loadFixture(file = defaultFixture) {
  const fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (fixture.fixture_metadata?.data_status !== TEST_MARKER || fixture.fixture_metadata?.authoritative !== false) {
    throw new Error('Refusing non-synthetic or authoritative fixture input');
  }
  return fixture;
}

function indexById(records) {
  return new Map((records || []).map(record => [record.id, record]));
}

function duplicateIds(records, type) {
  const seen = new Map();
  const issues = [];
  for (const record of records || []) {
    if (!record.id) continue;
    if (seen.has(record.id)) issues.push({ type, id: record.id, reason: 'duplicate source ID' });
    seen.set(record.id, record);
  }
  return issues;
}

function duplicateLocations(records, type, fields) {
  const seen = new Map();
  const issues = [];
  for (const record of records || []) {
    const key = fields.map(field => String(record[field] ?? '').trim().toLowerCase()).join('|');
    if (seen.has(key)) issues.push({ type, id: record.id, reason: 'duplicate location', key });
    else seen.set(key, record.id);
  }
  return issues;
}

function duplicateIdSet(records) {
  const ids = new Set();
  const duplicates = new Set();
  for (const record of records || []) {
    if (!record.id) continue;
    if (ids.has(record.id)) duplicates.add(record.id);
    ids.add(record.id);
  }
  return duplicates;
}

function mergeIssues(records, type) {
  const byId = indexById(records);
  const issues = [];
  const state = new Map();
  function visit(record, trail = []) {
    if (!record?.merged_into_id) return;
    if (!byId.has(record.merged_into_id)) {
      issues.push({ type, id: record.id, reason: 'invalid merge target', target_id: record.merged_into_id });
      return;
    }
    if (trail.includes(record.id)) {
      issues.push({ type, id: record.id, reason: 'merge cycle detected', cycle: [...trail, record.id] });
      return;
    }
    if (state.get(record.id) === 'done') return;
    state.set(record.id, 'visiting');
    visit(byId.get(record.merged_into_id), [...trail, record.id]);
    state.set(record.id, 'done');
  }
  for (const record of records || []) visit(record);
  return issues;
}

function validate(fixture) {
  const accepted = [];
  const rejected = [];
  const ambiguous = [];
  const blockedAcceptedKeys = new Set();
  const reject = (recordType, record, reason, details = {}) => rejected.push({ record_type: recordType, record_id: record?.id || record?.case_id || null, reason, details, data_status: TEST_MARKER });
  const accept = (recordType, record, reason = 'valid synthetic record') => {
    const key = `${recordType}:${record?.id || record?.case_id || ''}`;
    if (!blockedAcceptedKeys.has(key)) accepted.push({ record_type: recordType, record_id: record?.id || record?.case_id || null, reason, data_status: TEST_MARKER });
  };

  const countries = indexById(fixture.countries);
  const states = indexById(fixture.states);
  const districts = indexById(fixture.districts);
  const settlements = indexById(fixture.settlements);
  const localities = indexById(fixture.localities);
  const pincodes = indexById(fixture.pincodes);
  const postOffices = indexById(fixture.post_offices);

  const entityRecords = { countries: fixture.countries, states: fixture.states, districts: fixture.districts, settlements: fixture.settlements, localities: fixture.localities, pincodes: fixture.pincodes, post_offices: fixture.post_offices };
  const duplicateEntityIds = new Set();
  for (const [type, records] of Object.entries(entityRecords)) {
    const duplicateIdsForType = duplicateIdSet(records);
    for (const id of duplicateIdsForType) duplicateEntityIds.add(`${type}:${id}`);
    for (const issue of duplicateIds(records, type)) reject(type, issue, issue.reason);
    for (const issue of mergeIssues(records, type)) reject(type, issue, issue.reason, issue);
  }
  for (const issue of duplicateLocations(fixture.states, 'states', ['country_id', 'name'])) reject('states', issue, issue.reason);
  for (const issue of duplicateLocations(fixture.districts, 'districts', ['state_id', 'name'])) reject('districts', issue, issue.reason);
  for (const issue of duplicateLocations(fixture.settlements, 'settlements', ['district_id', 'name', 'settlement_type'])) reject('settlements', issue, issue.reason);
  for (const issue of duplicateLocations(fixture.localities, 'localities', ['district_id', 'name'])) reject('localities', issue, issue.reason);
  for (const issue of duplicateLocations(fixture.pincodes, 'pincodes', ['country_id', 'code'])) reject('pincodes', issue, issue.reason);
  for (const issue of duplicateLocations(fixture.post_offices, 'post_offices', ['pincode_id', 'name'])) reject('post_offices', issue, issue.reason);

  for (const record of fixture.pincodes || []) {
    const country = countries.get(record.country_id);
    const pinPattern = country?.iso2_code === 'IN' ? INDIA_PIN_PATTERN : NON_INDIA_PIN_PATTERN;
    if (!pinPattern.test(String(record.code || ''))) reject('pincodes', record, country?.iso2_code === 'IN' ? 'invalid Indian PIN format: expected exactly six digits' : 'invalid PIN format');
    else accept('pincodes', record);
  }
  for (const record of fixture.states || []) {
    if (!countries.has(record.country_id)) reject('states', record, 'invalid state/country relationship');
    else accept('states', record);
  }
  for (const record of fixture.districts || []) {
    if (!states.has(record.state_id)) reject('districts', record, 'invalid district/state relationship');
    else accept('districts', record);
  }
  for (const record of fixture.settlements || []) {
    if (!districts.has(record.district_id)) reject('settlements', record, 'invalid settlement/district relationship');
    else accept('settlements', record);
  }
  for (const record of fixture.localities || []) {
    const settlement = settlements.get(record.settlement_id);
    if (!settlement || settlement.district_id !== record.district_id) reject('localities', record, 'invalid locality relationship');
    else accept('localities', record);
  }
  for (const record of fixture.post_offices || []) {
    if (!pincodes.has(record.pincode_id)) reject('post_offices', record, 'invalid post-office/PIN relationship');
    else accept('post_offices', record);
  }
  for (const record of fixture.locality_pincodes || []) {
    if (!localities.has(record.locality_id) || !pincodes.has(record.pincode_id)) reject('locality_pincodes', record, 'invalid locality/PIN relationship');
    else accept('locality_pincodes', record);
  }

  for (const [recordType, records] of Object.entries(entityRecords)) {
    for (const record of records || []) {
      if (record.is_active === false && record.id) reject(recordType, record, 'inactive location cannot be accepted as active import');
      if (record.merged_into_id && record.merged_into_id === record.id) reject(recordType, record, 'location cannot merge into itself');
    }
  }
  for (const record of fixture.legacy_kota_mapping_cases || []) {
    if (record.mapping_status?.includes('unresolved')) ambiguous.push({ record_type: 'legacy_kota_mapping', record_id: record.legacy_area, reason: 'ambiguous legacy mapping remains unresolved', data_status: TEST_MARKER });
    else accept('legacy_kota_mapping', record, 'name preserved for test-only validation; not an authoritative mapping');
  }
  for (const record of fixture.validation_cases || []) {
    if (record.status === 'invalid') reject('validation_case', record, `expected invalid case: ${record.case_id}`);
    else if (record.status === 'unresolved') ambiguous.push({ record_type: 'validation_case', record_id: record.case_id, reason: 'explicitly unresolved test case', data_status: TEST_MARKER });
    else accept('validation_case', record, 'expected valid case');
  }

  const dedupe = records => records.filter((record, index, all) => all.findIndex(other => JSON.stringify(other) === JSON.stringify(record)) === index);
  const rejectedKeys = new Set(rejected.map(record => `${record.record_type}:${record.record_id || ''}`));
  const finalAccepted = dedupe(accepted).filter(record => !rejectedKeys.has(`${record.record_type}:${record.record_id || ''}`));
  const finalRejected = dedupe(rejected);
  const finalAmbiguous = dedupe(ambiguous);
  return {
    accepted: finalAccepted,
    rejected: finalRejected,
    ambiguous: finalAmbiguous,
    summary: {
      data_status: TEST_MARKER,
      authoritative: false,
      source: 'location-test-fixtures.json',
      accepted_count: finalAccepted.length,
      rejected_count: finalRejected.length,
      ambiguous_count: finalAmbiguous.length,
      checks: ['India-only six-digit PIN formats','duplicate source IDs','duplicate locations','state/district relationships','settlement/district relationships','locality relationships','post-office/PIN relationships','inactive/merged target/cycle constraints','ambiguous legacy Kota mappings','synthetic non-authoritative input']
    }
  };
}

function writeReports(result, reportDir = defaultReportDir) {
  fs.mkdirSync(reportDir, { recursive: true });
  const files = {
    'accepted-records.json': result.accepted,
    'rejected-records.json': result.rejected,
    'ambiguous-records.json': result.ambiguous,
    'import-summary.json': result.summary
  };
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(reportDir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return Object.keys(files).map(name => path.join(reportDir, name));
}

if (require.main === module) {
  const fixture = loadFixture(process.argv[2] || defaultFixture);
  const result = validate(fixture);
  const files = writeReports(result, process.argv[3] || defaultReportDir);
  console.log(JSON.stringify({ files, summary: result.summary }, null, 2));
}

module.exports = { loadFixture, validate, writeReports, PIN_PATTERN, TEST_MARKER };

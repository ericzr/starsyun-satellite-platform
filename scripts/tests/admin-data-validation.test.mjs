import test from 'node:test';
import assert from 'node:assert/strict';
import { readAllAdminPages, validateAdminRows } from '../lib/admin-data-validation.mjs';
function row(id, level, parent, name, country = 'CHN') {
  return { id, level, parent_id: parent, country_iso3: country, name_en: name,
    name_local: {}, bbox: [100, 30, 110, 40], source_version: 'test' };
}
function chinaFixture() {
  return [row('chn', 0, null, '中国'), row('tw', 1, 'chn', '台湾省'), row('im', 1, 'chn', '内蒙古自治区'),
    ...['呼和浩特市', '包头市', '呼伦贝尔市', '兴安盟', '通辽市', '赤峰市', '锡林郭勒盟', '乌兰察布市', '鄂尔多斯市', '巴彦淖尔市', '乌海市', '阿拉善盟'].map((name, i) => row(`city-${i}`, 2, 'im', name)),
    row('dalat', 3, 'city-8', '达拉特旗')];
}
test('empty countries cannot pass a zero-count audit', () => {
  assert.match(validateAdminRows([], { country: 'ARE' }).failures.join('\n'), /no active records/u);
});
test('missing levels are explicit and only required depths block a country', () => {
  const rows = [row('are', 0, null, 'UAE', 'ARE'), row('dubai', 1, 'are', 'Dubai', 'ARE')];
  assert.deepEqual(validateAdminRows(rows, { country: 'ARE' }).failures, []);
  assert.match(validateAdminRows(rows, { country: 'ARE', requiredLevels: [0, 1, 2] }).failures.join('\n'), /required ADM2/u);
});
test('localized CHN canary passes without claiming national completeness', () => {
  assert.deepEqual(validateAdminRows(chinaFixture(), { country: 'CHN', requiredLevels: [0, 1, 2, 3] }).failures, []);
});
test('valid foreign keys cannot hide a county mixed into ADM2', () => {
  const rows = chinaFixture();
  Object.assign(rows.find((r) => r.id === 'dalat'), { level: 2, parent_id: 'im' });
  const errors = validateAdminRows(rows, { country: 'CHN', requiredLevels: [0, 1, 2, 3] }).failures.join('\n');
  assert.match(errors, /12 prefecture-level children.*13/u);
  assert.match(errors, /Dalat Banner ADM3/u);
});
test('missing Ordos is caught even with twelve nominal ADM2 children', () => {
  const rows = chinaFixture();
  rows.find((r) => r.id === 'city-8').name_en = '东胜区';
  assert.match(validateAdminRows(rows, { country: 'CHN' }).failures.join('\n'), /鄂尔多斯市/u);
});
test('Chinese audit rejects untranslated pinyin and accepts zh-Hans labels', () => {
  const rows = chinaFixture();
  rows.find((r) => r.id === 'dalat').name_en = 'Dalateqi';
  assert.match(validateAdminRows(rows, { country: 'CHN' }).failures.join('\n'), /ADM3: 1 records lack a Chinese/u);
  rows.find((r) => r.id === 'dalat').name_local = { 'zh-Hans': '达拉特旗' };
  assert.deepEqual(validateAdminRows(rows, { country: 'CHN' }).failures, []);
});
test('standalone TWN is checked outside CHN-scoped rows', () => {
  assert.match(validateAdminRows(chinaFixture(), { country: 'CHN', standaloneTaiwanCount: 1 }).failures.join('\n'), /standalone TWN/u);
});
test('missing or cross-level parents fail', () => {
  const rows = chinaFixture();
  rows.find((r) => r.id === 'dalat').parent_id = 'im';
  assert.match(validateAdminRows(rows, { country: 'CHN' }).failures.join('\n'), /wrong parent level/u);
  rows.find((r) => r.id === 'dalat').parent_id = 'absent';
  assert.match(validateAdminRows(rows, { country: 'CHN' }).failures.join('\n'), /parent not found/u);
});
test('count mismatch detects truncated or changing directories', () => {
  const rows = [row('are', 0, null, 'UAE', 'ARE')];
  assert.match(validateAdminRows(rows, { country: 'ARE', counts: { 0: 1, 1: 7, 2: 0, 3: 0 } }).failures.join('\n'), /ADM1 count differs/u);
});
test('pagination follows a smaller upstream cap until an empty page', async () => {
  const input = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(await readAllAdminPages(async (offset) => input.slice(offset, offset + 1)), input);
});
test('pagination fails on repeated pages and on its safety cap', async () => {
  await assert.rejects(readAllAdminPages(async () => [{ id: 'a' }]), /repeated id/u);
  await assert.rejects(readAllAdminPages(async (offset) => [{ id: String(offset) }], { maxRows: 2 }), /exceeds 2/u);
});

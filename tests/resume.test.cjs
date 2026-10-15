const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { extractResume, resumeText } = require('../src/services/resume.cjs');
const { textPdf, textDocx } = require('./fixtures/resume-fixtures.cjs');

test('resume import extracts local TXT, Markdown, PDF and DOCX text', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-resume-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const content = '测试简历：Vue 3 开发工程师，负责组件与业务流程。';
  for (const extension of ['txt', 'md']) {
    const file = path.join(directory, `resume.${extension}`);
    await fs.writeFile(file, '\uFEFF' + content + '\r\n');
    assert.equal(await extractResume(file), content);
  }
  const docx = path.join(directory, 'resume.docx');
  await fs.writeFile(docx, await textDocx(content));
  assert.equal(await extractResume(docx), content);
  const pdf = path.join(directory, 'resume.pdf');
  await fs.writeFile(pdf, textPdf());
  assert.match(await extractResume(pdf), /Synthetic resume: Vue engineer/);
});

test('unreadable, empty, unsupported and oversized resume inputs leave saving to the caller', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-resume-invalid-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  assert.throws(() => resumeText(''), /没有读到/);
  assert.throws(() => resumeText('a'.repeat(16001)), /16000/);
  assert.throws(() => resumeText('invalid\0resume content'), /无效文字/);
  await assert.rejects(extractResume(path.join(directory, 'resume.exe')), /支持/);
  for (const extension of ['pdf', 'docx']) {
    const file = path.join(directory, `broken.${extension}`);
    await fs.writeFile(file, 'invalid content');
    await assert.rejects(extractResume(file), /无法/);
  }
  const invalid = path.join(directory, 'bad.txt');
  await fs.writeFile(invalid, Buffer.from([0xff, 0xfe, 0x80]));
  await assert.rejects(extractResume(invalid), /UTF-8/);
  const big = path.join(directory, 'big.txt');
  await fs.writeFile(big, Buffer.alloc(10 * 1024 * 1024 + 1));
  await assert.rejects(extractResume(big), /10 MB/);
});

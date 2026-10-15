const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const MAX_RESUME_CHARS = 16000;

function resumeText(value) {
  const text = String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  if (!text || text.replace(/\s/g, '').length < 10)
    throw new Error('没有读到有效的简历文字。扫描版 PDF 请先转为文字，或直接粘贴简历内容。');
  if (text.includes('\u0000')) throw new Error('简历文件包含无效文字，请换一个文件或粘贴文字。');
  if (text.length > MAX_RESUME_CHARS)
    throw new Error('简历文字最多 16000 字，请精简内容后重新上传。');
  return text;
}

async function pdfText(bytes) {
  const { PDFParse } = require('pdf-parse');
  // A separate Uint8Array avoids transferring a pooled Node buffer to PDF.js.
  const parser = new PDFParse({ data: Uint8Array.from(bytes), isEvalSupported: false });
  try {
    const info = await parser.getInfo();
    if (info.total > 50) throw new Error('简历 PDF 最多支持 50 页，请精简后上传。');
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractResume(filePath) {
  if (typeof filePath !== 'string') throw new Error('请选择简历文件。');
  const extension = path.extname(filePath).toLowerCase();
  if (!['.txt', '.md', '.pdf', '.docx'].includes(extension))
    throw new Error('支持 PDF、DOCX、TXT 和 Markdown 简历文件。');
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || !stat.size || stat.size > MAX_RESUME_BYTES)
    throw new Error('请选择大小在 10 MB 以内的非空简历文件。');
  const bytes = await fs.readFile(filePath);
  let text;
  if (extension === '.pdf') {
    try {
      text = await pdfText(bytes);
    } catch (error) {
      if (error.message.includes('50 页')) throw error;
      throw new Error('无法提取 PDF 文字。请确认文件未加密，或换成 DOCX、TXT、粘贴简历文字。');
    }
  } else if (extension === '.docx') {
    try {
      const mammoth = require('mammoth');
      text = (await mammoth.extractRawText({ buffer: bytes })).value;
    } catch {
      throw new Error('无法读取 DOCX 简历，请确认文件有效，或换成 PDF、TXT、粘贴简历文字。');
    }
  } else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error('文本文件需要使用 UTF-8 编码，请转换编码后重新上传。');
    }
  }
  return resumeText(text);
}

module.exports = { extractResume, resumeText };

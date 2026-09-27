import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markdownTheme } from '../src/ui/theme.ts'

test('the markdown theme gives each part of a document the terminal theme\'s style for it', () => {
  assert.equal(markdownTheme.heading('x'), '\x1b[1mx\x1b[22m')
  assert.equal(markdownTheme.link('x'), '\x1b[36mx\x1b[39m')
  assert.equal(markdownTheme.linkUrl('x'), '\x1b[2mx\x1b[22m')
  assert.equal(markdownTheme.code('x'), '\x1b[33mx\x1b[39m')
  assert.equal(markdownTheme.codeBlock('x'), 'x')
  assert.equal(markdownTheme.codeBlockBorder('x'), '\x1b[2mx\x1b[22m')
  assert.equal(markdownTheme.quote('x'), '\x1b[2mx\x1b[22m')
  assert.equal(markdownTheme.quoteBorder('x'), '\x1b[2mx\x1b[22m')
  assert.equal(markdownTheme.hr('x'), '\x1b[2mx\x1b[22m')
  assert.equal(markdownTheme.listBullet('x'), '\x1b[36mx\x1b[39m')
  assert.equal(markdownTheme.bold('x'), '\x1b[1mx\x1b[22m')
  assert.equal(markdownTheme.italic('x'), '\x1b[3mx\x1b[23m')
  assert.equal(markdownTheme.underline('x'), '\x1b[4mx\x1b[24m')
  assert.equal(markdownTheme.strikethrough('x'), '\x1b[9mx\x1b[29m')
})

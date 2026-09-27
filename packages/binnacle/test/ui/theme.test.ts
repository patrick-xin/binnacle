import { test } from 'node:test'
import assert from 'node:assert/strict'
import { editorTheme, markdownTheme, marks } from '../../src/ui/theme.ts'

test('each mark is the glyph and tone it has always drawn', () => {
  assert.deepEqual(marks, {
    running: { glyph: '●', tone: 'muted' },
    done: { glyph: '●', tone: 'success' },
    failed: { glyph: '✗', tone: 'error' },
    problem: { glyph: '✗', tone: 'error' },
    prompt: { glyph: '›', tone: 'accent' },
    thinking: { glyph: '∴', tone: 'muted' },
    context: { glyph: '⋯', tone: 'muted' },
    unknown: { glyph: '?', tone: 'muted' },
  })
})

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

test('the composer is framed in dim, its select list accents the chosen row and mutes the rest', () => {
  assert.equal(editorTheme.borderColor('│'), '\x1b[2m│\x1b[22m')
  assert.equal(editorTheme.selectList.selectedPrefix('/'), '\x1b[36m/\x1b[39m')
  assert.equal(editorTheme.selectList.selectedText('run tests'), '\x1b[36mrun tests\x1b[39m')
  assert.equal(editorTheme.selectList.description('what it does'), '\x1b[90mwhat it does\x1b[39m')
  assert.equal(editorTheme.selectList.scrollInfo('↑ 2 more'), '\x1b[90m↑ 2 more\x1b[39m')
  assert.equal(editorTheme.selectList.noMatch('no match'), '\x1b[90mno match\x1b[39m')
})

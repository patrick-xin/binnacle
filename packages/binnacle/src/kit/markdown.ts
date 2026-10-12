import { Lexer } from 'marked'
import type { MarkedToken, Token, Tokens } from 'marked'
import type { Binnacle } from '../api.ts'
import { toPlainText } from '../core/view.ts'
import { visibleWidth } from '../terminal/utils.ts'
import { wrap } from './wrap.ts'

// binnacle's Lexer has no extension, so each token it makes is one of marked's own.
const own = (token: Token): MarkedToken => token as MarkedToken

/** What each block's Look is given beside what it draws. */
export interface MarkdownAt {
  readonly width: number
}

/** The Look `markdown.heading`: a heading's lines, given its inline text drawn, with no `#`. */
export type MarkdownHeadingLook = (text: string, at: MarkdownAt & { readonly depth: number }) => string[]

/** The Look `markdown.paragraph`: a paragraph's lines, given its inline text drawn. */
export type MarkdownParagraphLook = (text: string, at: MarkdownAt) => string[]

/** The Look `markdown.code`: a code block's lines, given its lines made plain and its language, `''` with none. */
export type MarkdownCodeLook = (lines: readonly string[], at: MarkdownAt & { readonly lang: string }) => string[]

/** Where an item stands in its list, as `markdown.item` is given it. */
export interface MarkdownItemAt extends MarkdownAt {
  /** The marker the default draws: `• `, or `<number>. ` in an ordered list. Its blocks were drawn at the width less its width. */
  readonly marker: string
  readonly ordered: boolean
  /** The item's number, counted from the list's start, or from 1 in a list that is not ordered. */
  readonly number: number
}

/** The Look `markdown.item`: a list item's lines, given its blocks' lines. */
export type MarkdownItemLook = (lines: readonly string[], at: MarkdownItemAt) => string[]

/** The Look `markdown.quote`: a quote's lines, given its blocks' lines, drawn at the width less two. */
export type MarkdownQuoteLook = (lines: readonly string[], at: MarkdownAt) => string[]

/** The Look `markdown.rule`: a rule's lines. */
export type MarkdownRuleLook = (at: MarkdownAt) => string[]

// A text's own line breaks are kept, as making it plain takes them out with the other controls.
const plain = (text: string): string =>
  text
    .split(/\r\n|\r|\n/)
    .map(toPlainText)
    .join('\n')

const source = (token: Token): string => plain(token.raw.replace(/\n+$/, ''))

const wrapped: MarkdownParagraphLook = (text, { width }) => wrap(text, width)

const listItem: MarkdownItemLook = (lines, { marker }) => {
  const rest = ' '.repeat(visibleWidth(marker))
  return lines.length === 0 ? [marker] : lines.map((line, at) => (at === 0 ? marker : rest) + line)
}

function defaults(binnacle: Binnacle) {
  const paint = binnacle.paint.bind(binnacle)
  const heading: MarkdownHeadingLook = (text, { width }) => wrap(text, width).map((line) => paint('heading', line))
  const code: MarkdownCodeLook = (lines, { width }) =>
    lines.flatMap((line) => wrap(line, width, { first: '  ' })).map((line) => paint('code', line))
  const quote: MarkdownQuoteLook = (lines) => lines.map((line) => paint('muted', `│ ${line}`))
  const rule: MarkdownRuleLook = ({ width }) => [paint('border', binnacle.tokens.glyphs.rule.repeat(width))]
  return { heading, paragraph: wrapped, code, item: listItem, quote, rule }
}

/** The lines of a markdown text, Untrusted Text, wrapped at `width`. Each block draws through its Look, `markdown.<block>`. */
export function markdown(binnacle: Binnacle, text: string, width: number): string[] {
  const fallback = defaults(binnacle)
  const looks = {
    heading: binnacle.lookOf<MarkdownHeadingLook>(['markdown.heading'], fallback.heading),
    paragraph: binnacle.lookOf<MarkdownParagraphLook>(['markdown.paragraph'], fallback.paragraph),
    code: binnacle.lookOf<MarkdownCodeLook>(['markdown.code'], fallback.code),
    item: binnacle.lookOf<MarkdownItemLook>(['markdown.item'], fallback.item),
    quote: binnacle.lookOf<MarkdownQuoteLook>(['markdown.quote'], fallback.quote),
    rule: binnacle.lookOf<MarkdownRuleLook>(['markdown.rule'], fallback.rule),
  }

  const inline = (tokens: readonly Token[]): string => tokens.map(inlineOf).join('')
  const inlineOf = (token: Token): string => {
    const known = own(token)
    switch (known.type) {
      case 'text':
        return known.tokens !== undefined && known.tokens.length > 0 ? inline(known.tokens) : plain(known.text)
      case 'escape':
        return plain(known.text)
      case 'strong':
        return `\x1b[1m${inline(known.tokens ?? [])}\x1b[22m`
      case 'em':
        return `\x1b[3m${inline(known.tokens ?? [])}\x1b[23m`
      case 'codespan':
        return binnacle.paint('code', plain(known.text))
      case 'br':
        return '\n'
      case 'link': {
        const { href } = known
        const drawn = binnacle.paint('link', inline(known.tokens ?? []))
        return known.text === href ? drawn : `${drawn} (${plain(href)})`
      }
      default:
        return source(token)
    }
  }

  const blocks = (tokens: readonly Token[], at: number, apart: boolean): string[] => {
    const drawn: string[][] = []
    let checkbox = ''
    for (const token of tokens) {
      if (token.type === 'space') continue
      // A task's box is a token before its text, and draws as its source at the start of the text, so it counts toward the wrap.
      if (token.type === 'checkbox') {
        checkbox = plain(token.raw)
        continue
      }
      const lines = block(token, at, checkbox)
      checkbox = ''
      if (lines.length === 0) continue
      drawn.push(lines)
    }
    return drawn.flatMap((lines, index) => (index > 0 && apart ? ['', ...lines] : lines))
  }

  const block = (token: Token, at: number, lead = ''): string[] => {
    const where = { width: at }
    const known = own(token)
    switch (known.type) {
      case 'heading':
        return looks.heading(inline(known.tokens ?? []), { ...where, depth: known.depth })
      case 'paragraph':
      case 'text':
        return looks.paragraph(
          lead + inline(known.tokens ?? [{ type: 'text', raw: known.raw, text: known.text } satisfies Tokens.Text]),
          where,
        )
      case 'code':
        return looks.code(plain(known.text).split('\n'), { ...where, lang: plain(known.lang ?? '') })
      case 'blockquote':
        return looks.quote(blocks(known.tokens ?? [], Math.max(1, at - 2), true), where)
      case 'hr':
        return looks.rule(where)
      case 'list':
        return list(known, at)
      default:
        return looks.paragraph(source(token), where)
    }
  }

  const list = (token: Tokens.List, at: number): string[] => {
    const start = typeof token.start === 'number' ? token.start : 1
    return token.items.flatMap((item, index) => {
      const number = token.ordered ? start + index : index + 1
      const marker = token.ordered ? `${number}. ` : '• '
      const inner = blocks(item.tokens, Math.max(1, at - visibleWidth(marker)), token.loose)
      return looks.item(inner, { width: at, marker, ordered: token.ordered, number })
    })
  }

  return blocks(new Lexer().lex(text), width, true)
}

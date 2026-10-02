/**
 * The host's theme-file grant: a file in the profile's themes directory,
 * handed to a plugin as parsed JSON now and again on every change, watched
 * on the real filesystem against a real temporary profile directory.
 * @module binnacle/test/host/theme-file
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { RegistrationService } from '../../src/host/registrations.ts'
import { FakeClock } from '../support/clock.ts'

/** A profile directory, as dsh's launcher hands the host its own. */
const profile = (): string => mkdtempSync(join(tmpdir(), 'binnacle-theme-'))

/** The themes directory of a profile, with one file written in it. */
const written = (dir: string, name: string, text: string): void => {
  mkdirSync(join(dir, 'themes'), { recursive: true })
  writeFileSync(join(dir, 'themes', `${name}.json`), text)
}

/** Let a watch event land on the event loop. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10))

/**
 * Wait until something holds on a fake clock: let watch events land, passing the grant's window each time.
 * @param clock - the clock the grant coalesces by.
 * @param holds - the condition.
 * @throws when it does not hold within ten seconds.
 */
async function arrives(clock: FakeClock, holds: () => boolean): Promise<void> {
  const deadline = Date.now() + 10_000
  while (!holds()) {
    if (Date.now() > deadline) throw new Error('did not hold within 10,000 ms')
    await settle()
    clock.advance(50)
  }
}

/** Pass the grant's window a few times over real time, asserting nothing of what lands. */
async function passes(clock: FakeClock, times = 10): Promise<void> {
  for (let each = 0; each < times; each++) {
    await settle()
    clock.advance(50)
  }
}

/**
 * The grant on a real context whose profile is a real temporary directory, and a way to read one file through it as a plugin does.
 * @param dir - the profile's directory; undefined when no profile is loaded.
 * @param clock - the clock the grant coalesces by.
 * @returns the context, the registrations, the clock, and a plugin that reads one file.
 */
function grant(dir: string | undefined, clock = new FakeClock()) {
  const ctx = new Context()
  if (dir !== undefined) ctx.provide('profileContext', { dir } as never)
  const registrations = new RegistrationService(ctx, clock)
  const read = async (name: string, listener: (data: unknown) => void) => {
    const fiber = ctx.plugin({
      name: 'author',
      inject: ['binnacle'],
      apply: (author: Context) => {
        author.binnacle.themeFile(name, listener)
      },
    })
    await fiber
    return fiber
  }
  return { ctx, registrations, clock, read }
}

test('a file that is there is handed over as parsed JSON before the call returns, with no turn of the event loop between', async () => {
  const dir = profile()
  written(dir, 'x', '{"tones":{"accent":{"color":"red"}}}')
  const handed: unknown[] = []
  let withinTheCall = false
  const { ctx } = grant(dir)
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      author.binnacle.themeFile('x', (data) => {
        handed.push(data)
      })
      withinTheCall = handed.length === 1
    },
  })
  assert.equal(withinTheCall, true, 'the hand-over happened inside the call, before anything is awaited')
  assert.deepEqual(handed, [{ tones: { accent: { color: 'red' } } }])
})

test('writing the file again hands the new JSON over once the window passes', async () => {
  const dir = profile()
  written(dir, 'x', '{"marks":{"prompt":{"glyph":">"}}}')
  const handed: unknown[] = []
  const clock = new FakeClock()
  const { read } = grant(dir, clock)
  await read('x', (data) => {
    handed.push(data)
  })
  writeFileSync(join(dir, 'themes', 'x.json'), '{"marks":{"prompt":{"glyph":"»"}}}')
  await arrives(clock, () => handed.length === 2)
  assert.deepEqual(handed, [{ marks: { prompt: { glyph: '>' } } }, { marks: { prompt: { glyph: '»' } } }])
})

test('text equal to the last handed over is not handed over again', async () => {
  const dir = profile()
  written(dir, 'x', '{"spacing":{"gap":1}}')
  const handed: unknown[] = []
  const clock = new FakeClock()
  const { read } = grant(dir, clock)
  await read('x', (data) => {
    handed.push(data)
  })
  writeFileSync(join(dir, 'themes', 'x.json'), '{"spacing":{"gap":1}}')
  await passes(clock)
  assert.deepEqual(handed, [{ spacing: { gap: 1 } }])
})

test('writes within one window are coalesced into a single hand-over of the last text', async () => {
  const dir = profile()
  written(dir, 'x', '{"spacing":{"gap":1}}')
  const handed: unknown[] = []
  const clock = new FakeClock()
  const { read } = grant(dir, clock)
  await read('x', (data) => {
    handed.push(data)
  })
  writeFileSync(join(dir, 'themes', 'x.json'), '{"spacing":{"gap":2}}')
  await settle()
  writeFileSync(join(dir, 'themes', 'x.json'), '{"spacing":{"gap":3}}')
  await settle()
  assert.equal(handed.length, 1, 'nothing is handed over before the window passes')
  await arrives(clock, () => handed.length === 2)
  assert.deepEqual(
    handed.map((data) => (data as { spacing: { gap: number } }).spacing.gap),
    [1, 3],
    'the second write’s text alone, never the first’s',
  )
})

test('text that is not JSON raises a notice naming the file’s path, and nothing is handed over', async () => {
  const dir = profile()
  written(dir, 'x', '{"spacing":{"gap":1}}')
  const handed: unknown[] = []
  const clock = new FakeClock()
  const { registrations, read } = grant(dir, clock)
  await read('x', (data) => {
    handed.push(data)
  })
  const notices: string[] = []
  registrations.notices((text) => notices.push(text))
  writeFileSync(join(dir, 'themes', 'x.json'), '{oops')
  await arrives(clock, () => notices.length === 1)
  assert.deepEqual(handed, [{ spacing: { gap: 1 } }], 'what was handed over before stays')
  assert.match(notices.join('\n'), new RegExp(`binnacle\\.themeFile: .*/themes/x\\.json is not JSON`))
})

test('a file that is missing when it is read raises a notice naming its path, shown once a sink stands', async () => {
  const dir = profile()
  const handed: unknown[] = []
  const { registrations, read } = grant(dir)
  await read('x', (data) => {
    handed.push(data)
  })
  assert.deepEqual(handed, [], 'nothing is handed over')
  const notices: string[] = []
  registrations.notices((text) => notices.push(text))
  assert.equal(notices.length, 1)
  assert.match(notices.join('\n'), /binnacle\.themeFile: .*\/themes\/x\.json cannot be read/)
})

test('removing the file raises a notice naming its path, and what was handed over stays', async () => {
  const dir = profile()
  written(dir, 'x', '{"spacing":{"gap":1}}')
  const handed: unknown[] = []
  const clock = new FakeClock()
  const { registrations, read } = grant(dir, clock)
  await read('x', (data) => {
    handed.push(data)
  })
  const notices: string[] = []
  registrations.notices((text) => notices.push(text))
  rmSync(join(dir, 'themes', 'x.json'))
  await arrives(clock, () => notices.length === 1)
  assert.deepEqual(handed, [{ spacing: { gap: 1 } }], 'what was handed over before stays')
  assert.match(notices.join('\n'), /binnacle\.themeFile: .*\/themes\/x\.json cannot be read/)
})

test('a listener that throws is raised as a notice naming the path and the throw’s message', async () => {
  const dir = profile()
  written(dir, 'x', '{"spacing":{"gap":1}}')
  const { registrations, read } = grant(dir)
  const notices: string[] = []
  registrations.notices((text) => notices.push(text))
  await read('x', () => {
    throw new Error('the reader refused it')
  })
  assert.equal(notices.length, 1)
  assert.match(notices.join('\n'), /binnacle\.themeFile: .*\/themes\/x\.json was handed to a reader that threw: the reader refused it/)
})

test('with no profile loaded, the grant raises a notice naming the file, and hands nothing over', async () => {
  const handed: unknown[] = []
  const { registrations, read } = grant(undefined)
  await read('x', (data) => {
    handed.push(data)
  })
  assert.deepEqual(handed, [])
  const notices: string[] = []
  registrations.notices((text) => notices.push(text))
  assert.deepEqual(notices, ['binnacle.themeFile: no profile is loaded to read themes/x.json from'])
})

test('a name that is not a plain file name throws at the call, saying what to change', async () => {
  const dir = profile()
  const { read } = grant(dir)
  for (const name of ['', 'a/b', 'a\\b', 'a..b', '../x']) {
    await assert.rejects(
      read(name, () => {}),
      /binnacle\.themeFile: .* is not a plain file name; name a file in the profile's themes directory, as x for themes\/x\.json/,
      name,
    )
  }
})

test('disposing the grant cancels its reread and any read still waiting out its window', async () => {
  const dir = profile()
  written(dir, 'x', '{"spacing":{"gap":1}}')
  const handed: unknown[] = []
  const clock = new FakeClock()
  const ctx = new Context()
  ctx.provide('profileContext', { dir } as never)
  const registrations = new RegistrationService(ctx, clock)
  const notices: string[] = []
  registrations.notices((text) => notices.push(text))
  let close: (() => void) | undefined
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      close = author.binnacle.themeFile('x', (data) => {
        handed.push(data)
      })
    },
  })
  writeFileSync(join(dir, 'themes', 'x.json'), '{"spacing":{"gap":2}}')
  await settle()
  close?.()
  for (let each = 0; each < 20; each++) {
    clock.advance(1_000)
    clock.advance(50)
  }
  assert.deepEqual(handed, [{ spacing: { gap: 1 } }])
  assert.deepEqual(notices, [])
})

test('a change fs.watch never reports is still seen: the reread hands it over', async () => {
  const dir = profile()
  const handed: unknown[] = []
  const clock = new FakeClock()
  const { read } = grant(dir, clock)
  await read('x', (data) => {
    handed.push(data)
  })
  // The replay a fresh watch reports is drained first, so only the reread can hand the write over.
  clock.advance(50)
  writeFileSync(join(dir, 'themes', 'x.json'), '{"spacing":{"gap":1}}')
  // No turn of the event loop is given after the write: fs.watch cannot have reported it.
  clock.advance(1_000)
  clock.advance(50)
  assert.deepEqual(handed, [{ spacing: { gap: 1 } }])
})

test('a file restored to the text it last handed over ends the standing problem: a removal after it is raised again', async () => {
  const dir = profile()
  written(dir, 'x', '{"spacing":{"gap":1}}')
  const handed: unknown[] = []
  const clock = new FakeClock()
  const { registrations, read } = grant(dir, clock)
  await read('x', (data) => {
    handed.push(data)
  })
  const notices: string[] = []
  registrations.notices((text) => notices.push(text))
  rmSync(join(dir, 'themes', 'x.json'))
  await arrives(clock, () => notices.length === 1)
  writeFileSync(join(dir, 'themes', 'x.json'), '{"spacing":{"gap":1}}')
  await passes(clock, 40)
  assert.deepEqual(handed, [{ spacing: { gap: 1 } }], 'text equal to the last handed over is not handed over again')
  assert.equal(notices.length, 1, 'the restored file says nothing')
  rmSync(join(dir, 'themes', 'x.json'))
  await arrives(clock, () => notices.length === 2)
  assert.match(notices[1] ?? '', /cannot be read/)
})

test('a problem that stands is raised once, and raised again only once the file was read in between', async () => {
  const dir = profile()
  const handed: unknown[] = []
  const clock = new FakeClock()
  const { registrations, read } = grant(dir, clock)
  const notices: string[] = []
  registrations.notices((text) => notices.push(text))
  await read('x', (data) => {
    handed.push(data)
  })
  await passes(clock, 40)
  assert.equal(notices.length, 1, 'a problem that stands is not raised again')
  writeFileSync(join(dir, 'themes', 'x.json'), '{"spacing":{"gap":1}}')
  await arrives(clock, () => handed.length === 1)
  rmSync(join(dir, 'themes', 'x.json'))
  await arrives(clock, () => notices.length === 2)
  assert.match(notices[1] ?? '', /cannot be read/)
})

test('the disposer the grant returns closes the watch: a write after it hands nothing over', async () => {
  const dir = profile()
  written(dir, 'x', '{"spacing":{"gap":1}}')
  const handed: unknown[] = []
  const clock = new FakeClock()
  const ctx = new Context()
  ctx.provide('profileContext', { dir } as never)
  const registrations = new RegistrationService(ctx, clock)
  const notices: string[] = []
  registrations.notices((text) => notices.push(text))
  let close: (() => void) | undefined
  await ctx.plugin({
    name: 'author',
    inject: ['binnacle'],
    apply: (author: Context) => {
      close = author.binnacle.themeFile('x', (data) => {
        handed.push(data)
      })
    },
  })
  close?.()
  writeFileSync(join(dir, 'themes', 'x.json'), '{"spacing":{"gap":2}}')
  await passes(clock)
  assert.deepEqual(handed, [{ spacing: { gap: 1 } }])
  assert.deepEqual(notices, [], 'a closed watch says nothing either')
})

test('a file written only after the grant is read is handed over when it lands', async () => {
  const dir = profile()
  const handed: unknown[] = []
  const clock = new FakeClock()
  const { read } = grant(dir, clock)
  await read('x', (data) => {
    handed.push(data)
  })
  assert.deepEqual(handed, [], 'nothing is handed over while the file is not there')
  writeFileSync(join(dir, 'themes', 'x.json'), '{"spacing":{"gap":1}}')
  await arrives(clock, () => handed.length === 1)
  assert.deepEqual(handed, [{ spacing: { gap: 1 } }])
})

test('the reading plugin’s fiber closes the watch: a write after it hands nothing over', async () => {
  const dir = profile()
  written(dir, 'x', '{"spacing":{"gap":1}}')
  const handed: unknown[] = []
  const clock = new FakeClock()
  const { read } = grant(dir, clock)
  const fiber = await read('x', (data) => {
    handed.push(data)
  })
  await fiber.dispose()
  writeFileSync(join(dir, 'themes', 'x.json'), '{"spacing":{"gap":2}}')
  await passes(clock)
  assert.deepEqual(handed, [{ spacing: { gap: 1 } }])
})

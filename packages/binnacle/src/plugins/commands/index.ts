import type { Context } from '@deepseek-ai/cordis'
import type { CommandDescriptor } from '@deepseek-ai/dsh-commands/types'
import { createModel, fuzzy, list, truncateToWidth } from '../../index.ts'
import type { Layout, ListItem, ListRow } from '../../index.ts'
import type { ComposerState } from '../composer/index.ts'

export const name = 'binnacle-commands'

export const inject = ['binnacle'] satisfies (keyof Context)[]

/** A command as the offer shows it. */
export interface CommandItem extends ListItem {
  /** The command's name, without its `/`: the draft above the offer shows the `/`. */
  readonly label: string
  readonly description: string
  readonly name: string
  /** The command's input hint, or `undefined` when it takes no input. */
  readonly hint: string | undefined
}

/** The Look `commands.list.row`: how one command of the offer is drawn. */
export type CommandRow = ListRow<CommandItem>

/** The state of the model `commands`: whether the offer is open, and what its commands are matched against. `items` are the commands that match, read from dsh at each read. */
export interface CommandsState {
  open: boolean
  query: string
  readonly items: readonly CommandItem[]
}

const deepFrozen = <T extends object>(value: T): T => {
  for (const inner of Object.values(value)) if (typeof inner === 'object' && inner !== null) deepFrozen(inner)
  return Object.freeze(value)
}

/** The Layout `commands`: the List `commands.list`, at most 8 rows under a rule in the `border` Tone. Frozen, as an author builds on it. */
export const COMMANDS_LAYOUT: Layout & { readonly place: string } = deepFrozen({
  place: 'commands.list',
  size: { most: 9 },
  border: ['top'],
})

const LIST = 'commands.list'
const INPUT = 'composer.input'
// A name is dsh's registry's: letters, digits, `_` and `-`. An empty one offers every command.
const OFFERED = /^\/([\w-]*)$/

const itemOf = (command: CommandDescriptor): CommandItem => ({
  label: command.name,
  description: command.description,
  name: command.name,
  hint: command.input?.hint,
})

export function apply(ctx: Context): void {
  const { binnacle } = ctx
  const composer = binnacle.modelOf<ComposerState>('composer')
  const model = createModel<CommandsState>({
    open: false,
    query: '',
    get items() {
      const agent = ctx.get('binnacleSession')?.agent
      const commands = ctx.get('commands')
      if (agent === undefined || commands === undefined) return []
      return fuzzy(this.query, commands.list(agent), (command) => command.name).map(itemOf)
    },
  })
  binnacle.model('commands', model)

  const offer = list<CommandItem>(binnacle, {
    name: LIST,
    models: [model],
    keysIn: INPUT,
    key: () => model.state.query,
    items: () => (model.state.open ? model.state.items : []),
    pick: (index) => {
      offer.model.set((state) => (state.mark = index))
      binnacle.run('commands.pick')
    },
  })
  ctx.on('commands/change', () => offer.handle.redraw())
  // A command's row stays one line, so the offer's rows are its commands. A Request's Choice wraps instead, to be read whole.
  binnacle.look<CommandRow>(
    `${LIST}.row`,
    (beneath) => (item, at) => truncateToWidth(beneath(item, at), at.width, binnacle.tokens.glyphs.more),
  )

  const drawn = (): boolean => (binnacle.linesShown(LIST) ?? 0) > 0
  const marked = (): CommandItem | undefined => model.state.items[offer.model.state.mark]
  const setDraft = (text: string): void => composer.set((state) => (state.text = text))
  // Esc and tab are the offer's only while it is drawn. But the row also closes an offer that draws nothing, such as one that matches no command.
  let rowCloses = false
  const close = (): void => {
    if (!model.state.open) return
    rowCloses = true
    try {
      binnacle.run('commands.close')
    } finally {
      rowCloses = false
    }
  }

  binnacle.action('commands.open', {
    keys: [],
    description: 'Open the offer of commands',
    run: () =>
      model.set((state) => {
        state.open = true
        state.query = ''
      }),
  })
  binnacle.action('commands.close', {
    keys: ['escape'],
    place: INPUT,
    first: true,
    enabled: () => rowCloses || drawn(),
    description: 'Close the offer of commands, and keep the draft',
    run: () => model.set((state) => (state.open = false)),
  })
  binnacle.action('commands.pick', {
    keys: [],
    description: 'Run the marked command, or put it in the draft for its input',
    run: () => {
      const item = marked()
      if (item === undefined) return
      if (item.hint === undefined) {
        setDraft(`/${item.name}`)
        binnacle.run('composer.send')
      } else setDraft(`/${item.name} `)
      close()
    },
  })
  binnacle.action('commands.complete', {
    keys: ['tab'],
    place: INPUT,
    first: true,
    enabled: drawn,
    description: 'Put the marked command in the draft',
    run: () => {
      const item = marked()
      if (item !== undefined) setDraft(`/${item.name} `)
      close()
    },
  })

  binnacle.layout('commands', COMMANDS_LAYOUT)
  binnacle.edit('chat', { insert: { layout: 'commands', size: 'content', unless: 'request' }, before: 'composer' })

  // The row acts on a change of the draft. So an offer closed with esc stays closed until the person types, and one that an author opens stays open.
  let seen = ''
  let offered = false
  const follow = (): void => {
    const draft = composer.state
    if (draft === undefined) return
    const changed = draft.text !== seen
    seen = draft.text
    const query = OFFERED.exec(draft.text)?.[1]
    const was = offered
    offered = query !== undefined
    // Running stays the composer's: while a command runs, the offer can change no draft.
    if (draft.running) return close()
    if (!changed) return
    if (query === undefined) {
      if (was) close()
      return
    }
    if (!model.state.open) binnacle.run('commands.open')
    model.set((state) => (state.query = query))
  }
  ctx.effect(() => composer.watch(follow), 'binnacle-commands: the draft opens and closes the offer')
}

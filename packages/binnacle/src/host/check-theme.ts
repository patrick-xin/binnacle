import { readFileSync } from 'node:fs'
import { changes } from '../plugins/theme/read.ts'
import { parseThemeChanges } from '../ui/theme-changes.ts'
import { binnacleTheme } from '../ui/theme.ts'

const [file] = process.argv.slice(2)
if (file === undefined) {
  console.log('usage: node check-theme.js <theme file>')
  process.exitCode = 1
} else {
  try {
    // The row's translation first, then the parser: the same reading a registered file gets.
    parseThemeChanges(changes(JSON.parse(readFileSync(file, 'utf8'))), binnacleTheme)
    console.log('ok')
  } catch (error) {
    console.log(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

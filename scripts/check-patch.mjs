#!/usr/bin/env node
/**
 * Hold every row this bundle's patch names to the tree it lands on.
 *
 * A profile composes its bundles' patches in order over an empty root, and a
 * patch naming a row no earlier layer composed is skipped with a warning on
 * stderr; the process boots without it. This composes the profile
 * `pnpm dsh:profile` writes — dsh-base's patch at the dsh pin, then this
 * bundle's — read with dsh's `entryListSchema` and applied by dsh's own
 * `applyEntryPatches`, and makes every warning a failure.
 * @module binnacle/scripts/check-patch
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyEntryPatches, entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { bundlePatchFiles } from '@deepseek-ai/dsh-app-boot'
import { load } from 'js-yaml'
import { profileFiles } from './profile.mjs'

/**
 * Compose patch layers over an empty root, as a profile does.
 * @param {{ name: string, text: string }[]} layers - each bundle's patch, bottom first.
 * @returns {string[]} one line per patch entry dsh would skip, naming its layer.
 */
export function checkPatch(layers) {
  const problems = []
  let tree = []
  for (const layer of layers) {
    const warn = (message, ...args) => {
      problems.push(`${layer.name}: ${message.replace(/%C/g, () => `'${args.shift()}'`)}`)
    }
    tree = applyEntryPatches(tree, load(layer.text, { schema: entryListSchema }) ?? [], warn)
  }
  return problems
}

/**
 * The patch files a bundle declares, read as dsh's own launcher reads them
 * (`bundlePatchFiles`, `dsh:packages/boot/app-boot/src/profile.ts`); a package
 * that declares no bundle at all contributes no layer.
 * @param {any} manifest - the bundle's parsed package.json.
 * @returns {string[]} the package-relative patch file paths in application order.
 * @throws {Error} when `patch` is neither a string nor a list of strings, as the loader refuses it.
 */
export function patchFilesOf(manifest) {
  const bundle = manifest.dsh?.bundle
  if (bundle === undefined) return []
  return bundlePatchFiles(bundle)
}

/**
 * Find a package in a checkout by name.
 * @param {string} root - the checkout.
 * @param {string} name - the package name.
 * @returns {string | undefined} its directory, or undefined when no `packages/<group>/<dir>` holds it.
 */
function findPackage(root, name) {
  const packages = join(root, 'packages')
  if (!existsSync(packages)) return undefined
  for (const group of readdirSync(packages, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    for (const dir of readdirSync(join(packages, group.name), { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      const manifest = join(packages, group.name, dir.name, 'package.json')
      if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === name) return dirname(manifest)
    }
  }
  return undefined
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const bundle = join(root, 'packages', 'binnacle')
  const { bundles } = JSON.parse(profileFiles(bundle)['package.json']).dsh.profile
  const layers = []
  const problems = []
  for (const name of bundles) {
    const dir = name === 'binnacle' ? bundle : findPackage(join(root, '.refs', 'dsh'), name)
    if (dir === undefined) {
      problems.push(`${name}: not found in the dsh reference; run \`pnpm refs\``)
      continue
    }
    for (const file of patchFilesOf(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')))) {
      if (!existsSync(join(dir, file))) {
        problems.push(`${name}: ${file} is declared in dsh.bundle.patch but not shipped`)
        continue
      }
      layers.push({ name: `${name} ${file}`, text: readFileSync(join(dir, file), 'utf8') })
    }
  }
  if (problems.length === 0) problems.push(...checkPatch(layers))
  for (const problem of problems) console.error(problem)
  console.log(
    problems.length === 0
      ? `check-patch: ok (${layers.map((layer) => layer.name).join(' → ')})`
      : `check-patch: ${problems.length} problems`,
  )
  process.exitCode = problems.length === 0 ? 0 : 1
}

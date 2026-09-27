#!/usr/bin/env node
/**
 * Create or refresh the `binnacle` dsh profile on this machine.
 *
 * The profile lives under `$DSH_HOME/profiles/binnacle` (`~/.dsh` when
 * `DSH_HOME` is unset). It links this checkout's package and stacks it over
 * `dsh-base`, so `dsh --profile binnacle` runs what `pnpm build` last built.
 * `package.json` and `cordis.yml` are this script's and rewritten each run;
 * `cordis.patch.yml` is the person's own layer — model, provider, anything
 * they override — and is written only when absent. Run from a linked
 * worktree, it refuses: a profile made there breaks when the worktree goes,
 * so it names the main checkout to run from and writes nothing.
 * @module binnacle/scripts/profile
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The files a profile over a package at a path is made of.
 * @param {string} bundleDir - the absolute path of the package to link.
 * @returns {Record<string, string>} each file's name in the profile and its text.
 */
export function profileFiles(bundleDir) {
  const manifest = {
    name: 'dsh-profile-binnacle',
    version: '0.0.0',
    private: true,
    dependencies: { binnacle: `link:${bundleDir}` },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'binnacle'] } },
  }
  return {
    'package.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'cordis.yml': '# The profile root: an empty entry list. The tree is the bundles in\n# package.json, then cordis.patch.yml. Edit cordis.patch.yml, not this file.\n[]\n',
    'cordis.patch.yml': '# Your layer over binnacle: model, provider, anything you override.\n# A YAML list of patch entries, applied after every bundle.\n[]\n',
  }
}

/**
 * The main checkout a directory belongs to, read from git's own list: the
 * main worktree is the first `git worktree list --porcelain` names. Both
 * paths are read canonically, so a symlinked route to either never makes a
 * main checkout look like a linked one.
 * @param {string} root - the checkout to place.
 * @returns {string | null} the main checkout's path, when git knows `root` as a linked worktree of one; null when it does not.
 */
function mainCheckout(root) {
  let listed
  try {
    listed = execFileSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' })
  } catch {
    // Git that cannot speak for the directory — no repository, or no git — cannot know it as a linked worktree; it stands as the main checkout.
    return null
  }
  const main = listed.split('\n').find(line => line.startsWith('worktree '))?.slice('worktree '.length)
  if (main === undefined || realpathSync(root) === realpathSync(main)) return null
  return realpathSync(main)
}

/**
 * Write the profile for a checkout, or refuse it.
 * @param {string} root - the checkout the profile would link.
 * @param {string} profile - the profile directory to write.
 * @returns {void} nothing; the profile's files are the effect.
 * @throws when git knows `root` as a linked worktree: the profile would link a directory that goes when the worktree does, so the error names the main checkout to run from instead. Nothing is written.
 */
export function writeProfile(root, profile) {
  const main = mainCheckout(root)
  if (main !== null) {
    throw new Error(`this checkout is a linked worktree; a profile made here breaks when the worktree goes — run \`pnpm dsh:profile\` from the main checkout, ${main}`)
  }
  mkdirSync(profile, { recursive: true })
  for (const [file, text] of Object.entries(profileFiles(join(root, 'packages', 'binnacle')))) {
    if (file === 'cordis.patch.yml' && existsSync(join(profile, file))) continue
    writeFileSync(join(profile, file), text)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const profile = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'profiles', 'binnacle')
  try {
    writeProfile(root, profile)
  } catch (refusal) {
    console.error(`dsh:profile: ${refusal.message}`)
    process.exit(1)
  }
  execFileSync('dsh', ['plugin', '--profile', 'binnacle', 'install'], { stdio: 'inherit' })
  console.log('dsh:profile: binnacle is ready; run `pnpm build`, then `dsh --profile binnacle`')
}

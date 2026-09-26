#!/usr/bin/env node
/**
 * Create or refresh the `binnacle` dsh profile on this machine.
 *
 * The profile lives under `$DSH_HOME/profiles/binnacle` (`~/.dsh` when
 * `DSH_HOME` is unset). It links this checkout's package and stacks it over
 * `dsh-base`, so `dsh --profile binnacle` runs what `pnpm build` last built.
 * `package.json` and `cordis.yml` are this script's and rewritten each run;
 * `cordis.patch.yml` is the person's own layer — model, provider, anything
 * they override — and is written only when absent.
 * @module binnacle/scripts/profile
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const profile = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'profiles', 'binnacle')
  mkdirSync(profile, { recursive: true })
  for (const [file, text] of Object.entries(profileFiles(join(root, 'packages', 'binnacle')))) {
    if (file === 'cordis.patch.yml' && existsSync(join(profile, file))) continue
    writeFileSync(join(profile, file), text)
  }
  execFileSync('dsh', ['plugin', '--profile', 'binnacle', 'install'], { stdio: 'inherit' })
  console.log('dsh:profile: binnacle is ready; run `pnpm build`, then `dsh --profile binnacle`')
}

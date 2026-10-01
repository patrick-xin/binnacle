// commitlint reads its config as a default export, and a body or footer is prose quoting failures verbatim, so their line lengths are off.
export default {
  extends: ['@commitlint/config-conventional'],
  ignores: [(message) => /^Move the \S+ pin to /.test(message)],
  rules: {
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
}

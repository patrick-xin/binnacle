import { eslintCompatPlugin } from '@oxlint/plugins'

import { noChainedTypeAssertionsRule } from './rules/no-chained-type-assertions.ts'
import { noModuleMockingRule } from './rules/no-module-mocking.ts'
import { noReduceAccumulatorCopyRule } from './rules/no-reduce-accumulator-copy.ts'
import { noReflectApplyRule } from './rules/no-reflect-apply.ts'
import { noReflectGetRule } from './rules/no-reflect-get.ts'
import { noWidenThenAssertRule } from './rules/no-widen-then-assert.ts'
import { requireCommentForTypeAssertionRule } from './rules/require-comment-for-type-assertion.ts'

const antiSlopPlugin = eslintCompatPlugin({
  meta: { name: 'anti-slop' },
  rules: {
    'no-chained-type-assertions': noChainedTypeAssertionsRule,
    'no-module-mocking': noModuleMockingRule,
    'no-reduce-accumulator-copy': noReduceAccumulatorCopyRule,
    'no-reflect-apply': noReflectApplyRule,
    'no-reflect-get': noReflectGetRule,
    'no-widen-then-assert': noWidenThenAssertRule,
    'require-comment-for-type-assertion': requireCommentForTypeAssertionRule,
  },
})

export default antiSlopPlugin

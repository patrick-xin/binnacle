import { defineRule } from '@oxlint/plugins'

import type { ESTree, SourceCode } from '@oxlint/plugins'

type TypeAssertion = ESTree.TSAsExpression | ESTree.TSTypeAssertion

const commentOwnerKinds = new Set(['ExpressionStatement', 'PropertyDefinition', 'ReturnStatement', 'ThrowStatement', 'VariableDeclaration'])

function isConstAssertion(node: TypeAssertion): boolean {
  return (
    node.typeAnnotation.type === 'TSTypeReference' &&
    node.typeAnnotation.typeName.type === 'Identifier' &&
    node.typeAnnotation.typeName.name === 'const'
  )
}

function hasCommentBefore(sourceCode: SourceCode, owner: ESTree.Node, assertion: TypeAssertion): boolean {
  return sourceCode.getCommentsBefore(owner).some((comment) => comment.end <= assertion.start && comment.value.trim().length > 0)
}

function hasComment(sourceCode: SourceCode, node: TypeAssertion): boolean {
  let current: ESTree.Node = node
  while (true) {
    if (hasCommentBefore(sourceCode, current, node)) return true
    if (commentOwnerKinds.has(current.type)) {
      const parent = current.parent
      // The statement of a one-line `if` has its comment above the `if`.
      const wraps =
        (parent.type === 'ExportNamedDeclaration' && parent.declaration === current) ||
        (parent.type === 'IfStatement' && parent.consequent === current)
      return wraps && hasCommentBefore(sourceCode, parent, node)
    }
    if (current.parent.type === 'Program') return false
    current = current.parent
  }
}

/** Require every non-const type assertion to say, in a comment, why it is safe. */
export const requireCommentForTypeAssertionRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Require a comment before every TypeScript type assertion except const assertions.',
    },
    messages: {
      missingComment:
        'This type assertion has no comment. Say why it is safe immediately before the assertion or its containing statement.',
    },
    schema: [],
  },
  createOnce(context) {
    const checkAssertion = (node: TypeAssertion) => {
      if (isConstAssertion(node)) return
      if (hasComment(context.sourceCode, node)) return
      context.report({ node, messageId: 'missingComment' })
    }

    return {
      TSAsExpression: checkAssertion,
      TSTypeAssertion: checkAssertion,
    }
  },
})

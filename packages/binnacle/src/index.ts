/**
 * binnacle's entry: the Cordis row the bundle patch inserts.
 * @module binnacle
 */

export { apply, inject, internals, name } from './host/index.ts'
/** The types an author writes a registration against; the service itself is `ctx.binnacle`. */
export type { AuthorAdapter, Entry, Fact, Node, Registrations, View } from './host/index.ts'

# STE: how to write prose here

These rules adapt ASD-STE100 Simplified Technical English. They apply to every sentence that a person or an agent reads: replies, issues, pull requests, commit bodies, docs, folder notes, skills and comments. Code, quotations and citations keep their own form.

## Words

1. **One word, one meaning.** Use a glossary word only with its glossary meaning. For any other meaning, use a different word.
2. **One thing, one word.** Name a thing with the same word every time. Repeat the word. A synonym tells the reader that you mean a different thing.
3. **Plain words.** Use the common word. For example, write "check", not "validate" or "preflight". Write "use", not "leverage".
4. **Verbs for actions.** Write the action as a verb: "the host reads the file", not "the reading of the file is done by the host".
5. **Simple tenses.** Use the simple present, the simple past and the future: "it draws", "it drew", "it will draw". Use an "-ing" word only as a noun or an adjective: "the running call".
6. **Literal words.** Say what happens. For example, write "is merged", not "lands".
7. **New terms.** Give a new term its meaning in the sentence where it first appears. Add it to the glossary in the same change.

## Noun clusters

8. **Three words at most.** "review reasoning level" is the limit. For a longer cluster, use "of", "for" or a verb: "the reasoning level for a review".

## Sentences

9. **One topic per sentence.** Write a second topic as a second sentence.
10. **Length.** A step has 20 words or fewer. A description has 25 words or fewer.
11. **Complete sentences.** Keep the articles, the verbs and the connecting words: "The edges stay, and keys page the text", not "edges kept, text paged by keys".
12. **Active voice.** Name who does the action: "The reviewer found two problems", not "two problems were found".

## Steps

13. **One instruction per step.** Number the steps, in the order the reader does them.
14. **Imperative.** Start a step with its verb: "Run `pnpm test`."
15. **Condition first.** Put the condition before the action: "If the gate fails, read its error."
16. **Warning first.** Put a warning before the step it applies to.

## Answers and descriptions

17. **Most important information first.** Start with the answer: yes or no, the result, the blocker, or the decision needed. Put the evidence after it.
18. **A clear "no".** If the answer is "no" or "partly", start with that word, and then give the gap.
19. **Decisions with labels.** Ask for a decision with labelled options. Give one reason for each option, and say which one you recommend.
20. **Short paragraphs.** A paragraph has one topic and six sentences or fewer.
21. **Lists for three or more.** Write three or more parallel items as a list, one item on each line.

## Punctuation

22. **Periods, not semicolons.** Write two sentences, or a list.
23. **Short brackets.** Put only a short note in brackets. A note that has a verb is a sentence of its own.
24. **Dashes.** Use a dash only in a table cell or in a list label.

## Titles

25. **A title is a sentence.** An issue title and a pull request title each have a subject and a verb: "An ask keeps its edges when it is too tall."

import { json } from '@codemirror/lang-json'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { AlertCircle, WandSparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

interface JsonEditorProps {
  value: unknown
  onChange: (value: unknown, isValid: boolean) => void
  className?: string
  minHeight?: string
}

/**
 * Editor chrome built from theme tokens (CSS variables), so the same theme
 * serves light and dark without a second palette.
 */
const editorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--color-card)',
    color: 'var(--color-foreground)',
    fontSize: '12px',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.25rem',
  },
  '.cm-content': {
    caretColor: 'var(--color-foreground)',
    padding: '10px 0',
  },
  '.cm-line': {
    padding: '0 12px',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--color-card)',
    color: 'var(--color-faint)',
    border: 'none',
    borderRight: '1px solid var(--color-border)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 10px 0 12px',
    minWidth: '2.25rem',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--color-muted)',
    color: 'var(--color-muted-foreground)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--color-muted) 70%, transparent)',
  },
  '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground':
    {
      backgroundColor: 'color-mix(in srgb, var(--color-signal) 24%, transparent) !important',
    },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--color-foreground)',
  },
  '&.cm-focused .cm-matchingBracket': {
    backgroundColor: 'var(--color-accent)',
    outline: '1px solid var(--color-border-strong)',
  },
  '&.cm-focused .cm-nonmatchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--color-status-danger) 18%, transparent)',
  },
  // Syntax: keys stay ink, values carry colour (same palette as JsonViewer).
  '.cm-json-key': { color: 'var(--color-foreground)' },
  '.cm-json-string': { color: 'var(--color-status-success)' },
  '.cm-json-number': { color: 'var(--color-status-active)' },
  '.cm-json-keyword': { color: 'var(--color-status-priority)' },
  '.cm-json-punctuation': { color: 'var(--color-faint)' },
})

const JSON_TOKEN =
  /("(?:[^"\\]|\\.)*")(\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}[\],:]/g

const tokenMarks = {
  key: Decoration.mark({ class: 'cm-json-key' }),
  string: Decoration.mark({ class: 'cm-json-string' }),
  number: Decoration.mark({ class: 'cm-json-number' }),
  keyword: Decoration.mark({ class: 'cm-json-keyword' }),
  punctuation: Decoration.mark({ class: 'cm-json-punctuation' }),
}

const jsonTokenDecorator = new MatchDecorator({
  regexp: JSON_TOKEN,
  decorate: (add, from, to, match) => {
    const text = match[0]
    if (match[1]) {
      const stringEnd = from + match[1].length
      add(from, stringEnd, match[2] ? tokenMarks.key : tokenMarks.string)
      if (match[2]) add(to - 1, to, tokenMarks.punctuation)
      return
    }
    if (text === 'true' || text === 'false' || text === 'null') {
      add(from, to, tokenMarks.keyword)
      return
    }
    add(from, to, /^[{}[\],:]$/.test(text) ? tokenMarks.punctuation : tokenMarks.number)
  },
})

/** Token colouring without a highlight-style dependency: classes map to theme tokens above. */
const jsonTokenHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = jsonTokenDecorator.createDeco(view)
    }

    update(update: ViewUpdate) {
      this.decorations = jsonTokenDecorator.updateDeco(update, this.decorations)
    }
  },
  { decorations: (plugin) => plugin.decorations }
)

export function JsonEditor({ value, onChange, className, minHeight = '200px' }: JsonEditorProps) {
  const initialText = useMemo(() => JSON.stringify(value, null, 2), [value])
  const [text, setText] = useState(initialText)
  const [error, setError] = useState<string | null>(null)
  const lastCommittedTextRef = useRef(initialText)
  const formatTextRef = useRef<() => void>(() => {})
  const hasErrorRef = useRef(false)

  useEffect(() => {
    if (initialText === lastCommittedTextRef.current) {
      return
    }

    setText(initialText)
    setError(null)
    lastCommittedTextRef.current = initialText
  }, [initialText])

  const applyText = useCallback(
    (nextText: string) => {
      setText(nextText)

      try {
        const parsed = JSON.parse(nextText)
        const normalized = JSON.stringify(parsed, null, 2)
        setError(null)
        lastCommittedTextRef.current = normalized
        onChange(parsed, true)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid JSON'
        setError(message)
        onChange(value, false)
      }
    },
    [onChange, value]
  )

  const formatText = useCallback(() => {
    try {
      const parsed = JSON.parse(text)
      const formatted = JSON.stringify(parsed, null, 2)
      setText(formatted)
      setError(null)
      lastCommittedTextRef.current = formatted
      onChange(parsed, true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid JSON'
      setError(message)
      onChange(value, false)
    }
  }, [onChange, text, value])

  formatTextRef.current = formatText
  hasErrorRef.current = error !== null

  const extensions = useMemo(
    () => [
      json(),
      editorTheme,
      jsonTokenHighlighter,
      EditorView.lineWrapping,
      keymap.of([
        {
          key: 'Mod-Shift-f',
          preventDefault: true,
          run: () => {
            formatTextRef.current()
            return true
          },
        },
      ]),
      EditorView.domEventHandlers({
        blur: () => {
          if (!hasErrorRef.current) {
            formatTextRef.current()
          }
        },
      }),
    ],
    []
  )

  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        className={cn(
          'overflow-hidden rounded-lg border bg-card transition-colors focus-within:border-border-strong',
          error && 'border-status-danger/50 focus-within:border-status-danger/60'
        )}
      >
        <div className="flex min-h-9 items-center gap-2 border-b bg-muted/50 py-1 pl-3 pr-1.5">
          <span className="eyebrow">JSON</span>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-[11px] font-medium',
              error ? 'text-status-danger' : 'text-muted-foreground'
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                error ? 'bg-status-danger' : 'bg-status-success'
              )}
              aria-hidden
            />
            {error ? 'Invalid JSON' : 'Valid JSON'}
          </span>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden items-center gap-0.5 sm:flex" aria-hidden>
              <Kbd>⌘</Kbd>
              <Kbd>⇧</Kbd>
              <Kbd>F</Kbd>
            </span>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={formatText}
              title="Format JSON (Cmd/Ctrl+Shift+F)"
              className="h-7 px-2 text-foreground"
            >
              <WandSparkles className="h-3.5 w-3.5" />
              Format
            </Button>
          </div>
        </div>

        <CodeMirror
          value={text}
          height="auto"
          minHeight={minHeight}
          // Long payloads scroll inside the editor so a dialog's footer stays in reach.
          maxHeight="min(52vh, 440px)"
          theme="none"
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
            syntaxHighlighting: false,
            tabSize: 2,
          }}
          indentWithTab
          extensions={extensions}
          onChange={applyText}
          className="[&_.cm-editor]:rounded-none"
          aria-label="Payload"
        />
      </div>

      {error ? (
        <p className="flex items-start gap-1.5 text-xs text-status-danger">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 break-words font-mono">{error}</span>
        </p>
      ) : null}
    </div>
  )
}

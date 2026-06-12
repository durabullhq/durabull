import { AlertCircle, CheckCircle2, WandSparkles } from 'lucide-react'
import { json } from '@codemirror/lang-json'
import { EditorView, keymap } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface JsonEditorProps {
  value: unknown
  onChange: (value: unknown, isValid: boolean) => void
  className?: string
  minHeight?: string
}

const payloadEditorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#0b1220',
      fontSize: '14px',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-scroller': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      lineHeight: '1.5rem',
    },
    '.cm-content': {
      caretColor: '#e2e8f0',
      padding: '12px 0',
    },
    '.cm-gutters': {
      backgroundColor: '#050b16',
      color: '#64748b',
      borderRight: '1px solid rgba(255, 255, 255, 0.1)',
      paddingRight: '8px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(56, 189, 248, 0.08)',
      color: '#94a3b8',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(56, 189, 248, 0.06)',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(56, 189, 248, 0.22) !important',
    },
    '.cm-cursor': {
      borderLeftColor: '#e2e8f0',
    },
  },
  { dark: true }
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
      payloadEditorTheme,
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
    <div className={cn('space-y-2', className)}>
      <div className="overflow-hidden rounded-lg border border-border/70 bg-[hsl(220_10%_6%)] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.03] px-3 py-2.5">
          <div className="space-y-0.5">
            <div className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-white/50">
              Payload Editor
            </div>
            <div className="text-xs text-white/40">
              Tab to indent, Shift+Tab to outdent, Cmd/Ctrl+Shift+F to format.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium',
                error
                  ? 'bg-status-danger/15 text-status-danger'
                  : 'bg-status-success/15 text-status-success'
              )}
            >
              {error ? (
                <AlertCircle className="h-3.5 w-3.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {error ? 'Invalid JSON' : 'Valid JSON'}
            </span>
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={formatText}
              className="border border-white/10 bg-white/10 text-white/80 hover:bg-white/15 hover:text-white"
            >
              <WandSparkles className="mr-1.5 h-3.5 w-3.5" />
              Format
            </Button>
          </div>
        </div>

        <CodeMirror
          value={text}
          height="auto"
          minHeight={minHeight}
          theme="dark"
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
            tabSize: 2,
          }}
          indentWithTab
          extensions={extensions}
          onChange={applyText}
          className="[&_.cm-editor]:rounded-none [&_.cm-editor]:bg-transparent"
          aria-label="Payload"
        />
      </div>

      {error ? (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  )
}

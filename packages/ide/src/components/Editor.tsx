import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView, placeholder, type ViewUpdate } from '@codemirror/view';
import { useDispatch, useSelector } from 'react-redux';
import { useTheme } from 'styled-components';
import { m68kLanguage } from '@/editor/m68kLanguage';
import { useEmulatorStore } from '@/stores/emulatorStore';
import { setEditorCursorPosition, type AppDispatch, type RootState } from '@/store';

const Editor: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { editorCode, setEditorCode } = useEmulatorStore();
  const lineNumbers = useSelector((state: RootState) => state.settings.lineNumbers);
  const theme = useTheme();

  const extensions = React.useMemo(
    () => [m68kLanguage, EditorView.lineWrapping, placeholder('Enter M68K assembly code...')],
    []
  );

  const handleCodeChange = React.useCallback(
    (value: string): void => {
      setEditorCode(value);
      window.editorCode = value;
    },
    [setEditorCode]
  );

  React.useEffect(() => {
    window.editorCode = editorCode;
  }, [editorCode]);

  const handleUpdate = React.useCallback(
    (viewUpdate: ViewUpdate): void => {
      if (!viewUpdate.selectionSet && !viewUpdate.docChanged) {
        return;
      }

      const head = viewUpdate.state.selection.main.head;
      const line = viewUpdate.state.doc.lineAt(head);

      dispatch(
        setEditorCursorPosition({
          line: line.number,
          column: head - line.from + 1,
        })
      );
    },
    [dispatch]
  );

  return (
    <div className="editor-container pane-surface">
      <CodeMirror
        aria-label="M68K Assembly Editor"
        basicSetup={{
          lineNumbers,
          foldGutter: false,
          dropCursor: false,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
        }}
        className="editor-code-mirror"
        data-testid="assembly-editor"
        extensions={extensions}
        height="100%"
        onChange={handleCodeChange}
        onUpdate={handleUpdate}
        theme={theme.theme}
        value={editorCode}
      />
    </div>
  );
};

export default Editor;

import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { gas } from '@codemirror/legacy-modes/mode/gas';
import { EditorView, placeholder } from '@codemirror/view';
import { useSelector } from 'react-redux';
import { useTheme } from 'styled-components';
import { useEmulatorStore } from '@/stores/emulatorStore';
import type { RootState } from '@/store';

const assemblyLanguage = StreamLanguage.define(gas);

const Editor: React.FC = () => {
  const { editorCode, setEditorCode } = useEmulatorStore();
  const lineNumbers = useSelector((state: RootState) => state.settings.lineNumbers);
  const theme = useTheme();

  const extensions = React.useMemo(
    () => [assemblyLanguage, EditorView.lineWrapping, placeholder('Enter M68K assembly code...')],
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

  return (
    <div className="editor-container">
      <div className="editor-header">
        <div>
          <h3 className="editor-title">Assembly Editor</h3>
          <p className="editor-subtitle">CodeMirror editor with the active IDE theme driving syntax, chrome, and layout.</p>
        </div>
      </div>
      <div className="editor-surface">
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
          theme={theme.theme}
          value={editorCode}
        />
      </div>
    </div>
  );
};

export default Editor;

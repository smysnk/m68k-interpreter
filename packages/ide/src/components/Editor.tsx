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
  );
};

export default Editor;

import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";

interface NoteEditorProps {
  /** The artifact's markdown source (the single source of truth). */
  markdown: string;
  /** Called with updated markdown as the user types in the document. */
  onChange: (markdown: string) => void;
}

/**
 * A WYSIWYG document editor for markdown artifacts - notes are edited in
 * place like a document, not through the code pane. Content round-trips
 * as markdown through tiptap-markdown, so saves, version history, AI edits,
 * and MCP live-sync all keep operating on plain .md source.
 */
export function NoteEditor({ markdown, onChange }: NoteEditorProps) {
  // Tracks what this editor last emitted, so external source changes (Monaco
  // typing, MCP edits, version restores) can be told apart from our own echo.
  const lastEmitted = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({
        html: false, // treat raw HTML in notes as text, not markup (keeps app DOM safe)
        linkify: true,
      }),
    ],
    content: markdown,
    autofocus: "end", // opening a note is ready to type, no click needed
    onUpdate({ editor }) {
      const md: string = editor.storage.markdown.getMarkdown();
      lastEmitted.current = md;
      onChange(md);
    },
  });

  // Apply external changes (AI edit, restore, code-pane typing) into the doc.
  useEffect(() => {
    if (!editor) return;
    if (markdown === lastEmitted.current) return;
    const current: string = editor.storage.markdown.getMarkdown();
    if (markdown !== current) {
      editor.commands.setContent(markdown);
    }
  }, [markdown, editor]);

  return (
    <div className="note-editor">
      <EditorContent editor={editor} />
    </div>
  );
}

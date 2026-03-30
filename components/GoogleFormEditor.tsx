"use client";

import React, { useCallback, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Link as LinkIcon,
  List,
  ListOrdered,
  RemoveFormatting,
} from "lucide-react";
import { sanitizeRichText } from "@/lib/rich-text";

interface GoogleFormEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const extensions = [
  StarterKit.configure({
    heading: false,
    codeBlock: false,
    code: false,
    blockquote: false,
    horizontalRule: false,
    hardBreak: false,
  }),
  Underline,
  Link.configure({
    openOnClick: false,
    HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
  }),
];

function GoogleFormEditorInner({ value, onChange, placeholder = "Description (optional)" }: GoogleFormEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      ...extensions,
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "outline-none min-h-[1.5rem] text-sm text-gray-500 prose prose-sm max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_a]:text-indigo-600 [&_a]:underline",
      },
      handlePaste: (_view, event) => {
        // Let Tiptap handle the paste, then sanitize
        const html = event.clipboardData?.getData("text/html");
        if (html) {
          // Tiptap will parse — we sanitize on output via onUpdate
          return false; // let default handling proceed
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = sanitizeRichText(ed.getHTML());
      onChange(html);
    },
  });

  // Sync external value changes (e.g., undo/redo from parent)
  useEffect(() => {
    if (!editor) return;
    const current = sanitizeRichText(editor.getHTML());
    if (value !== current) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href;
    const url = window.prompt("URL", prev || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const clearFormatting = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().clearNodes().unsetAllMarks().run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="group/editor">
      {/* Editor area with green focus border */}
      <div className="border-b-2 border-transparent transition-colors duration-200 focus-within:border-[#2e7d32]">
        <EditorContent editor={editor} />
      </div>
      {/* Toolbar — visible on focus-within */}
      <div className="flex items-center gap-0.5 pt-1 opacity-0 transition-opacity duration-150 group-focus-within/editor:opacity-100">
        <ToolbarBtn
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline"
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive("link")}
          onClick={setLink}
          title="Link"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <div className="mx-0.5 h-4 w-px bg-gray-200" />
        <ToolbarBtn
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered List"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bulleted List"
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <div className="mx-0.5 h-4 w-px bg-gray-200" />
        <ToolbarBtn active={false} onClick={clearFormatting} title="Clear Formatting">
          <RemoveFormatting className="h-3.5 w-3.5" />
        </ToolbarBtn>
      </div>
    </div>
  );
}

function ToolbarBtn({ active, onClick, title, children }: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // prevent editor blur
      onClick={onClick}
      title={title}
      className={`rounded p-1 transition-colors ${active ? "bg-gray-200 text-gray-900" : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"}`}
    >
      {children}
    </button>
  );
}

const GoogleFormEditor = React.memo(GoogleFormEditorInner);
export default GoogleFormEditor;

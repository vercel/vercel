"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Note, apiBase } from "../../lib/api";
import DeleteButton from "./DeleteButton";

export default function NoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [note, setNote] = useState<Note | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/notes/${id}/`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setNote);
  }, [id]);

  if (!note) return null;

  const created = new Date(note.created_at).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
  const updated = new Date(note.updated_at).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{note.title}</h1>
          <p className="note-meta">
            Created {created}
            {note.updated_at !== note.created_at && ` · Updated ${updated}`}
          </p>
        </div>
        <div className="btn-group">
          <Link href={`/notes/${note.id}/edit`} className="btn">Edit</Link>
          <Link href="/" className="btn">← All Notes</Link>
        </div>
      </div>

      <div className="card" style={{ maxWidth: "680px" }}>
        <p className="note-body">{note.body}</p>
      </div>

      <hr className="divider" />

      <DeleteButton id={note.id} />
    </>
  );
}

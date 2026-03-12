"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Note, apiBase } from "./lib/api";

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    fetch(`${apiBase}/notes/`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setNotes);
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>All Notes</h1>
          <p className="subtitle">
            {notes.length} note{notes.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/notes/new" className="btn btn-primary">
          + New Note
        </Link>
      </div>

      {notes.length > 0 ? (
        <div className="card-grid">
          {notes.map((note) => (
            <Link key={note.id} href={`/notes/${note.id}`} className="card-link">
              <div className="card">
                <h3>{note.title}</h3>
                <p>{note.body.slice(0, 100)}{note.body.length > 100 ? "…" : ""}</p>
                <p style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#444444" }}>
                  {new Date(note.created_at).toLocaleDateString("en-US", {
                    month: "short", day: "numeric", year: "numeric",
                  })}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>No notes yet.</p>
        </div>
      )}
    </>
  );
}

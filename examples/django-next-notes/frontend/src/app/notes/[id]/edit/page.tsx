"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, use } from "react";
import { Note, apiBase } from "../../../lib/api";

export default function EditNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${apiBase}/notes/${id}/`)
      .then((r) => r.json())
      .then((note: Note) => {
        setTitle(note.title);
        setBody(note.body);
      });
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch(`${apiBase}/notes/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    if (!res.ok) {
      setError("Failed to save note.");
      return;
    }
    router.push(`/notes/${id}`);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Edit Note</h1>
          <p className="subtitle">Editing &ldquo;{title}&rdquo;</p>
        </div>
        <Link href={`/notes/${id}`} className="btn">Cancel</Link>
      </div>

      <div className="form-card">
        {error && (
          <div style={{ color: "#ff6b6b", marginBottom: "1rem", fontSize: "0.875rem" }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="body">Body</label>
            <textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
            />
          </div>
          <div className="btn-group" style={{ marginTop: "1.5rem" }}>
            <button type="submit" className="btn btn-primary">Save Note</button>
          </div>
        </form>
      </div>
    </>
  );
}

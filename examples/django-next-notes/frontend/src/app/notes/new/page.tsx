"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { apiBase } from "../../lib/api";

export default function NewNotePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch(`${apiBase}/notes/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    if (!res.ok) {
      setError("Failed to create note.");
      return;
    }
    const note = await res.json();
    router.push(`/notes/${note.id}`);
  }

  return (
    <>
      <div className="page-header">
        <h1>Create Note</h1>
        <Link href="/" className="btn">Cancel</Link>
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
              placeholder="Note title"
              required
              autoFocus
            />
          </div>
          <div className="form-field">
            <label htmlFor="body">Body</label>
            <textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your note here..."
              rows={8}
            />
          </div>
          <div className="btn-group" style={{ marginTop: "1.5rem" }}>
            <button type="submit" className="btn btn-primary">Create Note</button>
          </div>
        </form>
      </div>
    </>
  );
}

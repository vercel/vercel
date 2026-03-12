"use client";

import { useRouter } from "next/navigation";
import { apiBase } from "../../lib/api";

export default function DeleteButton({ id }: { id: number }) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm("Delete this note?")) return;
    await fetch(`${apiBase}/notes/${id}/`, { method: "DELETE" });
    router.push("/");
  }

  return (
    <button className="btn btn-danger" onClick={handleDelete}>
      Delete note
    </button>
  );
}

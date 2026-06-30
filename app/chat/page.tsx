"use client";

import { useState, useRef, useEffect } from "react";

type Role = "user" | "assistant";

interface Message {
  role: Role;
  content: string;
}

const SUGGESTIONS = [
  "Show me the dashboard summary",
  "Who are the most recent users?",
  "List all pending payment requests",
  "Show recent transactions",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;

    const userMessage: Message = { role: "user", content: text };
    const next = [...messages, userMessage];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      setMessages([...next, { role: "assistant", content: data.content ?? "No response." }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Error: failed to reach the server." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
            C
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">c1pay Analytics</h1>
            <p className="text-xs text-zinc-500">Powered by Groq · Llama 3.3 70B</p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full pt-16 gap-6">
              <p className="text-zinc-400 text-sm">Ask anything about your c1pay data</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-700 dark:text-zinc-300 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                  m.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-bl-sm"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1.5 items-center h-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-4">
        <form
          className="max-w-3xl mx-auto flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about users, transactions, payment requests..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

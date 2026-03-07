"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, Loader2, Sparkles } from "lucide-react";
import { sendHeliosMessage } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  "Give me an overview with action plan",
  "Where are the hotspots and what's clustered nearby?",
  "What are the top threats right now?",
  "Any escalation patterns or trends?",
];

function MiniMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      elements.push(
        <h3
          key={i}
          className="font-heading text-[11px] tracking-widest text-primary mt-3 mb-1 first:mt-0"
        >
          {line.slice(3)}
        </h3>
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <h2
          key={i}
          className="font-heading text-xs tracking-widest text-primary mt-3 mb-1 first:mt-0"
        >
          {line.slice(2)}
        </h2>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <li
          key={i}
          className="text-[11px] text-foreground/90 leading-relaxed ml-3 list-disc"
        >
          <InlineBold text={line.slice(2)} />
        </li>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-1.5" />);
    } else {
      elements.push(
        <p key={i} className="text-[11px] text-foreground/90 leading-relaxed">
          <InlineBold text={line} />
        </p>
      );
    }
  }

  return <>{elements}</>;
}

function InlineBold({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export function HeliosChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const reply = await sendHeliosMessage(text.trim());
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Failed to reach HELIOS"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full -m-3">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
            <Bot className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <p className="font-mono text-[10px] font-bold tracking-widest text-foreground">
              HELIOS
            </p>
            <p className="font-mono text-[8px] text-muted-foreground">
              AI Intelligence Analyst
            </p>
          </div>
          <span className="ml-auto flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-[8px] text-emerald-500">ONLINE</span>
          </span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-3 py-2 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Sparkles className="w-8 h-8 text-primary/30 mb-3" />
            <p className="font-mono text-[10px] text-muted-foreground mb-1">
              Ask HELIOS about the current situation
            </p>
            <p className="font-mono text-[8px] text-muted-foreground/60 mb-4">
              Powered by live ACLED event data
            </p>
            <div className="flex flex-col gap-1.5 w-full max-w-[260px]">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="text-left px-3 py-2 rounded-md border border-border bg-background hover:bg-muted/50 hover:border-primary/30 transition-colors"
                >
                  <span className="font-mono text-[10px] text-foreground/80">
                    {s}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`${
              msg.role === "user" ? "flex justify-end" : ""
            }`}
          >
            {msg.role === "user" ? (
              <div className="bg-primary/15 border border-primary/20 rounded-md px-3 py-2 max-w-[85%]">
                <p className="font-mono text-[11px] text-foreground">
                  {msg.content}
                </p>
              </div>
            ) : (
              <div className="bg-card/80 border border-border rounded-md px-3 py-2">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Bot className="w-3 h-3 text-primary" />
                  <span className="font-mono text-[8px] tracking-widest text-primary">
                    HELIOS
                  </span>
                </div>
                <MiniMarkdown text={msg.content} />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="bg-card/80 border border-border rounded-md px-3 py-3">
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
              <span className="font-mono text-[10px] text-muted-foreground">
                Analyzing intelligence data...
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-border flex-shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask HELIOS..."
            disabled={loading}
            className="flex-1 h-8 rounded-md border border-border bg-background px-3 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="h-8 w-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors flex-shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
